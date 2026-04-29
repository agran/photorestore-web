import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Download, X, Settings2, Square } from 'lucide-react';
import { Button } from './ui/button';
import { useVideoAnonymizeStore, type VideoAnonymizeQuality } from '@/store/videoAnonymizeStore';
import { getModelsByPipeline, formatModelSize, modelRuntimeLabel } from '@/ml/modelRegistry';
import { anonymizeVideo } from '@/ml/pipelines/anonymizeVideo';
import { downloadUrl } from '@/lib/download';
import { toast } from '@/hooks/useToast';
import type { AnonymizeEffect } from '@/ml/utils/anonymizeEffects';

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
    step, videoUrl, duration, fps, width, height,
    effect, blurRadius, pixelateSize, solidColor,
    modelId, padding, feather, maskShape, progress,
    outputUrl, emojiInput, emojiRandom, quality,
  } = store;

  const [isProcessing, setIsProcessing] = useState(false);
  const [eta, setEta] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const anonymizeModels = getModelsByPipeline('anonymize');

  const handleFile = useCallback((file: File) => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.src = URL.createObjectURL(file);
    vid.onloadedmetadata = () => {
      const fps = 30; // safe default, could parse from vid but complex
      const frameCount = Math.round(vid.duration * fps);
      store.setFile(file, {
        duration: vid.duration,
        fps,
        width: vid.videoWidth,
        height: vid.videoHeight,
        frameCount,
      });
      URL.revokeObjectURL(vid.src);
      vid.remove();
    };
  }, [store]);

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
      const blob = await anonymizeVideo(file, {
        modelId,
        quality,
        effectOptions: {
          effect, blurRadius, pixelateSize, solidColor, padding, feather, maskShape,
          emoji: emojiInput || '😶',
        },
        onProgress: (p) => store.setProgress(p),
        onEta: (s) => setEta(s),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      store.setOutput(blob, url);
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
  }, [store, modelId, quality, effect, blurRadius, pixelateSize, solidColor, padding, feather, maskShape, emojiInput, t]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    store.setAborted(true);
    store.setStep('loaded');
  }, [store]);

  const handleDownload = useCallback(() => {
    if (outputUrl) downloadUrl(outputUrl, 'anonymized.mp4');
  }, [outputUrl]);

  if (step === 'idle') {
    return (
      <div className="flex h-full flex-col rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b">
          <span className="text-sm font-medium truncate">{t('anonymize.videoTitle')}</span>
          <Button variant="ghost" size="icon" onClick={onClose} title={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-muted-foreground">{t('anonymize.videoUploadHint')}</p>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="outline" asChild>
              <span>{t('anonymize.videoChoose')}</span>
            </Button>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b">
        <span className="text-sm font-medium truncate">{t('anonymize.videoTitle')}</span>
        <div className="flex items-center gap-1 shrink-0">
          {outputUrl && (
            <Button variant="ghost" size="icon" onClick={handleDownload} title={t('common.download')}>
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
        {/* Video preview */}
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-lg bg-muted">
          {outputUrl ? (
            <video src={outputUrl} controls className="absolute inset-0 w-full h-full object-contain" />
          ) : videoUrl ? (
            <video src={videoUrl} controls className="absolute inset-0 w-full h-full object-contain" />
          ) : null}
        </div>

        {/* Info row */}
        {step === 'loaded' && (
          <div className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{formatDuration(duration)}</span>
            <span>{fps}fps</span>
            <span>{width}×{height}</span>
          </div>
        )}

        {/* Progress bar */}
        {isProcessing && (
          <div className="flex-shrink-0 space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('common.processing')} {progress}%</span>
              {eta > 0 && <span>~{eta}s</span>}
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs text-destructive" onClick={handleCancel}>
                <Square className="h-3 w-3" />{t('common.cancel')}
              </Button>
            </div>
          </div>
        )}

        {/* Effect controls */}
        {step === 'loaded' && (
          <div className="flex-shrink-0 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="min-w-0 flex-1">
                <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs" value={modelId} onChange={(e) => store.setModelId(e.target.value)} disabled={isProcessing}>
                  {anonymizeModels.map((m) => <option key={m.id} value={m.id}>{m.name} · {modelRuntimeLabel(m)} · {formatModelSize(m.sizeBytes)}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">{t('anonymize.quality')}</span>
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

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                <select className="h-7 rounded border border-input bg-background px-1 text-xs" value={effect} onChange={(e) => store.setEffect(e.target.value as AnonymizeEffect)}>
                  <option value="blur">{t('anonymize.effects.blur')}</option>
                  <option value="pixelate">{t('anonymize.effects.pixelate')}</option>
                  <option value="solid">{t('anonymize.effects.solid')}</option>
                  <option value="emoji">{t('anonymize.effects.emoji')}</option>
                </select>
                {effect === 'solid' && (
                  <input type="color" value={solidColor} onChange={(e) => store.setSolidColor(e.target.value)} className="h-6 w-6 cursor-pointer rounded border p-0" title={t('anonymize.color')} />
                )}
              </div>
              {effect === 'blur' && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-14 shrink-0">{t('anonymize.blurRadius')}</span>
                  <input type="range" min={2} max={40} value={blurRadius} onChange={(e) => store.setBlurRadius(Number(e.target.value))} className="h-4 flex-1" />
                  <span className="w-5 text-right tabular-nums">{blurRadius}</span>
                </label>
              )}
              {effect === 'pixelate' && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-14 shrink-0">{t('anonymize.pixelateSize')}</span>
                  <input type="range" min={1} max={48} value={pixelateSize} onChange={(e) => store.setPixelateSize(Number(e.target.value))} className="h-4 flex-1" />
                  <span className="w-5 text-right tabular-nums">{pixelateSize}</span>
                </label>
              )}
            </div>

            {effect === 'emoji' && (
              <div className="flex items-center gap-2 flex-wrap">
                <input type="text" value={emojiInput} onChange={(e) => store.setEmojiInput(e.target.value)} placeholder="😶" className="h-7 w-11 rounded border border-input bg-background px-1 text-center text-base" maxLength={4} />
                <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                  <input type="checkbox" checked={emojiRandom} onChange={(e) => store.setEmojiRandom(e.target.checked)} className="h-3 w-3 rounded" />
                  {t('anonymize.emojiRandom')}
                </label>
                <div className="flex gap-0.5 flex-wrap">
                  {['😀', '😎', '🤣', '😇', '😍', '🥳', '🐱', '🐶', '👻', '💀'].map((e) => (
                    <button key={e} className="h-6 w-6 rounded hover:bg-accent text-sm leading-none" onClick={() => { store.setEmojiInput(e); store.setEmojiRandom(false); }}>{e}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-14 shrink-0">{t('anonymize.padding')}</span>
                <input type="range" min={0} max={40} value={padding} onChange={(e) => store.setPadding(Number(e.target.value))} className="h-4 flex-1" />
                <span className="w-5 text-right tabular-nums">{padding}</span>
              </label>
              {effect !== 'emoji' && (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-14 shrink-0">{t('anonymize.feather')}</span>
                    <input type="range" min={0} max={24} value={feather} onChange={(e) => store.setFeather(Number(e.target.value))} className="h-4 flex-1" />
                    <span className="w-5 text-right tabular-nums">{feather}</span>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={maskShape === 'ellipse'} onChange={(e) => store.setMaskShape(e.target.checked ? 'ellipse' : 'rect')} className="h-3 w-3 rounded" />
                    {t('anonymize.ellipse')}
                  </label>
                </>
              )}
            </div>

            <Button className="w-full gap-2 h-9 text-sm" onClick={() => void handleProcess()} disabled={isProcessing}>
              <Play className="h-4 w-4" />{t('common.process')}
            </Button>
          </div>
        )}

        {/* Done state */}
        {step === 'done' && (
          <div className="flex-shrink-0">
            <Button className="w-full gap-2 h-9 text-sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />{t('common.download')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
