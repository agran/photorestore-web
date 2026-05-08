import * as Comlink from 'comlink';
import { getModel } from '@/ml/modelRegistry';
import { loadModel, isModelCached } from '@/ml/modelLoader';
import { getInferenceWorker, terminateInferenceWorker } from '@/ml/inferenceClient';
import { planTiles, extractTile, TileMerger, type TileOptions } from '@/ml/utils/tiling';
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
  const { modelId = 'nomos8ksc', tileOverlap = 8 } = options;

  const model = getModel(modelId);
  if (!model) throw new Error(`Model not found: ${modelId}`);

  const modelBuffer = await loadModel(model.url, {
    expectedSha256: model.sha256 || undefined,
  });
  options.onProgress?.(15);

  const scale = model.scale ?? 4;
  const modelH = model.inputShape[2];
  const modelW = model.inputShape[3];
  const { width, height } = canvas;

  const api = getInferenceWorker();
  console.log('[Upscale] Creating worker session...');
  const preferredBackend = model.forceWasm ? 'wasm' : 'webgpu';
  const backend = await api.initSession(
    Comlink.transfer(modelBuffer, [modelBuffer]),
    model.url,
    preferredBackend,
    model.preferNchw
  );
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

  // Streaming tiling: plan coordinates, then for each tile extract→infer→
  // blend→drop. Peak memory is one tile's I/O canvases plus the merger's
  // accumulators — not N tiles' worth of output canvases.
  const tilingOpts: TileOptions = { tileSize: modelW, overlap: tileOverlap, scale };
  const coords = planTiles(width, height, tilingOpts);
  options.onProgress?.(30);

  const merger = new TileMerger(tilingOpts, width, height);
  for (let i = 0; i < coords.length; i++) {
    const coord = coords[i];
    const tileCanvas = extractTile(canvas, coord);
    const padded = padCanvas(tileCanvas, modelW, modelH);
    const tensor = canvasToNCHW(padded);
    const outputTensor = await api.run(
      Comlink.transfer(tensor, [tensor.buffer]),
      [1, 3, modelH, modelW],
      model.url,
    );
    const fullOutput = nchwToCanvas(outputTensor, modelW * scale, modelH * scale);
    const outputCanvas = cropCanvas(fullOutput, coord.srcW * scale, coord.srcH * scale);
    merger.addTile(coord, outputCanvas);
    // tileCanvas/padded/fullOutput/outputCanvas drop out of scope here.
    options.onProgress?.(30 + Math.round(((i + 1) / coords.length) * 65));
  }

  const merged = merger.finalize();
  options.onProgress?.(99);

  return {
    canvas: merged,
    scale,
    elapsedMs: performance.now() - start,
  };
}

export { isModelCached, terminateInferenceWorker };
