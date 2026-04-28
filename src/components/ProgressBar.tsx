import { Progress } from './ui/progress';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '@/store/editorStore';

export default function ProgressBar() {
  const { t } = useTranslation();
  const { activeJob } = useEditorStore();

  if (!activeJob || activeJob.status !== 'running') return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border bg-background p-4 shadow-lg">
      <p className="mb-2 text-sm font-medium">
        {t('common.processing')} {activeJob.pipeline}
      </p>
      <Progress value={activeJob.progress} />
      <p className="mt-1 text-xs text-muted-foreground">{activeJob.progress}%</p>
    </div>
  );
}
