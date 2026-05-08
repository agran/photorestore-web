import { useEffect, useRef, useState } from 'react';
import { useAnonymizeStore } from '@/store/anonymizeStore';
import {
  applyBlur,
  applyPixelate,
  applySolid,
  applyEmoji,
  scaleKernel,
  scaleEffectStrength,
} from '@/ml/utils/anonymizeEffects';
import type { FaceBox } from '@/ml/utils/faceDetect';

interface PreviewCanvasProps {
  imageUrl: string;
  imgWidth: number;
  imgHeight: number;
}

const DEBOUNCE_MS = 80;

export default function PreviewCanvas({ imageUrl, imgWidth, imgHeight }: PreviewCanvasProps) {
  const store = useAnonymizeStore();
  const { faces, effect, blurRadius, pixelateSize, solidColor, emojiInput } = store;
  const padding = store.padding ?? 4;
  const feather = store.feather ?? 0;
  const maskShape = store.maskShape ?? 'rect';

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // Keep the previous blob URL around so we can revoke it after the next one
  // is set — direct revoke before set caused a flash of broken-image when the
  // browser hadn't picked up the new src yet.
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (faces.length === 0) {
      setBlobUrl((cur) => {
        if (cur) URL.revokeObjectURL(cur);
        prevUrlRef.current = null;
        return null;
      });
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const render = () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (cancelled) return;

        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

        // Match the pipeline: slider values are calibrated against a 100px-
        // wide face and scaled per face so the preview reflects the same
        // strength the user will see after Apply.
        for (let i = 0; i < faces.length; i++) {
          if (cancelled) return;
          const box: FaceBox = faces[i];
          const bboxW = box.width;
          const scaledPad = scaleKernel(padding, bboxW);
          const scaledFeather = scaleKernel(feather, bboxW);

          switch (effect) {
            case 'blur': {
              const radius = scaleEffectStrength(blurRadius, bboxW);
              applyBlur(ctx, canvas, box, radius, scaledPad, scaledFeather, maskShape, imgWidth, imgHeight);
              break;
            }
            case 'pixelate': {
              const size = scaleEffectStrength(pixelateSize, bboxW, 2);
              applyPixelate(ctx, canvas, box, size, scaledPad, scaledFeather, maskShape, imgWidth, imgHeight);
              break;
            }
            case 'solid':
              applySolid(ctx, canvas, box, solidColor, scaledPad, scaledFeather, maskShape, imgWidth, imgHeight);
              break;
            case 'emoji':
              applyEmoji(ctx, canvas, box, store.randomEmojis[i] || emojiInput || '😶', scaledPad, 0, maskShape, imgWidth, imgHeight);
              break;
          }
        }

        // Encode as JPEG blob URL — orders of magnitude cheaper than
        // toDataURL('image/png') (synchronous, base64-encoded). 0.85 quality
        // is indistinguishable from PNG for a slider preview.
        canvas.toBlob(
          (blob) => {
            if (cancelled || !blob) return;
            const url = URL.createObjectURL(blob);
            const prev = prevUrlRef.current;
            prevUrlRef.current = url;
            setBlobUrl(url);
            if (prev) URL.revokeObjectURL(prev);
          },
          'image/jpeg',
          0.85,
        );
      };

      img.onerror = () => { /* keep last preview if load fails */ };
      img.src = imageUrl;
    };

    // Debounce — slider drags fire onChange dozens of times per second, and
    // each pass pixelates/blurs the full source. Without this, dragging makes
    // the UI stutter on big photos.
    timeoutId = setTimeout(render, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [imageUrl, imgWidth, imgHeight, faces, effect, blurRadius, pixelateSize, solidColor, emojiInput, store.randomEmojis, padding, feather, maskShape]);

  // Revoke the last blob URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, []);

  if (!blobUrl) return null;

  return (
    <img
      src={blobUrl}
      alt="preview"
      className="absolute inset-0 w-full h-full object-contain"
      draggable={false}
    />
  );
}
