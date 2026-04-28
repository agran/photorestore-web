import * as Comlink from 'comlink';
import type { TileOptions, Tile, ProcessedTile } from '@/ml/utils/tiling';

/**
 * Tiling worker — offloads tile split/merge operations.
 * TODO: implement actual tiling on ImageBitmap inputs.
 */

export interface TilingWorkerApi {
  splitImageBitmap(
    bitmap: ImageBitmap,
    opts: TileOptions
  ): Promise<{ tiles: Omit<Tile, 'canvas'>[]; bitmaps: ImageBitmap[] }>;
  mergeImageBitmaps(
    tiles: Omit<ProcessedTile, 'canvas' | 'outputCanvas'>[],
    bitmaps: ImageBitmap[],
    opts: TileOptions,
    srcW: number,
    srcH: number
  ): Promise<ImageBitmap>;
}

const api: TilingWorkerApi = {
  async splitImageBitmap(
    _bitmap: ImageBitmap,
    _opts: TileOptions
  ): Promise<{ tiles: Omit<Tile, 'canvas'>[]; bitmaps: ImageBitmap[] }> {
    // TODO: use OffscreenCanvas + tiling.splitTiles
    await Promise.resolve(); // placeholder
    return { tiles: [], bitmaps: [] };
  },

  async mergeImageBitmaps(
    _tiles: Omit<ProcessedTile, 'canvas' | 'outputCanvas'>[],
    _bitmaps: ImageBitmap[],
    _opts: TileOptions,
    _srcW: number,
    _srcH: number
  ): Promise<ImageBitmap> {
    // TODO: use tiling.mergeTiles on OffscreenCanvas
    return createImageBitmap(new ImageData(1, 1));
  },
};

Comlink.expose(api);
