import { useState, useCallback, useRef, useEffect } from 'react';
import type { FaceBox } from '@/ml/utils/faceDetect';
import { useAnonymizeStore } from '@/store/anonymizeStore';

interface FaceOverlayProps {
  imageUrl: string;
  imgWidth: number;
  imgHeight: number;
}

const HANDLE_SIZE = 8;
const MIN_BOX = 12;

export default function FaceOverlay({ imageUrl, imgWidth, imgHeight }: FaceOverlayProps) {
  const { faces, updateFace, deleteFace, addFace, step } = useAnonymizeStore();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [dragging, setDragging] = useState<{
    index: number;
    corner: 'tl' | 'tr' | 'bl' | 'br' | null;
    startX: number;
    startY: number;
    startBox: FaceBox;
  } | null>(null);
  const [drawing, setDrawing] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const containerWidth = size.w || 1;
  const containerHeight = size.h || 1;

  const scaleX = containerWidth / imgWidth;
  const scaleY = containerHeight / imgHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (containerWidth - imgWidth * scale) / 2;
  const offsetY = (containerHeight - imgHeight * scale) / 2;

  const toScreen = useCallback(
    (x: number, y: number) => ({
      sx: offsetX + x * scale,
      sy: offsetY + y * scale,
    }),
    [offsetX, offsetY, scale]
  );

  const toImage = useCallback(
    (sx: number, sy: number) => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect || containerWidth === 0) return { x: 0, y: 0 };
      const rx = (sx - rect.left - offsetX) / scale;
      const ry = (sy - rect.top - offsetY) / scale;
      return { x: Math.max(0, Math.min(imgWidth, rx)), y: Math.max(0, Math.min(imgHeight, ry)) };
    },
    [offsetX, offsetY, scale, imgWidth, imgHeight, containerWidth]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number, corner: 'tl' | 'tr' | 'bl' | 'br' | null) => {
      if (step !== 'editing') return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const box = faces[index];
      setDragging({
        index,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        startBox: { ...box },
      });
    },
    [faces, step]
  );

  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (step !== 'editing') return;
      if (dragging) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = toImage(e.clientX, e.clientY);
      setDrawing({ startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y });
    },
    [step, dragging, toImage]
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      setDragging((prev) => {
        if (!prev) return null;
        const dx = (e.clientX - prev.startX) / scale;
        const dy = (e.clientY - prev.startY) / scale;
        const box = { ...prev.startBox };
        if (prev.corner === null) {
          box.x += dx;
          box.y += dy;
        } else {
          if (prev.corner.includes('l')) {
            box.x = prev.startBox.x + dx;
            box.width = Math.max(MIN_BOX, prev.startBox.width - dx);
          }
          if (prev.corner.includes('r')) {
            box.width = Math.max(MIN_BOX, prev.startBox.width + dx);
          }
          if (prev.corner.includes('t')) {
            box.y = prev.startBox.y + dy;
            box.height = Math.max(MIN_BOX, prev.startBox.height - dy);
          }
          if (prev.corner.includes('b')) {
            box.height = Math.max(MIN_BOX, prev.startBox.height + dy);
          }
        }
        box.x = Math.max(0, Math.min(imgWidth - box.width, box.x));
        box.y = Math.max(0, Math.min(imgHeight - box.height, box.y));
        box.width = Math.min(imgWidth - box.x, box.width);
        box.height = Math.min(imgHeight - box.y, box.height);
        updateFace(prev.index, box);
        return { ...prev };
      });
    };
    const handleUp = () => setDragging(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging, scale, imgWidth, imgHeight, updateFace]);

  useEffect(() => {
    if (!drawing) return;
    const handleMove = (e: PointerEvent) => {
      setDrawing((prev) => {
        if (!prev) return null;
        const pt = toImage(e.clientX, e.clientY);
        return { ...prev, currentX: pt.x, currentY: pt.y };
      });
    };
    const handleUp = () => {
      setDrawing((prev) => {
        if (!prev) return null;
        const x1 = Math.min(prev.startX, prev.currentX);
        const y1 = Math.min(prev.startY, prev.currentY);
        const w = Math.abs(prev.currentX - prev.startX);
        const h = Math.abs(prev.currentY - prev.startY);
        if (w > MIN_BOX && h > MIN_BOX) {
          addFace({ x: x1, y: y1, width: w, height: h, confidence: 1 });
        }
        return null;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [drawing, toImage, addFace]);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 select-none"
      style={{ cursor: step === 'editing' ? 'crosshair' : 'default', touchAction: 'none' }}
      onPointerDown={handleOverlayPointerDown}
    >
      <img
        src={imageUrl}
        alt="detection"
        className="absolute block"
        style={{
          left: offsetX,
          top: offsetY,
          width: imgWidth * scale,
          height: imgHeight * scale,
          pointerEvents: 'none',
        }}
        draggable={false}
      />

      {faces.map((box, i) => {
        const { sx, sy } = toScreen(box.x, box.y);
        const sw = box.width * scale;
        const sh = box.height * scale;

        return (
          <div key={i} style={{ position: 'absolute', left: sx, top: sy, width: sw, height: sh }}>
            <div
              className="absolute inset-0 border-2 border-cyan-400 bg-cyan-400/10"
              onPointerDown={(e) => handlePointerDown(e, i, null)}
            />
            <button
              className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => deleteFace(i)}
            >
              &times;
            </button>
            <span className="absolute -bottom-5 left-0 text-[10px] text-cyan-300">
              {(box.confidence * 100).toFixed(0)}%
            </span>
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
              const isLeft = corner.includes('l');
              const isTop = corner.includes('t');
              return (
                <div
                  key={corner}
                  className="absolute z-10 bg-white border-2 border-cyan-400 rounded-sm"
                  style={{
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    [isLeft ? 'left' : 'right']: -HANDLE_SIZE / 2,
                    [isTop ? 'top' : 'bottom']: -HANDLE_SIZE / 2,
                    cursor: `${corner === 'tl' || corner === 'br' ? 'nwse' : 'nesw'}-resize`,
                  }}
                  onPointerDown={(e) => handlePointerDown(e, i, corner)}
                />
              );
            })}
          </div>
        );
      })}

      {drawing && (
        <div
          className="absolute border border-dashed border-cyan-400 bg-cyan-400/20"
          style={{
            left: offsetX + Math.min(drawing.startX, drawing.currentX) * scale,
            top: offsetY + Math.min(drawing.startY, drawing.currentY) * scale,
            width: Math.abs(drawing.currentX - drawing.startX) * scale,
            height: Math.abs(drawing.currentY - drawing.startY) * scale,
          }}
        />
      )}
    </div>
  );
}
