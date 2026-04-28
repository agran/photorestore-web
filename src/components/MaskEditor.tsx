import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

interface MaskEditorProps {
  imageUrl: string;
  onMaskReady?: (maskCanvas: HTMLCanvasElement) => void;
  className?: string;
}

/**
 * Mask editor for inpainting.
 * TODO: Implement brush tool, undo, erase, and export mask canvas.
 */
export default function MaskEditor({ imageUrl, onMaskReady, className }: MaskEditorProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [brushSize] = useState(20);

  // Load image into canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  };

  const exportMask = () => {
    const canvas = canvasRef.current;
    if (canvas) onMaskReady?.(canvas);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-sm text-muted-foreground">
        {/* TODO: add i18n key for mask editor instructions */}
        Paint white over areas to inpaint
      </p>
      <div className="relative overflow-hidden rounded-lg border bg-checkerboard">
        <img src={imageUrl} alt="Source" className="w-full object-contain" draggable={false} />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair opacity-60"
          onMouseDown={() => setDrawing(true)}
          onMouseUp={() => setDrawing(false)}
          onMouseLeave={() => setDrawing(false)}
          onMouseMove={draw}
        />
      </div>
      <Button size="sm" onClick={exportMask}>
        {t('common.apply')}
      </Button>
    </div>
  );
}
