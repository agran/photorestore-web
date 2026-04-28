import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

const MAX_FILE_SIZE = 32 * 1024 * 1024; // 32 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface DropzoneProps {
  onFile: (file: File) => void;
  className?: string;
}

export default function Dropzone({ onFile, className }: DropzoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({ title: t('errors.unsupportedFormat'), variant: 'destructive' });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: t('errors.fileTooLarge'), variant: 'destructive' });
        return;
      }
      const url = URL.createObjectURL(file);
      setPreview(url);
      onFile(file);
    },
    [onFile, t]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer',
        'border-border hover:border-primary/60 bg-muted/30 hover:bg-muted/50',
        isDragging && 'border-primary bg-primary/10',
        preview && 'border-transparent',
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onClick={() => document.getElementById('dropzone-input')?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          document.getElementById('dropzone-input')?.click();
        }
      }}
    >
      <input
        id="dropzone-input"
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="sr-only"
        onChange={onInputChange}
      />

      {preview ? (
        <img
          src={preview}
          alt="Preview"
          className="h-full w-full rounded-xl object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-base font-medium">{t('home.dropHint')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('home.dropHintFormats')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
