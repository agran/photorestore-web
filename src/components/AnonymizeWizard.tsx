import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, EyeOff, Settings2, Eye, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import FaceOverlay from './FaceOverlay';
import PreviewCanvas from './PreviewCanvas';
import BeforeAfterSplit from './BeforeAfterSplit';
import { useAnonymizeStore, EMOJI_POPULAR } from '@/store/anonymizeStore';
import { useEditorStore } from '@/store/editorStore';
import { getModel, getModelsByPipeline, formatModelSize, modelRuntimeLabel } from '@/ml/modelRegistry';
import { detectFaces, anonymize as applyAnonymize } from '@/ml/pipelines/anonymize';
import { downloadImageUrl } from '@/lib/download';
import { toast } from '@/hooks/useToast';
import type { AnonymizeEffect } from '@/ml/utils/anonymizeEffects';

interface AnonymizeWizardProps {
  onResult: (resultUrl: string, label: string) => void;
  onClose: () => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="w-14 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 flex-1"
        disabled={disabled}
      />
      <span className="w-5 text-right tabular-nums">{value}</span>
    </label>
  );
}

export default function AnonymizeWizard({ onResult, onClose }: AnonymizeWizardProps) {
  const { t } = useTranslation();
  const { currentImageUrl } = useEditorStore();
  const store = useAnonymizeStore();
  const {
    step, faces, effect, blurRadius, pixelateSize, solidColor,
    modelId, preview, emojiInput, emojiRandom, padding, feather, maskShape, randomEmojis,
  } = store;

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setExpanded(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    if (!currentImageUrl) return;
    const img = new Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = currentImageUrl;
  }, [currentImageUrl]);

  const handleDetect = useCallback(async () => {
    if (!currentImageUrl || !imgDims) return;
    setBusy(true);
    setProgress(0);
    store.setStep('detecting');
    store.setPreview(false);

    try {
      const img = new Image();
      img.src = currentImageUrl;
      await new Promise<void>((r, rej) => { img.onload = () => r(); img.onerror = () => rej(new Error('Load failed')); });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const detected = await detectFaces(canvas, { modelId, threshold: 0.5, onProgress: setProgress, effectOptions: undefined });
      store.setFaces(detected);
      if (detected.length === 0) toast({ title: t('anonymize.noFaces') });
      else toast({ title: t('anonymize.facesFound', { count: detected.length }) });
    } catch (err) {
      toast({ title: t('errors.pipelineFailed'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      store.setFaces([]);
    } finally { setBusy(false); }
  }, [currentImageUrl, imgDims, modelId, t, store]);

  const handleApply = useCallback(async () => {
    if (!currentImageUrl || !imgDims || faces.length === 0) return;
    setBusy(true);
    store.setStep('applying');
    try {
      const img = new Image();
      img.src = currentImageUrl;
      await new Promise<void>((r, rej) => { img.onload = () => r(); img.onerror = () => rej(new Error('Load failed')); });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);

      const result = await applyAnonymize(canvas, {
        modelId,
        preDetectedFaces: faces,
        effectOptions: {
          effect, blurRadius, pixelateSize, solidColor, padding, feather, maskShape,
          emoji: emojiInput || '😶',
          emojis: emojiRandom ? randomEmojis : undefined,
        },
        onProgress: setProgress,
      });

      result.canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const name = getModel(modelId)?.name ?? modelId;
          onResult(url, `${name} — ${t('anonymize.effects.' + effect)}`);
          store.setStep('editing');
          store.setPreview(true);
        }
      }, 'image/png');
    } catch (err) {
      toast({ title: t('errors.pipelineFailed'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally { setBusy(false); }
  }, [currentImageUrl, imgDims, faces, modelId, effect, blurRadius, pixelateSize, solidColor, padding, feather, maskShape, emojiInput, emojiRandom, randomEmojis, store, t, onResult]);

  const handleDeleteAll = () => { store.setFaces([]); store.setPreview(false); };

  if (!currentImageUrl || !imgDims) {
    return (
      <div className="flex h-full items-center justify-center"><p className="text-muted-foreground">{t('editor.empty.title')}</p></div>
    );
  }

  const anonymizeModels = getModelsByPipeline('anonymize');

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card text-card-foreground shadow-sm max-md:border-0 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b">
        <span className="text-sm font-medium truncate">{t('anonymize.title')}</span>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => downloadImageUrl(currentImageUrl, t('editor.downloadFilename'))} title={t('editor.download')}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title={t('common.close')}>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>
      </div>

      {/* Body: image + controls */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-hidden p-2 min-h-0">
        {/* IMAGE — takes all available space */}
        <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden rounded-lg bg-muted">
          {step === 'editing' && preview ? (
            <BeforeAfterSplit className="h-full w-full">
              <img src={currentImageUrl} alt="" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
              <PreviewCanvas imageUrl={currentImageUrl} imgWidth={imgDims.w} imgHeight={imgDims.h} />
            </BeforeAfterSplit>
          ) : (
            <>
              {step !== 'editing' && (
                <img src={currentImageUrl} alt="" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
              )}
              {step === 'editing' && !preview && (
                <FaceOverlay imageUrl={currentImageUrl} imgWidth={imgDims.w} imgHeight={imgDims.h} />
              )}
            </>
          )}
        </div>

        {/* CONTROLS — compact bottom panel */}
        {step === 'idle' && (
          <div className="flex-shrink-0 flex gap-2">
            <div className="min-w-0 flex-1">
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs" value={modelId} onChange={(e) => store.setModelId(e.target.value)} disabled={busy}>
                {anonymizeModels.map((m) => <option key={m.id} value={m.id}>{m.name} · {modelRuntimeLabel(m)} · {formatModelSize(m.sizeBytes)}</option>)}
              </select>
            </div>
            <Button className="gap-2 px-4" onClick={() => void handleDetect()} disabled={busy}>
              <Search className="h-4 w-4" />{t('anonymize.detect')}
            </Button>
          </div>
        )}

        {(step === 'detecting' || step === 'applying') && (
          <div className="flex-shrink-0">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground">{t('common.processing')} {progress}%</p>
          </div>
        )}

        {step === 'editing' && (
          <div className="flex-shrink-0 space-y-2 text-xs">
            {/* Compact row — always visible */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground shrink-0">{isMobile ? t('anonymize.facesFoundShort', { count: faces.length }) : t('anonymize.facesFound', { count: faces.length })}</span>
              <label className="flex items-center gap-1 cursor-pointer select-none shrink-0">
                <input type="checkbox" checked={preview} onChange={(e) => store.setPreview(e.target.checked)} className="h-3 w-3 rounded" />
                <Eye className="h-3 w-3" />{t('anonymize.preview')}
              </label>
              <div className="flex-1" />
              {isMobile && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs" onClick={() => setExpanded(!expanded)}>
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <span>{expanded ? t('common.collapse') : t('common.expand')}</span>
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 shrink-0" onClick={() => void handleApply()} disabled={busy || faces.length === 0}>
                <EyeOff className="h-3.5 w-3.5" />{t('common.apply')}
              </Button>
            </div>

            {/* Expanded controls */}
            {(expanded || !isMobile) && (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="min-w-0 flex-1">
                    <select className="h-7 w-full rounded border border-input bg-background px-1 text-xs" value={modelId} onChange={(e) => store.setModelId(e.target.value)} disabled={busy}>
                      {anonymizeModels.map((m) => <option key={m.id} value={m.id}>{m.name} · {modelRuntimeLabel(m)} · {formatModelSize(m.sizeBytes)}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={handleDeleteAll} disabled={faces.length === 0} title={t('common.reset')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleDetect()} disabled={busy}>
                      <Search className="h-3 w-3 mr-1" />{t('anonymize.detect')}
                    </Button>
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
                  {effect === 'blur' && <SliderRow label={t('anonymize.blurRadius')} value={blurRadius} min={2} max={40} onChange={store.setBlurRadius} />}
                  {effect === 'pixelate' && <SliderRow label={t('anonymize.pixelateSize')} value={pixelateSize} min={1} max={48} onChange={store.setPixelateSize} />}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <SliderRow label={t('anonymize.padding')} value={padding} min={0} max={40} onChange={store.setPadding} />
                  {effect !== 'emoji' && <SliderRow label={t('anonymize.feather')} value={feather} min={0} max={24} onChange={store.setFeather} />}
                  {effect !== 'emoji' && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
                      <input type="checkbox" checked={maskShape === 'ellipse'} onChange={(e) => store.setMaskShape(e.target.checked ? 'ellipse' : 'rect')} className="h-3 w-3 rounded" />
                      {t('anonymize.ellipse')}
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
                      {EMOJI_POPULAR.slice(0, 14).map((e) => (
                        <button key={e} className="h-6 w-6 rounded hover:bg-accent text-sm leading-none" onClick={() => { store.setEmojiInput(e); store.setEmojiRandom(false); }}>{e}</button>
                      ))}
                    </div>
                  </div>
                )}

                {!isMobile && (
                  <Button className="w-full gap-2 h-9 text-sm" onClick={() => void handleApply()} disabled={busy || faces.length === 0}>
                    <EyeOff className="h-4 w-4" />{t('anonymize.apply')}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
