import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';
import { isHeicFile } from '@/lib/heic';
import { readImageFile, PHOTO_ACCEPT_ATTR } from '@/lib/imageFile';

const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB
const ACCEPT_ATTR = `${PHOTO_ACCEPT_ATTR},video/*`;

interface DropzoneProps {
  onFile: (file: File) => void;
  className?: string;
}

export default function Dropzone({ onFile, className }: DropzoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Track unmount so async HEIC conversion (which can take seconds) doesn't
  // call setState / toast on a dead component, and any in-flight blob URL
  // gets revoked instead of leaking.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
    };
  }, []);

  const setPreviewWithRevoke = useCallback((nextUrl: string | null) => {
    const prev = previewRef.current;
    previewRef.current = nextUrl;
    setPreview(nextUrl);
    if (prev && prev !== nextUrl) URL.revokeObjectURL(prev);
  }, []);

  const handleFile = useCallback(
    async (input: File) => {
      const isVideo = input.type.startsWith('video/');

      // Size check happens before HEIC decode so a 200 MB HEIC fails fast
      // without spending CPU on conversion.
      if (isVideo) {
        if (input.size > MAX_VIDEO_SIZE) {
          if (mountedRef.current) toast({ title: t('errors.fileTooLarge'), variant: 'destructive' });
          return;
        }
        if (mountedRef.current) onFile(input);
        return;
      }

      const willConvert = isHeicFile(input);
      if (willConvert && mountedRef.current) setIsConverting(true);
      const result = await readImageFile(input);
      if (!mountedRef.current) return;
      if (willConvert) setIsConverting(false);

      if (!result.ok) {
        toast({
          title: t(result.messageKey),
          description: result.description,
          variant: 'destructive',
        });
        return;
      }

      setPreviewWithRevoke(URL.createObjectURL(result.file));
      onFile(result.file);
    },
    [onFile, t, setPreviewWithRevoke],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const triggerInput = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer',
        'border-border hover:border-primary/60 bg-muted/30 hover:bg-muted/50',
        isDragging && 'border-primary bg-primary/10',
        preview && 'border-transparent',
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onClick={triggerInput}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') triggerInput();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={onInputChange}
      />

      {preview ? (
        <img
          src={preview}
          alt={t('dropzone.previewAlt')}
          className="h-full w-full rounded-xl object-contain"
        />
      ) : isConverting ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
          <p className="text-base font-medium">{t('dropzone.convertingHeic')}</p>
        </div>
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
