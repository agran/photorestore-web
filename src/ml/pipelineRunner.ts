import { useEditorStore } from '@/store/editorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { upscale, type UpscaleOptions, isModelCached } from '@/ml/pipelines/upscale';
import { faceRestore, type FaceRestoreOptions } from '@/ml/pipelines/faceRestore';
import { inpaint, type InpaintOptions } from '@/ml/pipelines/inpaint';
import { denoise, type DenoiseOptions } from '@/ml/pipelines/denoise';
import { anonymize, type AnonymizeOptions } from '@/ml/pipelines/anonymize';
import { getModel } from '@/ml/modelRegistry';

export type PipelineType = 'upscale' | 'faceRestore' | 'inpaint' | 'denoise' | 'anonymize';

// Discriminated union: each variant locks `type` to one PipelineType, so the
// switch below narrows `options` to the exact pipeline's option shape and a
// future field clash between pipelines (e.g. inpaint adding `effect`) becomes
// a type error instead of a silent miscall.
type PipelineCall =
  | { type: 'upscale'; options?: UpscaleOptions }
  | { type: 'faceRestore'; options?: FaceRestoreOptions }
  | { type: 'inpaint'; options?: InpaintOptions }
  | { type: 'denoise'; options?: DenoiseOptions }
  | { type: 'anonymize'; options?: AnonymizeOptions };

type PipelineOptions = UpscaleOptions | FaceRestoreOptions | InpaintOptions | DenoiseOptions | AnonymizeOptions;

function loadImageToCanvas(url: string): Promise<HTMLCanvasElement> {
  // Don't revoke `url` here: it lives in editorStore as currentImageUrl and
  // (on the first run) doubles as originalImageUrl plus a history entry.
  // Revoking would kill those references — before/after view and revert-to-
  // original would render broken images.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = (event) => {
      // The browser doesn't expose the underlying network error here — best we
      // can do is surface the URL kind so debugging "blob not found" vs CORS
      // vs decode failure is at least possible.
      const kind = url.startsWith('blob:') ? 'blob' : url.startsWith('data:') ? 'data' : 'remote';
      const detail = typeof event === 'string' ? event : '';
      reject(new Error(`Failed to load image (${kind} url${detail ? `: ${detail}` : ''})`));
    };
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

/**
 * Inpaint requires a real user-painted mask. The "fill the entire image"
 * fallback that lived here was misleading — it would silently inpaint
 * everything if the UI forgot to pass a mask. Now callers must pass one,
 * and this helper exists only as an opt-in placeholder for tests / demos.
 */
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

export async function runPipeline(
  type: PipelineType,
  options?: PipelineOptions,
  sourceUrlOverride?: string,
): Promise<void> {
  const store = useEditorStore.getState();
  const settings = useSettingsStore.getState();
  // Caller may force a specific source (e.g. upscale always reads the
  // pristine original instead of stacking on the previous upscale result).
  const imageUrl = sourceUrlOverride ?? store.currentImageUrl;
  if (!imageUrl) return;

  const jobId = crypto.randomUUID();
  store.setJob({ id: jobId, pipeline: type, status: 'running', progress: 0 });

  try {
    const canvas = await loadImageToCanvas(imageUrl);

    let result: { canvas: HTMLCanvasElement };

    // Build a discriminated call to narrow options per branch — TS will
    // complain if a pipeline gains an option that conflicts with another.
    const call = { type, options } as PipelineCall;
    switch (call.type) {
      case 'upscale': {
        const upsOpts = call.options;
        result = await upscale(canvas, {
          ...upsOpts,
          tileSize: upsOpts?.tileSize ?? settings.tileSize,
          tileOverlap: upsOpts?.tileOverlap ?? settings.tileOverlap,
          onProgress: reportProgress,
        });
        break;
      }
      case 'faceRestore':
        result = await faceRestore(canvas, call.options);
        break;
      case 'inpaint': {
        const inpaintOpts = call.options;
        const opts: InpaintOptions = {
          ...inpaintOpts,
          maskCanvas:
            inpaintOpts?.maskCanvas ?? createDefaultMask(canvas.width, canvas.height),
        };
        result = await inpaint(canvas, opts);
        break;
      }
      case 'denoise':
        result = await denoise(canvas, call.options);
        break;
      case 'anonymize':
        result = await anonymize(canvas, call.options);
        break;
      default: {
        const _exhaustive: never = call;
        throw new Error(`Unknown pipeline: ${String((_exhaustive as { type: unknown }).type)}`);
      }
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
