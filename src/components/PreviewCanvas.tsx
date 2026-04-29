import { useEffect, useState } from 'react';
import { useAnonymizeStore } from '@/store/anonymizeStore';
import { applyBlur, applyPixelate, applySolid, applyEmoji } from '@/ml/utils/anonymizeEffects';
import type { FaceBox } from '@/ml/utils/faceDetect';

interface PreviewCanvasProps {
  imageUrl: string;
  imgWidth: number;
  imgHeight: number;
}

export default function PreviewCanvas({ imageUrl, imgWidth, imgHeight }: PreviewCanvasProps) {
  const store = useAnonymizeStore();
  const { faces, effect, blurRadius, pixelateSize, solidColor, emojiInput } = store;
  const padding = store.padding ?? 4;
  const feather = store.feather ?? 0;
  const maskShape = store.maskShape ?? 'rect';

  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (faces.length === 0) {
      setDataUrl(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    let cancelled = false;

    img.onload = () => {
      if (cancelled) return;

      const canvas = document.createElement('canvas');
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

      for (let i = 0; i < faces.length; i++) {
        if (cancelled) break;
        const box: FaceBox = faces[i];

        switch (effect) {
          case 'blur':
            applyBlur(ctx, canvas, box, blurRadius, padding, feather, maskShape, imgWidth, imgHeight);
            break;
          case 'pixelate':
            applyPixelate(ctx, canvas, box, pixelateSize, padding, feather, maskShape, imgWidth, imgHeight);
            break;
          case 'solid':
            applySolid(ctx, canvas, box, solidColor, padding, feather, maskShape, imgWidth, imgHeight);
            break;
          case 'emoji':
            applyEmoji(ctx, canvas, box, store.randomEmojis[i] || emojiInput || '😶', padding, 0, 'rect', imgWidth, imgHeight);
            break;
        }
      }

      setDataUrl(canvas.toDataURL('image/png'));
    };

    return () => { cancelled = true; };
  }, [imageUrl, imgWidth, imgHeight, faces, effect, blurRadius, pixelateSize, solidColor, emojiInput, store.randomEmojis, padding, feather, maskShape]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      alt="preview"
      className="absolute inset-0 w-full h-full object-contain"
      draggable={false}
    />
  );
}
