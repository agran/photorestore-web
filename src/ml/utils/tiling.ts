/**
 * Tiling utilities for processing large images in chunks.
 *
 * Images are split into overlapping tiles, processed independently, then
 * merged back using cosine-window blending to avoid seam artifacts.
 *
 * Streaming design: callers iterate tile *coordinates*, materialize one
 * input canvas at a time, hand the inferred output to a TileMerger, and
 * drop the canvas before processing the next tile. Peak memory is one
 * tile's output canvas + the merger's accumulator buffers — not N tiles'
 * worth of canvases sitting around in an array.
 */

export interface TileOptions {
  /** Tile size in pixels (input space) */
  tileSize: number;
  /** Overlap between adjacent tiles in pixels */
  overlap: number;
  /** Scale factor applied by the model (e.g. 4 for 4× upscale) */
  scale: number;
}

export interface TileCoord {
  /** Source x offset in the input image */
  srcX: number;
  /** Source y offset in the input image */
  srcY: number;
  /** Tile width in input space */
  srcW: number;
  /** Tile height in input space */
  srcH: number;
}

/** Plan tile positions covering a source image. No canvases allocated here. */
export function planTiles(
  sourceWidth: number,
  sourceHeight: number,
  opts: TileOptions,
): TileCoord[] {
  const { tileSize, overlap } = opts;
  const stride = tileSize - overlap;
  if (stride <= 0) throw new Error('overlap must be less than tileSize');

  const xStarts: number[] = [];
  for (let x = 0; x < sourceWidth; x += stride) xStarts.push(x);
  if (xStarts.length === 0 || xStarts[xStarts.length - 1] + tileSize < sourceWidth) {
    const last = Math.max(0, sourceWidth - tileSize);
    if (xStarts[xStarts.length - 1] !== last) xStarts.push(last);
  }

  const yStarts: number[] = [];
  for (let y = 0; y < sourceHeight; y += stride) yStarts.push(y);
  if (yStarts.length === 0 || yStarts[yStarts.length - 1] + tileSize < sourceHeight) {
    const last = Math.max(0, sourceHeight - tileSize);
    if (yStarts[yStarts.length - 1] !== last) yStarts.push(last);
  }

  const coords: TileCoord[] = [];
  for (const y of yStarts) {
    for (const x of xStarts) {
      coords.push({
        srcX: x,
        srcY: y,
        srcW: Math.min(tileSize, sourceWidth - x),
        srcH: Math.min(tileSize, sourceHeight - y),
      });
    }
  }
  return coords;
}

/** Materialize a single tile from the source as a canvas. */
export function extractTile(source: HTMLCanvasElement, coord: TileCoord): HTMLCanvasElement {
  const c = createCanvas(coord.srcW, coord.srcH);
  c.getContext('2d')!.drawImage(
    source,
    coord.srcX, coord.srcY, coord.srcW, coord.srcH,
    0, 0, coord.srcW, coord.srcH,
  );
  return c;
}

/** Build a cosine blending window of length `n`. Values ramp 0 → 1 → 0. */
function cosineWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n);
  }
  return w;
}

/**
 * Streaming merger: accepts processed tiles one at a time, accumulates the
 * weighted blend, then produces the final canvas on `finalize()`.
 *
 * Peak memory: 5 × Float32Array(outW × outH) for accumulators (RGBA + weight)
 * plus the *currently-being-blended* tile's ImageData. Caller is expected to
 * drop the previous tile's canvas before adding the next.
 *
 * For an 8K output (30720×17280 at 4× scale of a 4K source) this is ~10 GB —
 * the practical OOM limit. Callers should keep input ≤ 4K (yields ~2.6 GB) or
 * implement their own row-band streaming on top of this.
 */
export class TileMerger {
  private readonly outW: number;
  private readonly outH: number;
  private readonly accumR: Float32Array;
  private readonly accumG: Float32Array;
  private readonly accumB: Float32Array;
  private readonly accumA: Float32Array;
  private readonly accumWeight: Float32Array;
  private readonly scale: number;

  constructor(opts: TileOptions, srcW: number, srcH: number) {
    this.scale = opts.scale;
    this.outW = srcW * opts.scale;
    this.outH = srcH * opts.scale;
    const n = this.outW * this.outH;
    this.accumR = new Float32Array(n);
    this.accumG = new Float32Array(n);
    this.accumB = new Float32Array(n);
    this.accumA = new Float32Array(n);
    this.accumWeight = new Float32Array(n);
  }

  addTile(coord: TileCoord, outputCanvas: HTMLCanvasElement): void {
    const tw = outputCanvas.width;
    const th = outputCanvas.height;
    const tileCtx = outputCanvas.getContext('2d')!;
    const data = tileCtx.getImageData(0, 0, tw, th).data;

    const wx = cosineWindow(tw);
    const wy = cosineWindow(th);

    const dstX = coord.srcX * this.scale;
    const dstY = coord.srcY * this.scale;
    const outW = this.outW;
    const outH = this.outH;

    for (let ty = 0; ty < th; ty++) {
      const oy = dstY + ty;
      if (oy >= outH) break;
      const wyT = wy[ty];
      const rowBase = oy * outW;
      for (let tx = 0; tx < tw; tx++) {
        const ox = dstX + tx;
        if (ox >= outW) break;
        const outIdx = rowBase + ox;
        const srcIdx = (ty * tw + tx) * 4;
        const w = wx[tx] * wyT;

        this.accumR[outIdx] += data[srcIdx] * w;
        this.accumG[outIdx] += data[srcIdx + 1] * w;
        this.accumB[outIdx] += data[srcIdx + 2] * w;
        this.accumA[outIdx] += data[srcIdx + 3] * w;
        this.accumWeight[outIdx] += w;
      }
    }
  }

  finalize(): HTMLCanvasElement {
    const outCanvas = createCanvas(this.outW, this.outH);
    const outCtx = outCanvas.getContext('2d')!;
    const outData = outCtx.createImageData(this.outW, this.outH);
    const out = outData.data;

    const total = this.outW * this.outH;
    for (let i = 0; i < total; i++) {
      const w = this.accumWeight[i];
      if (w > 0) {
        out[i * 4] = this.accumR[i] / w;
        out[i * 4 + 1] = this.accumG[i] / w;
        out[i * 4 + 2] = this.accumB[i] / w;
        out[i * 4 + 3] = this.accumA[i] / w;
      }
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }
}

// ---- Backwards-compatible non-streaming API (used by tests) ----

export interface Tile extends TileCoord {
  canvas: HTMLCanvasElement;
}

export interface ProcessedTile extends Tile {
  outputCanvas: HTMLCanvasElement;
}

/**
 * Materialize all tiles up front. Convenient for tests and small images.
 * Production callers should prefer planTiles + extractTile to bound peak
 * memory — for a large image this allocates O(N) tile canvases at once.
 */
export function splitTiles(source: HTMLCanvasElement, opts: TileOptions): Tile[] {
  return planTiles(source.width, source.height, opts).map((coord) => ({
    ...coord,
    canvas: extractTile(source, coord),
  }));
}

/**
 * Merge processed tiles by feeding them to a TileMerger. Convenient wrapper
 * for callers that already hold all output tiles; production callers should
 * stream into TileMerger directly to avoid holding every output canvas.
 */
export function mergeTiles(
  tiles: ProcessedTile[],
  opts: TileOptions,
  srcW: number,
  srcH: number,
): HTMLCanvasElement {
  const merger = new TileMerger(opts, srcW, srcH);
  for (const tile of tiles) merger.addTile(tile, tile.outputCanvas);
  return merger.finalize();
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}
