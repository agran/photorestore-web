import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2, User, Brush, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useEditorStore } from '@/store/editorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/hooks/useToast';
import { runPipeline, createDefaultMask, type PipelineType } from '@/ml/pipelineRunner';
import { getModelsByPipeline, type ModelMeta } from '@/ml/modelRegistry';

const upscaleModels = getModelsByPipeline('upscale');

export default function ToolPanel() {
  const { t } = useTranslation();
  const { currentImageUrl, activeJob } = useEditorStore();
  const isRunning = activeJob?.status === 'running';
  const { tileSize, tileOverlap } = useSettingsStore();
  const [upscaleModelId, setUpscaleModelId] = useState<string>(upscaleModels[0]?.id ?? '');

  const handleTool = async (key: PipelineType, modelId?: ModelMeta['id']) => {
    if (!currentImageUrl) {
      toast({ title: t('editor.empty.title'), description: t('editor.empty.description') });
      return;
    }

    const options: Record<string, unknown> =
      key === 'inpaint' ? { maskCanvas: createDefaultMask(1, 1) } : { tileSize, tileOverlap };
    if (key === 'upscale' && modelId) {
      options.modelId = modelId;
    }

    try {
      await runPipeline(key, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: t('errors.pipelineFailed'), description: message, variant: 'destructive' });
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('editor.tools.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {/* Upscale with model selector */}
        <div className="flex flex-col gap-1">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={upscaleModelId}
            onChange={(e) => setUpscaleModelId(e.target.value)}
            disabled={isRunning}
          >
            {upscaleModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={isRunning}
            onClick={() => {
              void handleTool('upscale', upscaleModelId);
            }}
          >
            <Zap className="h-4 w-4" />
            {t('editor.tools.upscale')}
          </Button>
        </div>

        {/* FaceRestore */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={isRunning}
          onClick={() => {
            void handleTool('faceRestore');
          }}
        >
          <User className="h-4 w-4" />
          {t('editor.tools.faceRestore')}
        </Button>

        {/* Inpaint */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={isRunning}
          onClick={() => {
            void handleTool('inpaint');
          }}
        >
          <Brush className="h-4 w-4" />
          {t('editor.tools.inpaint')}
        </Button>

        {/* Denoise */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={isRunning}
          onClick={() => {
            void handleTool('denoise');
          }}
        >
          <Wand2 className="h-4 w-4" />
          {t('editor.tools.denoise')}
        </Button>
      </CardContent>
    </Card>
  );
}
