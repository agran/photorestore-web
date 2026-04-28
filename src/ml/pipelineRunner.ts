import { useEditorStore } from '@/store/editorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { upscale, type UpscaleOptions, isModelCached } from '@/ml/pipelines/upscale';
import { faceRestore, type FaceRestoreOptions } from '@/ml/pipelines/faceRestore';
import { inpaint, type InpaintOptions } from '@/ml/pipelines/inpaint';
import { denoise, type DenoiseOptions } from '@/ml/pipelines/denoise';
import { anonymize, type AnonymizeOptions } from '@/ml/pipelines/anonymize';
import { getModel } from '@/ml/modelRegistry';

export type PipelineType = 'upscale' | 'faceRestore' | 'inpaint' | 'denoise' | 'anonymize';

type PipelineOptions = UpscaleOptions | FaceRestoreOptions | InpaintOptions | DenoiseOptions | AnonymizeOptions;

function loadImageToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, 'image/png');
  });
}

function createDefaultMask(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function reportProgress(percent: number) {
  useEditorStore.getState().updateJobProgress(Math.min(Math.round(percent), 99));
}

export async function runPipeline(type: PipelineType, options?: PipelineOptions): Promise<void> {
  const store = useEditorStore.getState();
  const settings = useSettingsStore.getState();
  const imageUrl = store.currentImageUrl;
  if (!imageUrl) return;

  const jobId = crypto.randomUUID();
  store.setJob({ id: jobId, pipeline: type, status: 'running', progress: 0 });

  try {
    const canvas = await loadImageToCanvas(imageUrl);

    let result: { canvas: HTMLCanvasElement };

    switch (type) {
      case 'upscale': {
        const upsOpts = options as UpscaleOptions;
        result = await upscale(canvas, {
          ...upsOpts,
          tileSize: upsOpts?.tileSize ?? settings.tileSize,
          tileOverlap: upsOpts?.tileOverlap ?? settings.tileOverlap,
          onProgress: reportProgress,
        });
        break;
      }
      case 'faceRestore':
        result = await faceRestore(canvas, options as FaceRestoreOptions);
        break;
      case 'inpaint': {
        const inpaintOpts = options as InpaintOptions;
        if (!inpaintOpts?.maskCanvas) {
          inpaintOpts.maskCanvas = createDefaultMask(canvas.width, canvas.height);
        }
        result = await inpaint(canvas, inpaintOpts);
        break;
      }
      case 'denoise':
        result = await denoise(canvas, options as DenoiseOptions);
        break;
      case 'anonymize':
        result = await anonymize(canvas, options);
        break;
      default:
        throw new Error(`Unknown pipeline: ${String(type)}`);
    }

    const blob = await canvasToBlob(result.canvas);
    const resultUrl = URL.createObjectURL(blob);

    const modelId =
      type === 'upscale' ? (options as UpscaleOptions)?.modelId : undefined;
    const modelName = modelId ? getModel(modelId)?.name : type;
    const label = modelName ?? type;

    store.setImage(resultUrl);
    store.pushHistory({ imageUrl: resultUrl, label });
    store.setJob({ id: jobId, pipeline: type, status: 'done', progress: 100 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setJob({
      id: jobId,
      pipeline: type,
      status: 'error',
      progress: 0,
      error: message,
    });
    throw err;
  }
}

export { isModelCached, createDefaultMask };
