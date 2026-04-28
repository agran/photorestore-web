import * as Comlink from 'comlink';
import type { InferenceWorkerApi } from '@/workers/inference.worker';
import { getModel } from '@/ml/modelRegistry';
import { loadModel, isModelCached } from '@/ml/modelLoader';
import { splitTiles, mergeTiles, type TileOptions, type ProcessedTile } from '@/ml/utils/tiling';
import { canvasToNCHW, nchwToCanvas } from '@/ml/utils/tensor';

export interface UpscaleOptions {
  modelId?: string;
  tileSize?: number;
  tileOverlap?: number;
  onProgress?: (percent: number) => void;
}

export interface UpscaleResult {
  canvas: HTMLCanvasElement;
  scale: number;
  elapsedMs: number;
}

let worker: Worker | null = null;
let workerApi: Comlink.Remote<InferenceWorkerApi> | null = null;

function getWorker(): Comlink.Remote<InferenceWorkerApi> {
  if (!worker) {
    console.log('[Upscale] Spawning inference worker...');
    worker = new Worker(new URL('../../workers/inference.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onerror = (e) => console.error('[Upscale] Worker error:', e);
    workerApi = Comlink.wrap<InferenceWorkerApi>(worker);
    console.log('[Upscale] Worker spawned');
  }
  return workerApi!;
}

function terminateWorker() {
  if (workerApi) {
    void workerApi.destroy();
    workerApi = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function padCanvas(
  canvas: HTMLCanvasElement,
  targetW: number,
  targetH: number
): HTMLCanvasElement {
  const padded = document.createElement('canvas');
  padded.width = targetW;
  padded.height = targetH;
  const ctx = padded.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  return padded;
}

function cropCanvas(
  canvas: HTMLCanvasElement,
  w: number,
  h: number
): HTMLCanvasElement {
  const cropped = document.createElement('canvas');
  cropped.width = w;
  cropped.height = h;
  const ctx = cropped.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
  return cropped;
}

export async function upscale(
  canvas: HTMLCanvasElement,
  options: UpscaleOptions = {}
): Promise<UpscaleResult> {
  const start = performance.now();
  const { modelId = 'realesrgan-x4plus', tileOverlap = 8 } = options;

  const model = getModel(modelId);
  if (!model) throw new Error(`Model not found: ${modelId}`);

  const modelBuffer = await loadModel(model.url, {
    expectedSha256: model.sha256 || undefined,
  });
  options.onProgress?.(15);

  const scale = 4;
  const modelH = model.inputShape[2];
  const modelW = model.inputShape[3];
  const { width, height } = canvas;

  const api = getWorker();
  console.log('[Upscale] Creating worker session...');
  const preferredBackend = model.forceWasm ? 'wasm' : 'webgpu';
  const backend = await api.initSession(Comlink.transfer(modelBuffer, [modelBuffer]), model.url, preferredBackend);
  console.log(`[Upscale] Session ready, backend: ${backend}`);
  options.onProgress?.(25);
  console.log(
    `[Upscale] Model: ${model.name}, Input: ${modelW}×${modelH}, Backend: ${backend.toUpperCase()}`
  );

  // When image fits within model input, process directly
  if (width <= modelW && height <= modelH) {
    const padded = padCanvas(canvas, modelW, modelH);
    const tensor = canvasToNCHW(padded);
    options.onProgress?.(35);
    const outputTensor = await api.run(
      Comlink.transfer(tensor, [tensor.buffer]),
      [1, 3, modelH, modelW],
      model.url
    );
    options.onProgress?.(90);
    const outputCanvas = nchwToCanvas(outputTensor, modelW * scale, modelH * scale);
    const cropped = cropCanvas(outputCanvas, width * scale, height * scale);

    options.onProgress?.(100);
    return {
      canvas: cropped,
      scale,
      elapsedMs: performance.now() - start,
    };
  }

  // Tiling: split source into overlapping tiles, pad each to model input, infer, crop, merge
  const tilingOpts: TileOptions = { tileSize: modelW, overlap: tileOverlap, scale };
  const tiles = splitTiles(canvas, tilingOpts);
  options.onProgress?.(30);

  const processedTiles: ProcessedTile[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const padded = padCanvas(tile.canvas, modelW, modelH);
    const tensor = canvasToNCHW(padded);
    const outputTensor = await api.run(
      Comlink.transfer(tensor, [tensor.buffer]),
      [1, 3, modelH, modelW],
      model.url
    );
    const fullOutput = nchwToCanvas(outputTensor, modelW * scale, modelH * scale);
    const outputCanvas = cropCanvas(fullOutput, tile.srcW * scale, tile.srcH * scale);

    processedTiles.push({ ...tile, outputCanvas });
    options.onProgress?.(30 + Math.round((i + 1) / tiles.length * 65));
  }

  const merged = mergeTiles(processedTiles, tilingOpts, width, height);
  options.onProgress?.(99);

  return {
    canvas: merged,
    scale,
    elapsedMs: performance.now() - start,
  };
}

export { isModelCached, terminateWorker };
