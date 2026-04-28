import { describe, it, expect, beforeEach } from 'vitest';
import { splitTiles, mergeTiles, type TileOptions, type ProcessedTile } from '@/ml/utils/tiling';

/** Create a simple colored canvas for testing */
function makeCanvas(width: number, height: number, fillStyle = 'rgb(128,64,200)'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/** Get average pixel value of a channel from a canvas */
function getAverageChannel(canvas: HTMLCanvasElement, channel: 0 | 1 | 2): number {
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  for (let i = channel; i < data.length; i += 4) sum += data[i];
  return sum / (data.length / 4);
}

describe('splitTiles', () => {
  it('produces at least one tile for a small image', () => {
    const src = makeCanvas(64, 64);
    const opts: TileOptions = { tileSize: 32, overlap: 8, scale: 1 };
    const tiles = splitTiles(src, opts);
    expect(tiles.length).toBeGreaterThan(0);
  });

  it('tiles cover the full image width and height', () => {
    const W = 100;
    const H = 80;
    const src = makeCanvas(W, H);
    const opts: TileOptions = { tileSize: 48, overlap: 8, scale: 1 };
    const tiles = splitTiles(src, opts);

    // Check that (0,0) and (W-1,H-1) corners are covered
    const coversTopLeft = tiles.some((t) => t.srcX === 0 && t.srcY === 0);
    const coversBottomRight = tiles.some(
      (t) => t.srcX + t.srcW >= W && t.srcY + t.srcH >= H
    );
    expect(coversTopLeft).toBe(true);
    expect(coversBottomRight).toBe(true);
  });

  it('each tile canvas has the correct dimensions', () => {
    const src = makeCanvas(64, 64);
    const opts: TileOptions = { tileSize: 32, overlap: 4, scale: 1 };
    const tiles = splitTiles(src, opts);
    for (const tile of tiles) {
      expect(tile.canvas.width).toBe(tile.srcW);
      expect(tile.canvas.height).toBe(tile.srcH);
    }
  });

  it('throws when overlap >= tileSize', () => {
    const src = makeCanvas(64, 64);
    expect(() =>
      splitTiles(src, { tileSize: 32, overlap: 32, scale: 1 })
    ).toThrow();
  });
});

describe('mergeTiles (split→merge round-trip at scale=1)', () => {
  beforeEach(() => {
    // nothing
  });

  it('produces output of correct size at scale 1', () => {
    const W = 64;
    const H = 48;
    const src = makeCanvas(W, H);
    const opts: TileOptions = { tileSize: 32, overlap: 8, scale: 1 };
    const tiles = splitTiles(src, opts);
    const processedTiles: ProcessedTile[] = tiles.map((t) => ({
      ...t,
      outputCanvas: t.canvas,
    }));
    const merged = mergeTiles(processedTiles, opts, W, H);
    expect(merged.width).toBe(W);
    expect(merged.height).toBe(H);
  });

  it('round-trip preserves color within epsilon', () => {
    const W = 64;
    const H = 64;
    const R = 128;
    const G = 64;
    const B = 200;
    const src = makeCanvas(W, H, `rgb(${R},${G},${B})`);
    const opts: TileOptions = { tileSize: 32, overlap: 8, scale: 1 };
    const tiles = splitTiles(src, opts);
    const processedTiles: ProcessedTile[] = tiles.map((t) => ({
      ...t,
      outputCanvas: t.canvas,
    }));
    const merged = mergeTiles(processedTiles, opts, W, H);

    const epsilon = 5; // cosine blending may introduce minor differences at edges
    expect(getAverageChannel(merged, 0)).toBeCloseTo(R, -1);
    expect(Math.abs(getAverageChannel(merged, 0) - R)).toBeLessThan(epsilon);
    expect(Math.abs(getAverageChannel(merged, 1) - G)).toBeLessThan(epsilon);
    expect(Math.abs(getAverageChannel(merged, 2) - B)).toBeLessThan(epsilon);
  });

  it('scale=4 output is 4× larger', () => {
    const W = 32;
    const H = 32;
    const src = makeCanvas(W, H);
    const opts: TileOptions = { tileSize: 32, overlap: 0, scale: 4 };
    const tiles = splitTiles(src, opts);
    const processedTiles: ProcessedTile[] = tiles.map((t) => {
      // Simulate 4× upscaled output tile
      const out = makeCanvas(t.srcW * 4, t.srcH * 4);
      return { ...t, outputCanvas: out };
    });
    const merged = mergeTiles(processedTiles, opts, W, H);
    expect(merged.width).toBe(W * 4);
    expect(merged.height).toBe(H * 4);
  });
});
