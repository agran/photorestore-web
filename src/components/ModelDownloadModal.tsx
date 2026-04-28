import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { formatBytes } from '@/lib/format';
import type { ModelMeta } from '@/ml/modelRegistry';
import { loadModel } from '@/ml/modelLoader';

interface ModelDownloadModalProps {
  model: ModelMeta | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloaded?: () => void;
}

export default function ModelDownloadModal({
  model,
  open,
  onOpenChange,
  onDownloaded,
}: ModelDownloadModalProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!model) return;
    setDownloading(true);
    setError(null);
    setProgress(0);
    try {
      await loadModel(model.url, {
        expectedSha256: model.sha256,
        onProgress: (loaded, total) => {
          if (total > 0) setProgress(Math.round((loaded / total) * 100));
        },
      });
      setDownloading(false);
      onDownloaded?.();
      onOpenChange(false);
    } catch (e) {
      setDownloading(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!model) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('model.downloadTitle')}</DialogTitle>
          <DialogDescription>
            {model.name} — {t('model.size', { size: formatBytes(model.sizeBytes) })}
            <br />
            {t('model.license', { license: model.license })}
          </DialogDescription>
        </DialogHeader>

        {downloading && (
          <div className="space-y-2">
            <p className="text-sm">{t('model.downloading', { name: model.name })}</p>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={downloading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleDownload()} disabled={downloading}>
            {downloading ? t('common.loading') : t('model.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
