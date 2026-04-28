import { describe, it, expect } from 'vitest';
import { canvasToNCHW, nchwToCanvas } from '@/ml/utils/tensor';

/** Create a filled canvas */
function makeCanvas(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

describe('canvasToNCHW', () => {
  it('returns Float32Array with length 3*W*H', () => {
    const W = 4;
    const H = 6;
    const canvas = makeCanvas(W, H, 128, 64, 200);
    const tensor = canvasToNCHW(canvas);
    expect(tensor.length).toBe(3 * W * H);
  });

  it('normalizes pixel values to [0, 1]', () => {
    const canvas = makeCanvas(2, 2, 255, 0, 128);
    const tensor = canvasToNCHW(canvas);
    for (const v of tensor) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('R channel is first, then G, then B', () => {
    const W = 2;
    const H = 2;
    const R = 200;
    const G = 100;
    const B = 50;
    const canvas = makeCanvas(W, H, R, G, B);
    const tensor = canvasToNCHW(canvas);
    const rAvg = tensor.slice(0, W * H).reduce((a, b) => a + b, 0) / (W * H);
    const gAvg = tensor.slice(W * H, 2 * W * H).reduce((a, b) => a + b, 0) / (W * H);
    const bAvg = tensor.slice(2 * W * H).reduce((a, b) => a + b, 0) / (W * H);
    expect(rAvg).toBeCloseTo(R / 255, 2);
    expect(gAvg).toBeCloseTo(G / 255, 2);
    expect(bAvg).toBeCloseTo(B / 255, 2);
  });
});

describe('nchwToCanvas', () => {
  it('returns canvas with correct dimensions', () => {
    const W = 4;
    const H = 3;
    const tensor = new Float32Array(3 * W * H).fill(0.5);
    const out = nchwToCanvas(tensor, W, H);
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
  });

  it('clamps values outside [0, 1]', () => {
    const W = 2;
    const H = 2;
    const tensor = new Float32Array(3 * W * H);
    tensor.fill(2.0); // overflow
    const out = nchwToCanvas(tensor, W, H);
    const ctx = out.getContext('2d')!;
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(255);
      expect(data[i + 1]).toBe(255);
      expect(data[i + 2]).toBe(255);
      expect(data[i + 3]).toBe(255);
    }
  });
});

describe('canvasToNCHW → nchwToCanvas round-trip', () => {
  it('preserves pixel values within epsilon', () => {
    const W = 8;
    const H = 8;
    const R = 180;
    const G = 90;
    const B = 45;
    const src = makeCanvas(W, H, R, G, B);
    const tensor = canvasToNCHW(src);
    const out = nchwToCanvas(tensor, W, H);
    const ctx = out.getContext('2d')!;
    const data = ctx.getImageData(0, 0, W, H).data;

    const epsilon = 2; // rounding to uint8
    for (let i = 0; i < data.length; i += 4) {
      expect(Math.abs(data[i] - R)).toBeLessThanOrEqual(epsilon);
      expect(Math.abs(data[i + 1] - G)).toBeLessThanOrEqual(epsilon);
      expect(Math.abs(data[i + 2] - B)).toBeLessThanOrEqual(epsilon);
      expect(data[i + 3]).toBe(255);
    }
  });
});
