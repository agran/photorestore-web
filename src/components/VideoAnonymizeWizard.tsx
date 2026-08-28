import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Pause,
  Download,
  X,
  Settings2,
  Square,
  FilePlus2,
  Pencil,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from './ui/button';
import AnonymizeModeSwitch from './AnonymizeModeSwitch';
import { useVideoAnonymizeStore, type VideoAnonymizeQuality } from '@/store/videoAnonymizeStore';
import { getModelsByPipeline, formatModelSize, modelRuntimeLabel } from '@/ml/modelRegistry';
import { anonymizeVideo, type TrackMeta, type KeyframeData } from '@/ml/pipelines/anonymizeVideo';
import { downloadUrl } from '@/lib/download';
import { toast } from '@/hooks/useToast';
import { applyBlur, applyPixelate } from '@/ml/utils/anonymizeEffects';
import type { AnonymizeEffect, AnonymizeMode } from '@/ml/utils/anonymizeEffects';

interface VideoAnonymizeWizardProps {
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoAnonymizeWizard({ onClose }: VideoAnonymizeWizardProps) {
  const { t } = useTranslation();
  const store = useVideoAnonymizeStore();
  const {
    step,
    videoUrl,
    duration,
    fps,
    width,
    height,
    effect,
    mode,
    blurRadius,
    pixelateSize,
    solidColor,
    modelId,
    padding,
    feather,
    maskShape,
    progress,
    outputUrl,
    emojiInput,
    emojiRandom,
    quality,
    bodyTracking,
    outputExt,
    trackMetas,
    excludedTrackIds,
  } = store;

  const [isProcessing, setIsProcessing] = useState(false);
  const [eta, setEta] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  // Whole-frame mode: live preview of the effect on the current video frame.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewFull, setPreviewFull] = useState(true);
  const [videoTime, setVideoTime] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const anonymizeModels = getModelsByPipeline('anonymize');

  const handleOpenAnother = useCallback(() => {
    replaceInputRef.current?.click();
  }, []);

  const handleReplaceFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      store.loadFile(file).catch((err: unknown) => {
        toast({
          title: t('errors.pipelineFailed'),
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      });
    },
    [store, t]
  );

  const handleEditAgain = useCallback(() => {
    store.editAgain();
  }, [store]);

  const handleModeChange = useCallback(
    (m: AnonymizeMode) => {
      store.setMode(m);
      // Whole-frame mode offers only blur/pixelate — reset anything else so
      // the <select> never renders with a value that isn't among its options.
      if (m === 'full' && effect !== 'blur' && effect !== 'pixelate') {
        store.setEffect('blur');
      }
    },
    [store, effect]
  );

  // Live whole-frame preview: draw the current video frame with the effect
  // applied into an overlay canvas. Redraws (debounced) when sliders move,
  // when the user seeks, and — throttled to ~4 fps — while playing.
  useEffect(() => {
    if (mode !== 'full' || step !== 'loaded' || !previewFull) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const draw = () => {
      if (cancelled) return;
      const canvas = previewCanvasRef.current;
      if (!canvas || video.readyState < 2 || !video.videoWidth) return;
      const cW = video.videoWidth;
      const cH = video.videoHeight;
      canvas.width = cW;
      canvas.height = cH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, cW, cH);
      // Same geometry as the pipeline's whole-frame mode: raw slider values,
      // rectangular full-canvas region without padding/feather.
      const box = { x: 0, y: 0, width: cW, height: cH, confidence: 1 };
      if (effect === 'blur') {
        applyBlur(ctx, canvas, box, blurRadius, 0, 0, 'rect', cW, cH);
      } else if (effect === 'pixelate') {
        applyPixelate(ctx, canvas, box, Math.max(1, pixelateSize), 0, 0, 'rect', cW, cH);
      }
    };

    const schedule = (delay: number) => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(draw, delay);
    };

    // Debounce slider drags so the UI doesn't stutter on big frames.
    schedule(80);

    const onSeeked = () => schedule(0);
    const onLoadedData = () => schedule(0);
    let lastPlayUpdate = 0;
    const onTimeUpdate = () => {
      const now = performance.now();
      if (now - lastPlayUpdate < 250) return;
      lastPlayUpdate = now;
      schedule(0);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [mode, step, previewFull, effect, blurRadius, pixelateSize, videoUrl]);

  // Pause when the preview is switched on so the overlay matches the visible
  // frame; playback can still be resumed with the custom controls below.
  useEffect(() => {
    if (mode === 'full' && step === 'loaded' && previewFull) {
      videoRef.current?.pause();
    }
  }, [mode, step, previewFull]);

  // Track playback state/time for the custom controls shown above the
  // whole-frame preview overlay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => setVideoTime(video.currentTime);
    const onLoadedMetadata = () => setVideoTime(video.currentTime || 0);
    const onPlay = () => setVideoPlaying(true);
    const onPause = () => setVideoPlaying(false);
    const onEnded = () => setVideoPlaying(false);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoUrl, step]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {
        /* user gesture required — ignore */
      });
    } else {
      video.pause();
    }
  }, []);

  const handleSeek = useCallback((t: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = t;
  }, []);

  const handleProcess = useCallback(async () => {
    const file = store.file;
    if (!file) return;
    setIsProcessing(true);
    setEta(0);
    store.setStep('processing');
    store.setAborted(false);
    store.setStartTime(performance.now());

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const capturedTrackMetas: TrackMeta[] = [];
      const capturedKeyframeData: KeyframeData[] = [];
      const isReProcess = store.excludedTrackIds.size > 0;
      const blob = await anonymizeVideo(file, {
        mode,
        modelId,
        quality,
        bodyTracking: mode === 'full' ? false : bodyTracking,
        videoDuration: store.duration,
        videoFps: store.fps,
        effectOptions: {
          effect,
          blurRadius,
          pixelateSize,
          solidColor,
          padding,
          feather,
          maskShape,
          emoji: emojiInput || '😶',
        },
        onProgress: (p) => store.setProgress(p),
        onEta: (s) => setEta(s),
        signal: controller.signal,
        excludeTrackIds: isReProcess ? store.excludedTrackIds : undefined,
        storedKeyframes: isReProcess ? (store.keyframeData ?? undefined) : undefined,
        onKeyframeData: isReProcess
          ? undefined
          : (kf) => {
              capturedKeyframeData.push(...kf);
            },
        onTrackMeta: (metas) => {
          capturedTrackMetas.push(...metas);
        },
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const ext = blob.type === 'video/mp4' ? 'mp4' : blob.type === 'video/webm' ? 'webm' : 'mp4';

      // First pass (no exclusions): store keyframe data and enter review step if tracks were found
      if (!isReProcess && capturedTrackMetas.length > 0) {
        store.setOutput(blob, url, ext);
        store.setKeyframeData(capturedKeyframeData);
        store.enterReview(capturedTrackMetas);
      } else {
        store.setOutput(blob, url, ext);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      toast({
        title: t('errors.pipelineFailed'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      store.setStep('loaded');
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  }, [
    store,
    mode,
    modelId,
    quality,
    bodyTracking,
    effect,
    blurRadius,
    pixelateSize,
    solidColor,
    padding,
    feather,
    maskShape,
    emojiInput,
    t,
  ]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    store.setAborted(true);
    store.setStep('loaded');
  }, [store]);

  const handleApplyExcluding = useCallback(() => {
    store.reProcessWithExclusions();
    // Trigger re-processing in the loaded step automatically
    setTimeout(() => {
      void handleProcess();
    }, 0);
  }, [store, handleProcess]);

  const handleDownload = useCallback(() => {
    if (outputUrl) {
      const baseName = (store.file?.name ?? 'video').replace(/\.[^.]+$/, '');
      downloadUrl(outputUrl, `${baseName}_anonymized.${outputExt}`);
    }
  }, [outputUrl, outputExt, store.file]);

  // Whole-frame preview is active: the canvas overlay covers the source
  // video, so native controls are replaced with a custom bar on top.
  const fullPreviewActive = mode === 'full' && step === 'loaded' && previewFull;

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b">
        <span className="text-sm font-medium truncate">
          {mode === 'full' ? t('anonymize.videoTitleFull') : t('anonymize.videoTitle')}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <input
            ref={replaceInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleReplaceFile}
          />
          {!isProcessing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleOpenAnother}
              title={t('anonymize.openAnotherVideo')}
            >
              <FilePlus2 className="h-4 w-4" />
            </Button>
          )}
          {outputUrl && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              title={t('common.download')}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} title={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-hidden p-2 min-h-0">
        {/* Video preview — output only on 'done', otherwise the source video.
            `key` forces a fresh DOM <video> when the source URL changes; without
            it React reuses the element and the previous frame can flash before
            the new src loads. */}
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-lg bg-muted">
          {(step === 'done' || step === 'review') && outputUrl ? (
            <video
              key={outputUrl}
              src={outputUrl}
              controls
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : videoUrl ? (
            <>
              <video
                key={videoUrl}
                ref={videoRef}
                src={videoUrl}
                controls={!fullPreviewActive}
                className="absolute inset-0 w-full h-full object-contain"
              />
              {fullPreviewActive && (
                <canvas
                  ref={previewCanvasRef}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              )}
              {fullPreviewActive && (
                <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-black/60 px-2 py-1.5 text-xs text-white">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white/10"
                    title={videoPlaying ? t('common.pause') : t('common.play')}
                  >
                    {videoPlaying ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="shrink-0 tabular-nums">{formatDuration(videoTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={Math.min(videoTime, duration || 0)}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    className="h-1 flex-1"
                  />
                  <span className="shrink-0 tabular-nums">{formatDuration(duration)}</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Info row */}
        {step === 'loaded' && (
          <div className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{formatDuration(duration)}</span>
            <span>{fps}fps</span>
            <span>
              {width}×{height}
            </span>
            {outputUrl && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                onClick={() => store.showResult()}
              >
                ← {t('anonymize.backToResult')}
              </button>
            )}
          </div>
        )}

        {/* Progress bar */}
        {isProcessing && (
          <div className="flex-shrink-0 space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t('common.processing')} {progress}%
              </span>
              {eta > 0 && <span>~{eta}s</span>}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-xs text-destructive"
                onClick={handleCancel}
              >
                <Square className="h-3 w-3" />
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}

        {/* Effect controls */}
        {step === 'loaded' && (
          <div className="flex-shrink-0 space-y-2 text-xs">
            <AnonymizeModeSwitch
              mode={mode}
              onChange={handleModeChange}
              disabled={isProcessing}
              fullLabelKey="anonymize.modeFullVideo"
            />

            {mode === 'full' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      className="h-7 rounded border border-input bg-background px-1 text-xs"
                      value={effect}
                      onChange={(e) => store.setEffect(e.target.value as AnonymizeEffect)}
                      disabled={isProcessing}
                    >
                      <option value="blur">{t('anonymize.effects.blur')}</option>
                      <option value="pixelate">{t('anonymize.effects.pixelate')}</option>
                    </select>
                  </div>
                  {effect === 'blur' && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-14 shrink-0">{t('anonymize.blurRadius')}</span>
                      <input
                        type="range"
                        min={2}
                        max={40}
                        value={blurRadius}
                        onChange={(e) => store.setBlurRadius(Number(e.target.value))}
                        className="h-4 flex-1"
                      />
                      <span className="w-5 text-right tabular-nums">{blurRadius}</span>
                    </label>
                  )}
                  {effect === 'pixelate' && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-14 shrink-0">{t('anonymize.pixelateSize')}</span>
                      <input
                        type="range"
                        min={1}
                        max={48}
                        value={pixelateSize}
                        onChange={(e) => store.setPixelateSize(Number(e.target.value))}
                        className="h-4 flex-1"
                      />
                      <span className="w-5 text-right tabular-nums">{pixelateSize}</span>
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={previewFull}
                      onChange={(e) => setPreviewFull(e.target.checked)}
                      className="h-3 w-3 rounded"
                    />
                    <Eye className="h-3 w-3" />
                    {t('anonymize.preview')}
                  </label>
                  <span className="text-muted-foreground">
                    {t('anonymize.videoFullPreviewHint')}
                  </span>
                </div>
                <Button
                  className="w-full gap-2 h-9 text-sm"
                  onClick={() => void handleProcess()}
                  disabled={isProcessing}
                >
                  <Play className="h-4 w-4" />
                  {t('common.process')}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="min-w-0 flex-1">
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={modelId}
                      onChange={(e) => store.setModelId(e.target.value)}
                      disabled={isProcessing}
                    >
                      {anonymizeModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {modelRuntimeLabel(m)} · {formatModelSize(m.sizeBytes)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground shrink-0">
                      {t('anonymize.quality')}
                    </span>
                    <div className="inline-flex rounded-md border border-input overflow-hidden">
                      {(['accurate', 'fast'] as VideoAnonymizeQuality[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => store.setQuality(q)}
                          className={`h-7 px-3 text-xs transition-colors ${quality === q ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'} disabled:opacity-50`}
                          title={t(`anonymize.quality_${q}_hint`)}
                        >
                          {t(`anonymize.quality_${q}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label
                    className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                    title={t('anonymize.bodyTrackingHint')}
                  >
                    <input
                      type="checkbox"
                      checked={bodyTracking}
                      onChange={(e) => store.setBodyTracking(e.target.checked)}
                      disabled={isProcessing}
                      className="h-3 w-3 rounded"
                    />
                    <span className="text-muted-foreground">{t('anonymize.bodyTracking')}</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      className="h-7 rounded border border-input bg-background px-1 text-xs"
                      value={effect}
                      onChange={(e) => store.setEffect(e.target.value as AnonymizeEffect)}
                    >
                      <option value="blur">{t('anonymize.effects.blur')}</option>
                      <option value="pixelate">{t('anonymize.effects.pixelate')}</option>
                      <option value="solid">{t('anonymize.effects.solid')}</option>
                      <option value="emoji">{t('anonymize.effects.emoji')}</option>
                    </select>
                    {effect === 'solid' && (
                      <input
                        type="color"
                        value={solidColor}
                        onChange={(e) => store.setSolidColor(e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded border p-0"
                        title={t('anonymize.color')}
                      />
                    )}
                  </div>
                  {effect === 'blur' && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-14 shrink-0">{t('anonymize.blurRadius')}</span>
                      <input
                        type="range"
                        min={2}
                        max={40}
                        value={blurRadius}
                        onChange={(e) => store.setBlurRadius(Number(e.target.value))}
                        className="h-4 flex-1"
                      />
                      <span className="w-5 text-right tabular-nums">{blurRadius}</span>
                    </label>
                  )}
                  {effect === 'pixelate' && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-14 shrink-0">{t('anonymize.pixelateSize')}</span>
                      <input
                        type="range"
                        min={1}
                        max={48}
                        value={pixelateSize}
                        onChange={(e) => store.setPixelateSize(Number(e.target.value))}
                        className="h-4 flex-1"
                      />
                      <span className="w-5 text-right tabular-nums">{pixelateSize}</span>
                    </label>
                  )}
                </div>

                {effect === 'emoji' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={emojiInput}
                      onChange={(e) => store.setEmojiInput(e.target.value)}
                      placeholder="😶"
                      className="h-7 w-11 rounded border border-input bg-background px-1 text-center text-base"
                      maxLength={4}
                    />
                    <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={emojiRandom}
                        onChange={(e) => store.setEmojiRandom(e.target.checked)}
                        className="h-3 w-3 rounded"
                      />
                      {t('anonymize.emojiRandom')}
                    </label>
                    <div className="flex gap-0.5 flex-wrap">
                      {['😀', '😎', '🤣', '😇', '😍', '🥳', '🐱', '🐶', '👻', '💀'].map((e) => (
                        <button
                          key={e}
                          className="h-6 w-6 rounded hover:bg-accent text-sm leading-none"
                          onClick={() => {
                            store.setEmojiInput(e);
                            store.setEmojiRandom(false);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-14 shrink-0">{t('anonymize.padding')}</span>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={padding}
                      onChange={(e) => store.setPadding(Number(e.target.value))}
                      className="h-4 flex-1"
                    />
                    <span className="w-5 text-right tabular-nums">{padding}</span>
                  </label>
                  {effect !== 'emoji' && (
                    <>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="w-14 shrink-0">{t('anonymize.feather')}</span>
                        <input
                          type="range"
                          min={0}
                          max={24}
                          value={feather}
                          onChange={(e) => store.setFeather(Number(e.target.value))}
                          className="h-4 flex-1"
                        />
                        <span className="w-5 text-right tabular-nums">{feather}</span>
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={maskShape === 'ellipse'}
                          onChange={(e) =>
                            store.setMaskShape(e.target.checked ? 'ellipse' : 'rect')
                          }
                          className="h-3 w-3 rounded"
                        />
                        {t('anonymize.ellipse')}
                      </label>
                    </>
                  )}
                </div>

                <Button
                  className="w-full gap-2 h-9 text-sm"
                  onClick={() => void handleProcess()}
                  disabled={isProcessing}
                >
                  <Play className="h-4 w-4" />
                  {t('common.process')}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Review step: show track thumbnails, toggle exclusions */}
        {step === 'review' && (
          <div className="flex-shrink-0 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('anonymize.reviewMasksHint')} ·{' '}
              {t('anonymize.masksFound', { count: trackMetas.length })}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {trackMetas.map((meta) => {
                const excluded = excludedTrackIds.has(meta.trackId);
                return (
                  <button
                    key={meta.trackId}
                    type="button"
                    onClick={() => store.toggleTrackExclusion(meta.trackId)}
                    className={`relative group rounded-md border-2 overflow-hidden transition-all ${
                      excluded ? 'border-destructive opacity-40' : 'border-primary'
                    }`}
                    title={excluded ? t('anonymize.removeMask') : t('anonymize.keepMask')}
                  >
                    <img
                      src={meta.thumbnailUrl}
                      alt={`${t('anonymize.title')} #${meta.trackId}`}
                      className="w-full aspect-square object-cover"
                    />
                    <div
                      className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                        excluded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {excluded ? (
                        <EyeOff className="h-5 w-5 text-destructive-foreground drop-shadow" />
                      ) : (
                        <Eye className="h-5 w-5 text-primary-foreground drop-shadow" />
                      )}
                    </div>
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-mono text-white drop-shadow">
                      #{meta.trackId}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 h-9 text-sm"
                onClick={() => {
                  store.setStep('done');
                }}
              >
                <Download className="h-4 w-4" />
                {t('common.download')}
              </Button>
              <Button
                className="flex-1 gap-2 h-9 text-sm"
                onClick={handleApplyExcluding}
                disabled={isProcessing}
              >
                <Play className="h-4 w-4" />
                {t('anonymize.applyExcluding')}
              </Button>
            </div>
          </div>
        )}

        {/* Done state */}
        {step === 'done' && (
          <div className="flex-shrink-0 flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2 h-9 text-sm"
              onClick={handleEditAgain}
            >
              <Pencil className="h-4 w-4" />
              {t('anonymize.editAgain')}
            </Button>
            <Button className="flex-1 gap-2 h-9 text-sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              {t('common.download')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
