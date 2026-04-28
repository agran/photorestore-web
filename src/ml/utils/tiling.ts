/**
 * Tiling utilities for processing large images in chunks.
 *
 * Images are split into overlapping tiles, processed independently,
 * then merged back using cosine-window blending to avoid seam artifacts.
 */

export interface TileOptions {
  /** Tile size in pixels (input space) */
  tileSize: number;
  /** Overlap between adjacent tiles in pixels */
  overlap: number;
  /** Scale factor applied by the model (e.g. 4 for 4× upscale) */
  scale: number;
}

export interface Tile {
  /** Source x offset in the input image */
  srcX: number;
  /** Source y offset in the input image */
  srcY: number;
  /** Tile width in input space */
  srcW: number;
  /** Tile height in input space */
  srcH: number;
  /** Canvas containing the tile pixels */
  canvas: HTMLCanvasElement;
}

export interface ProcessedTile extends Tile {
  /** Output canvas (scale× larger) */
  outputCanvas: HTMLCanvasElement;
}

/**
 * Build a cosine blending window of length `n`.
 * Values ramp from 0 → 1 → 0 smoothly.
 */
function cosineWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n);
  }
  return w;
}

/**
 * Split an image canvas into overlapping tiles.
 *
 * @param source - The source HTMLCanvasElement to split
 * @param opts   - Tiling options
 * @returns Array of Tile objects with their source coords and canvas
 */
export function splitTiles(source: HTMLCanvasElement, opts: TileOptions): Tile[] {
  const { tileSize, overlap } = opts;
  const { width, height } = source;
  const ctx = source.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context from source canvas');

  const stride = tileSize - overlap;
  if (stride <= 0) throw new Error('overlap must be less than tileSize');

  const tiles: Tile[] = [];

  // Compute tile start positions — ensure we always cover the full image
  const xStarts: number[] = [];
  for (let x = 0; x < width; x += stride) {
    xStarts.push(x);
  }
  if (xStarts.length === 0 || xStarts[xStarts.length - 1] + tileSize < width) {
    const last = Math.max(0, width - tileSize);
    if (xStarts[xStarts.length - 1] !== last) xStarts.push(last);
  }

  const yStarts: number[] = [];
  for (let y = 0; y < height; y += stride) {
    yStarts.push(y);
  }
  if (yStarts.length === 0 || yStarts[yStarts.length - 1] + tileSize < height) {
    const last = Math.max(0, height - tileSize);
    if (yStarts[yStarts.length - 1] !== last) yStarts.push(last);
  }

  for (const y of yStarts) {
    for (const x of xStarts) {
      const srcW = Math.min(tileSize, width - x);
      const srcH = Math.min(tileSize, height - y);

      const tileCanvas = createCanvas(srcW, srcH);
      const tileCtx = tileCanvas.getContext('2d')!;
      tileCtx.drawImage(source, x, y, srcW, srcH, 0, 0, srcW, srcH);

      tiles.push({ srcX: x, srcY: y, srcW, srcH, canvas: tileCanvas });
    }
  }

  return tiles;
}

/**
 * Merge processed tiles back into a single canvas using cosine-window blending.
 *
 * @param tiles  - Array of ProcessedTile (with outputCanvas filled)
 * @param opts   - Same TileOptions used during split
 * @param srcW   - Original source image width
 * @param srcH   - Original source image height
 * @returns Merged HTMLCanvasElement at scale× resolution
 */
export function mergeTiles(
  tiles: ProcessedTile[],
  opts: TileOptions,
  srcW: number,
  srcH: number
): HTMLCanvasElement {
  const { scale } = opts;
  // tileSize and overlap are used during split; here we only need scale
  // to compute output dimensions from src dimensions

  const outW = srcW * scale;
  const outH = srcH * scale;
  const outCanvas = createCanvas(outW, outH);

  // Use float32 accumulators for blending
  const accumR = new Float32Array(outW * outH);
  const accumG = new Float32Array(outW * outH);
  const accumB = new Float32Array(outW * outH);
  const accumA = new Float32Array(outW * outH);
  const accumWeight = new Float32Array(outW * outH);

  for (const tile of tiles) {
    const tw = tile.outputCanvas.width;
    const th = tile.outputCanvas.height;

    const tileCtx = tile.outputCanvas.getContext('2d')!;
    const imageData = tileCtx.getImageData(0, 0, tw, th);
    const data = imageData.data;

    // Build 2D weight mask using cosine window
    const wx = cosineWindow(tw);
    const wy = cosineWindow(th);

    const dstX = tile.srcX * scale;
    const dstY = tile.srcY * scale;

    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const ox = dstX + tx;
        const oy = dstY + ty;
        if (ox >= outW || oy >= outH) continue;

        const outIdx = oy * outW + ox;
        const srcIdx = (ty * tw + tx) * 4;
        const w = wx[tx] * wy[ty];

        accumR[outIdx] += data[srcIdx] * w;
        accumG[outIdx] += data[srcIdx + 1] * w;
        accumB[outIdx] += data[srcIdx + 2] * w;
        accumA[outIdx] += data[srcIdx + 3] * w;
        accumWeight[outIdx] += w;
      }
    }
  }

  // Normalize and write to output canvas
  const outCtx = outCanvas.getContext('2d')!;
  const outData = outCtx.createImageData(outW, outH);
  const out = outData.data;

  for (let i = 0; i < outW * outH; i++) {
    const w = accumWeight[i];
    if (w > 0) {
      out[i * 4] = Math.round(accumR[i] / w);
      out[i * 4 + 1] = Math.round(accumG[i] / w);
      out[i * 4 + 2] = Math.round(accumB[i] / w);
      out[i * 4 + 3] = Math.round(accumA[i] / w);
    }
  }

  outCtx.putImageData(outData, 0, 0);

  return outCanvas;
}

/** Helper: create an HTMLCanvasElement of given size */
function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  // Node / jsdom environment
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas: nc } = require('canvas') as {
    createCanvas: (w: number, h: number) => HTMLCanvasElement;
  };
  return nc(width, height);
}
