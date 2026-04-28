import { Progress } from './ui/progress';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';

export default function ProgressBar() {
  const { t } = useTranslation();
  const { activeJob } = useEditorStore();

  if (!activeJob || activeJob.status === 'idle') return null;

  if (activeJob.status === 'error') {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-destructive/50 bg-destructive/10 p-4 shadow-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">
              {activeJob.pipeline} {t('errors.pipelineFailed')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground break-words">
              {activeJob.error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activeJob.status !== 'running') return null;

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
