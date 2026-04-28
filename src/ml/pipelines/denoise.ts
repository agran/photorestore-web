/**
 * Denoising pipeline stub.
 * TODO: implement using SCUNet ONNX model.
 */

export interface DenoiseOptions {
  modelId?: 'scunet';
  /** Noise level estimate 0–100 (used if model supports it) */
  noiseLevel?: number;
}

export interface DenoiseResult {
  canvas: HTMLCanvasElement;
  elapsedMs: number;
}

/**
 * Denoise an image.
 *
 * @param canvas  - Input image canvas
 * @param options - Denoise options
 * @returns Promise resolving to the denoised canvas
 */
export async function denoise(
  canvas: HTMLCanvasElement,
  _options: DenoiseOptions = {}
): Promise<DenoiseResult> {
  // TODO: tile image, run SCUNet on each tile, merge
  const start = performance.now();
  await Promise.resolve(); // placeholder

  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  output.getContext('2d')?.drawImage(canvas, 0, 0);

  return {
    canvas: output,
    elapsedMs: performance.now() - start,
  };
}
