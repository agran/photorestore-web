/**
 * Upscale pipeline stub.
 * TODO: implement using Real-ESRGAN ONNX model.
 */

export interface UpscaleOptions {
  modelId?: 'realesrgan-x4plus' | 'realesrgan-x4plus-anime';
  tileSize?: number;
  tileOverlap?: number;
}

export interface UpscaleResult {
  canvas: HTMLCanvasElement;
  scale: number;
  elapsedMs: number;
}

/**
 * Upscale an image using Real-ESRGAN.
 *
 * @param canvas  - Input image canvas
 * @param options - Upscale options
 * @returns Promise resolving to the upscaled canvas
 */
export async function upscale(
  canvas: HTMLCanvasElement,
  _options: UpscaleOptions = {}
): Promise<UpscaleResult> {
  // TODO: load model, split tiles, run inference, merge tiles
  const start = performance.now();
  await Promise.resolve(); // placeholder — remove once real implementation is added

  // Placeholder: return original canvas at scale 1
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  output.getContext('2d')?.drawImage(canvas, 0, 0);

  return {
    canvas: output,
    scale: 1,
    elapsedMs: performance.now() - start,
  };
}
