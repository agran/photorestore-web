import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ImageCompareProps {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

/** Before/after image comparison slider with draggable handle */
export default function ImageCompare({ beforeUrl, afterUrl, className }: ImageCompareProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50); // 0–100 %
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPosition(x * 100);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const onPointerUp = () => {
    dragging.current = false;
  };

  // Keyboard support
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 2));
    if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 2));
  };

  // Touch support
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      updatePosition(e.touches[0].clientX);
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [updatePosition]);

  return (
    <div
      ref={containerRef}
      className={cn('relative select-none overflow-hidden rounded-lg', className)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* After (base layer) */}
      <img
        src={afterUrl}
        alt={t('imageCompare.afterAlt')}
        className="block h-full w-full object-contain"
        draggable={false}
      />

      {/* Before (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img
          src={beforeUrl}
          alt={t('imageCompare.beforeAlt')}
          className="block h-full w-full object-contain"
          draggable={false}
          style={{ width: containerRef.current?.clientWidth ?? 'auto' }}
        />
      </div>

      {/* Divider line */}
      <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${position}%` }} />

      {/* Handle */}
      <div
        role="slider"
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('editor.sliderLabel')}
        tabIndex={0}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-8 w-8 cursor-col-resize items-center justify-center rounded-full bg-white shadow-lg ring-2 ring-primary outline-none focus:ring-4"
        style={{ left: `${position}%` }}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <svg className="h-4 w-4 text-primary" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M5 2 L2 8 L5 14 M11 2 L14 8 L11 14"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Labels */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {t('imageCompare.before')}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {t('imageCompare.after')}
      </div>
    </div>
  );
}
