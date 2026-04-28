import { useTranslation } from 'react-i18next';
import { Wand2, User, Brush, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useEditorStore } from '@/store/editorStore';
import { toast } from '@/hooks/useToast';

const TOOLS = [
  { key: 'upscale', icon: <Zap className="h-4 w-4" />, labelKey: 'editor.tools.upscale' },
  { key: 'faceRestore', icon: <User className="h-4 w-4" />, labelKey: 'editor.tools.faceRestore' },
  { key: 'inpaint', icon: <Brush className="h-4 w-4" />, labelKey: 'editor.tools.inpaint' },
  { key: 'denoise', icon: <Wand2 className="h-4 w-4" />, labelKey: 'editor.tools.denoise' },
];

export default function ToolPanel() {
  const { t } = useTranslation();
  const { currentImageUrl, activeJob } = useEditorStore();

  const handleTool = (key: string) => {
    if (!currentImageUrl) {
      toast({ title: t('editor.empty.title'), description: t('editor.empty.description') });
      return;
    }
    // TODO: dispatch actual inference job
    toast({ title: `${key} — coming soon` });
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
            onClick={() => handleTool(tool.key)}
          >
            {tool.icon}
            {t(tool.labelKey)}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
