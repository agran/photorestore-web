import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Clock, Download, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Dropzone from '@/components/Dropzone';
import BeforeAfterSplit from '@/components/BeforeAfterSplit';
import ToolPanel from '@/components/ToolPanel';
import ProgressBar from '@/components/ProgressBar';
import AnonymizeWizard from '@/components/AnonymizeWizard';
import VideoAnonymizeWizard from '@/components/VideoAnonymizeWizard';
import { useEditorStore } from '@/store/editorStore';
import { useAnonymizeStore } from '@/store/anonymizeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { downloadImageUrl } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { useImageHistory } from '@/hooks/useImageHistory';
import { runPipeline, createDefaultMask, type PipelineType } from '@/ml/pipelineRunner';
import { getModelsByPipeline, formatModelSize, modelRuntimeLabel } from '@/ml/modelRegistry';
import { toast } from '@/hooks/useToast';

export default function Editor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentImageUrl, originalImageUrl, setImage, pushHistory } = useEditorStore();
  const { history, restore } = useImageHistory();
  const { reset: resetAnonymize, setModelId } = useAnonymizeStore();
  const { tileSize, tileOverlap } = useSettingsStore();
  const upscaleModels = getModelsByPipeline('upscale');
  const [showWizard, setShowWizard] = useState(false);
  const [showVideoWizard, setShowVideoWizard] = useState(false);
  const [activeTool, setActiveTool] = useState<PipelineType | null>(null);
  const [upscaleModelId, setUpscaleModelId] = useState(upscaleModels[0]?.id ?? '');

  const handleSelectTool = (tool: PipelineType) => {
    setShowWizard(false);
    resetAnonymize();
    setActiveTool(tool);
  };

  const toolTitles: Record<string, string> = {
    upscale: t('editor.tools.upscale'),
    faceRestore: t('editor.tools.faceRestore'),
    inpaint: t('editor.tools.inpaint'),
    denoise: t('editor.tools.denoise'),
  };

  const handleRunTool = async () => {
    if (!currentImageUrl || !activeTool) return;
    const options: Record<string, unknown> =
      activeTool === 'inpaint' ? { maskCanvas: createDefaultMask(1, 1) } : { tileSize, tileOverlap };
    if (activeTool === 'upscale') {
      options.modelId = upscaleModelId;
    }
    try {
      await runPipeline(activeTool, options);
      setActiveTool(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: t('errors.pipelineFailed'), description: message, variant: 'destructive' });
    }
  };

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setImage(url);
  };

  const handleOpenWizard = (modelId: string) => {
    setActiveTool(null);
    resetAnonymize();
    setModelId(modelId);
    setShowWizard(true);
  };

  const handleWizardResult = (resultUrl: string, label: string) => {
    setImage(resultUrl);
    pushHistory({ imageUrl: resultUrl, label });
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    resetAnonymize();
  };

  const handleOpenVideoWizard = () => {
    setShowVideoWizard(true);
  };

  const handleCloseVideoWizard = () => {
    setShowVideoWizard(false);
  };

  if (showVideoWizard) {
    return (
      <div className="container flex h-full min-h-0 flex-col py-1 max-md:px-2 max-md:py-0.5">
        <VideoAnonymizeWizard onClose={handleCloseVideoWizard} />
      </div>
    );
  }

  if (!currentImageUrl) {
    return (
      <div className="container flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-2xl font-bold">{t('editor.empty.title')}</h2>
        <p className="mt-2 text-muted-foreground">{t('editor.empty.description')}</p>
        <div className="mt-8 w-full max-w-md">
          <Dropzone onFile={handleFile} className="min-h-[180px]" />
        </div>
        <Button className="mt-4" variant="outline" onClick={() => void navigate('/')}>
          {t('editor.empty.action')}
        </Button>
      </div>
    );
  }

  return (
    <div className="container flex h-full min-h-0 flex-col py-1 max-md:px-2 max-md:py-0.5">
      <div className="flex flex-1 min-h-0 gap-3 max-md:flex-col max-md:gap-1.5">
        {/* Tools column */}
        <aside className="hidden w-[220px] flex-shrink-0 md:block">
          <ToolPanel onAnonymize={handleOpenWizard} onSelectTool={handleSelectTool} onAnonymizeVideo={handleOpenVideoWizard} />
        </aside>

        {/* Canvas column */}
        <section className="flex min-h-0 flex-1 flex-col gap-3 max-md:gap-1.5">
          {/* Mobile toolbar */}
          <div className="md:hidden flex-shrink-0">
            <ToolPanel onAnonymize={handleOpenWizard} onSelectTool={handleSelectTool} onAnonymizeVideo={handleOpenVideoWizard} compact />
          </div>
          {showWizard ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <AnonymizeWizard
                onResult={handleWizardResult}
                onClose={handleCloseWizard}
              />
            </div>
          ) : (
            <>
              {activeTool && (
                <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b">
                  <span className="text-sm font-medium truncate">{toolTitles[activeTool]}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => downloadImageUrl(currentImageUrl, t('editor.downloadFilename'))} title={t('editor.download')}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setActiveTool(null)} title={t('common.close')}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <BeforeAfterSplit className="flex-1 min-h-0 w-full bg-muted rounded-lg overflow-hidden">
                <img src={originalImageUrl ?? currentImageUrl} className="h-full w-full object-contain" />
                <img src={currentImageUrl} className="h-full w-full object-contain" />
              </BeforeAfterSplit>

              <div className="flex-shrink-0 flex items-center gap-2 border-t pt-2 min-w-0 overflow-hidden">
                {activeTool ? (
                  <>
                    {activeTool === 'upscale' && (
                      <div className="min-w-0 flex-1">
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                          value={upscaleModelId}
                          onChange={(e) => setUpscaleModelId(e.target.value)}
                        >
                          {upscaleModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.name} · {modelRuntimeLabel(m)} · {formatModelSize(m.sizeBytes)}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Button className="gap-2" size="sm" onClick={() => void handleRunTool()}>
                      <Play className="h-4 w-4" />
                      {t('common.process')}
                    </Button>
                  </>
                ) : (
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => downloadImageUrl(currentImageUrl, t('editor.downloadFilename'))}
                  >
                    <Download className="h-4 w-4" />
                    {t('editor.download')}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>

        {/* History column */}
        <aside className="hidden w-[200px] flex-shrink-0 md:block">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                {t('editor.history')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 overflow-y-auto">
              {history.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('editor.noHistory')}</p>
              )}
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="group relative w-full overflow-hidden rounded border transition-colors hover:border-primary"
                >
                  <button
                    className="w-full text-left"
                    onClick={() => restore(entry)}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={entry.label}
                      className="h-16 w-full object-cover"
                    />
                    <div className="px-2 py-1">
                      <p className="truncate text-xs font-medium">{entry.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</p>
                    </div>
                  </button>
                  <button
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-background/80 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImageUrl(entry.imageUrl, t('editor.downloadFilename'));
                    }}
                    title={t('editor.download')}
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Mobile history — horizontal scroll */}
      {history.length > 0 && (
        <div className="md:hidden flex-shrink-0 mt-1.5 overflow-x-auto">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 px-0.5">
            <Clock className="h-3 w-3" />
            {t('editor.history')}
          </div>
          <div className="flex gap-2">
            {history.map((entry) => (
              <button
                key={entry.id}
                className="flex-shrink-0 w-16 rounded border overflow-hidden hover:border-primary transition-colors"
                onClick={() => restore(entry)}
                title={entry.label}
              >
                <img src={entry.imageUrl} alt={entry.label} className="h-12 w-full object-cover" />
                <p className="truncate text-[9px] px-0.5 py-0.5 leading-tight">{entry.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <ProgressBar />
    </div>
  );
}
