/**
 * Tensor conversion utilities.
 *
 * Converts between HTMLCanvasElement pixel data and Float32 NCHW tensors
 * as expected by most ONNX vision models.
 */

/**
 * Convert an HTMLCanvasElement to a Float32Array in NCHW format.
 * Pixel values are normalized to [0, 1].
 *
 * @param canvas - Source canvas
 * @returns Float32Array shaped [1, 3, H, W]
 */
export function canvasToNCHW(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context');

  const { width: W, height: H } = canvas;
  const imageData = ctx.getImageData(0, 0, W, H);
  const { data } = imageData; // RGBA uint8

  const tensor = new Float32Array(3 * H * W);
  const rOffset = 0;
  const gOffset = H * W;
  const bOffset = 2 * H * W;

  for (let i = 0; i < H * W; i++) {
    tensor[rOffset + i] = data[i * 4] / 255;
    tensor[gOffset + i] = data[i * 4 + 1] / 255;
    tensor[bOffset + i] = data[i * 4 + 2] / 255;
  }

  return tensor;
}

/**
 * Convert a Float32Array in NCHW format back to an HTMLCanvasElement.
 * Values are clamped to [0, 1] and scaled to uint8.
 *
 * @param tensor - Float32Array shaped [1, 3, H, W] or [3, H, W]
 * @param W      - Output width
 * @param H      - Output height
 * @returns HTMLCanvasElement with the rendered image
 */
export function nchwToCanvas(tensor: Float32Array, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context');

  const imageData = ctx.createImageData(W, H);
  const out = imageData.data;

  const rOffset = 0;
  const gOffset = H * W;
  const bOffset = 2 * H * W;

  for (let i = 0; i < H * W; i++) {
    out[i * 4] = Math.round(clamp(tensor[rOffset + i]) * 255);
    out[i * 4 + 1] = Math.round(clamp(tensor[gOffset + i]) * 255);
    out[i * 4 + 2] = Math.round(clamp(tensor[bOffset + i]) * 255);
    out[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}
