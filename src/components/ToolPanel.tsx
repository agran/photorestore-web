import { useTranslation } from 'react-i18next';
import { Wand2, User, Brush, Zap, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useEditorStore } from '@/store/editorStore';
import type { PipelineType } from '@/ml/pipelineRunner';

interface ToolPanelProps {
  onAnonymize?: (modelId: string) => void;
  onSelectTool?: (tool: PipelineType) => void;
  compact?: boolean;
}

export default function ToolPanel({ onAnonymize, onSelectTool, compact }: ToolPanelProps) {
  const { t } = useTranslation();
  const { activeJob } = useEditorStore();
  const isRunning = activeJob?.status === 'running';

  if (compact) {
    const tools: { icon: React.ReactNode; label: string; action: () => void; disabled?: boolean }[] = [
      { icon: <Zap className="h-4 w-4" />, label: t('editor.tools.upscaleShort'), action: () => onSelectTool?.('upscale') },
      { icon: <User className="h-4 w-4" />, label: t('editor.tools.faceRestoreShort'), action: () => onSelectTool?.('faceRestore'), disabled: true },
      { icon: <Brush className="h-4 w-4" />, label: t('editor.tools.inpaintShort'), action: () => onSelectTool?.('inpaint'), disabled: true },
      { icon: <Wand2 className="h-4 w-4" />, label: t('editor.tools.denoiseShort'), action: () => onSelectTool?.('denoise'), disabled: true },
      { icon: <EyeOff className="h-4 w-4" />, label: t('editor.tools.anonymizeShort'), action: () => onAnonymize?.('scrfd-10g') },
    ];
    return (
      <div className="flex justify-center gap-0.5">
        {tools.map((tool) => (
          <button
            key={tool.label}
            className="flex flex-col items-center gap-0.5 rounded-md px-1 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed min-w-0 flex-1 max-w-[64px]"
            disabled={isRunning || tool.disabled}
            onClick={tool.action}
          >
            {tool.icon}
            <span className="text-[9px] leading-tight text-center">{tool.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('editor.tools.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={isRunning}
          onClick={() => onSelectTool?.('upscale')}
        >
          <Zap className="h-4 w-4" />
          {t('editor.tools.upscale')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled
          onClick={() => onSelectTool?.('faceRestore')}
        >
          <User className="h-4 w-4" />
          {t('editor.tools.faceRestore')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled
          onClick={() => onSelectTool?.('inpaint')}
        >
          <Brush className="h-4 w-4" />
          {t('editor.tools.inpaint')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled
          onClick={() => onSelectTool?.('denoise')}
        >
          <Wand2 className="h-4 w-4" />
          {t('editor.tools.denoise')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={isRunning}
          onClick={() => onAnonymize?.('scrfd-10g')}
        >
          <EyeOff className="h-4 w-4" />
          {t('editor.tools.anonymize')}
        </Button>
      </CardContent>
    </Card>
  );
}
