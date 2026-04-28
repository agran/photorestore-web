import { Children, useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface BeforeAfterSplitProps {
  className?: string;
  children: React.ReactNode;
}

export default function BeforeAfterSplit({ className, children }: BeforeAfterSplitProps) {
  const [first, second] = Children.toArray(children);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPosition(x);
  }, []);

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
      className={cn('relative select-none overflow-hidden', className)}
      onPointerMove={(e) => { if (dragging.current) updatePosition(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
    >
      {/* Before — left side, clipped from right */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        {first}
      </div>

      {/* After — right side, clipped from left */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
        {second}
      </div>

      {/* Divider + handle */}
      <div className="absolute inset-y-0 w-0.5 bg-white shadow pointer-events-none" style={{ left: `${position}%` }} />
      <div
        role="slider"
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-8 w-8 cursor-col-resize items-center justify-center rounded-full bg-white shadow-lg ring-2 ring-primary outline-none focus:ring-4 z-10"
        style={{ left: `${position}%` }}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 2));
          if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 2));
        }}
      >
        <svg className="h-4 w-4 text-primary" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5 2 L2 8 L5 14 M11 2 L14 8 L11 14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
