import { useTranslation } from 'react-i18next';
import { Wand2, User, Brush, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useEditorStore } from '@/store/editorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/hooks/useToast';
import { runPipeline, createDefaultMask, type PipelineType } from '@/ml/pipelineRunner';

const TOOLS: { key: PipelineType; icon: React.ReactNode; labelKey: string }[] = [
  { key: 'upscale', icon: <Zap className="h-4 w-4" />, labelKey: 'editor.tools.upscale' },
  { key: 'faceRestore', icon: <User className="h-4 w-4" />, labelKey: 'editor.tools.faceRestore' },
  { key: 'inpaint', icon: <Brush className="h-4 w-4" />, labelKey: 'editor.tools.inpaint' },
  { key: 'denoise', icon: <Wand2 className="h-4 w-4" />, labelKey: 'editor.tools.denoise' },
];

export default function ToolPanel() {
  const { t } = useTranslation();
  const { currentImageUrl, activeJob } = useEditorStore();
  const { tileSize, tileOverlap } = useSettingsStore();

  const handleTool = async (key: PipelineType) => {
    if (!currentImageUrl) {
      toast({ title: t('editor.empty.title'), description: t('editor.empty.description') });
      return;
    }

    const options =
      key === 'inpaint' ? { maskCanvas: createDefaultMask(1, 1) } : { tileSize, tileOverlap };

    try {
      await runPipeline(key, options);
    } catch {
      toast({ title: t('errors.loadFailed'), variant: 'destructive' });
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('editor.tools.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {TOOLS.map((tool) => (
          <Button
            key={tool.key}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={!!activeJob}
            onClick={() => {
              void handleTool(tool.key);
            }}
          >
            {tool.icon}
            {t(tool.labelKey)}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
