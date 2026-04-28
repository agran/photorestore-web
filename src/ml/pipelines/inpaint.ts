/**
 * Inpainting pipeline stub.
 * TODO: implement using LaMa ONNX model.
 */

export interface InpaintOptions {
  modelId?: 'lama';
  /** Mask canvas — white pixels indicate regions to fill */
  maskCanvas: HTMLCanvasElement;
}

export interface InpaintResult {
  canvas: HTMLCanvasElement;
  elapsedMs: number;
}

/**
 * Inpaint (fill) masked regions of an image.
 *
 * @param canvas  - Input image canvas
 * @param options - Inpaint options including mask
 * @returns Promise resolving to the inpainted canvas
 */
export async function inpaint(
  canvas: HTMLCanvasElement,
  _options: InpaintOptions
): Promise<InpaintResult> {
  // TODO: prepare image+mask tensor, run LaMa, decode result
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
