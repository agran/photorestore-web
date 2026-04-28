import * as Comlink from 'comlink';
import type { InferenceWorkerApi } from '@/workers/inference.worker';
import { getModel } from '@/ml/modelRegistry';
import { loadModel, isModelCached } from '@/ml/modelLoader';
import {
  prepareScrfdInput,
  prepareRawInput,
  prepareRetinaFaceInput,
  prepareBlazeFaceInput,
  parseScrfdDetections,
  parseYunetDetections,
  parseRetinaFaceDetections,
  parseBlazeFaceDetections,
  nms,
  type FaceBox,
  type DetectorOutput,
} from '@/ml/utils/faceDetect';
import {
  resolveEffectOptions,
  applyBlur,
  applyPixelate,
  applySolid,
  applyEmoji,
  type AnonymizeEffectOptions,
} from '@/ml/utils/anonymizeEffects';

export type { AnonymizeEffectOptions } from '@/ml/utils/anonymizeEffects';

export interface AnonymizeOptions {
  modelId?: string;
  threshold?: number;
  effectOptions?: AnonymizeEffectOptions;
  onProgress?: (percent: number) => void;
  /** Pre-detected faces — skip detection when provided */
  preDetectedFaces?: FaceBox[];
}

export interface AnonymizeResult {
  canvas: HTMLCanvasElement;
  faces: FaceBox[];
  elapsedMs: number;
}

let worker: Worker | null = null;
let workerApi: Comlink.Remote<InferenceWorkerApi> | null = null;

function getWorker(): Comlink.Remote<InferenceWorkerApi> {
  if (!worker) {
    worker = new Worker(new URL('../../workers/inference.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerApi = Comlink.wrap<InferenceWorkerApi>(worker);
  }
  return workerApi!;
}

function padCanvas(canvas: HTMLCanvasElement, targetW: number, targetH: number): HTMLCanvasElement {
  const padded = document.createElement('canvas');
  padded.width = targetW;
  padded.height = targetH;
  const ctx = padded.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  return padded;
}

interface TileBox {
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  canvas: HTMLCanvasElement;
}

function splitDetectionTiles(
  source: HTMLCanvasElement,
  tileW: number,
  tileH: number,
  overlap: number
): TileBox[] {
  const { width, height } = source;
  const strideW = tileW - overlap;
  const strideH = tileH - overlap;
  const tiles: TileBox[] = [];

  for (let y = 0; y < height; y += strideH) {
    for (let x = 0; x < width; x += strideW) {
      const tw = Math.min(tileW, width - x);
      const th = Math.min(tileH, height - y);

      const tc = document.createElement('canvas');
      tc.width = tw;
      tc.height = th;
      const ctx = tc.getContext('2d')!;
      ctx.drawImage(source, x, y, tw, th, 0, 0, tw, th);

      tiles.push({ tileX: x, tileY: y, tileW: tw, tileH: th, canvas: tc });
    }
  }
  return tiles;
}

function prepareTensorData(
  canvas: HTMLCanvasElement,
  modelId: string,
  inputW: number,
  inputH: number
): Float32Array {
  if (modelId.startsWith('scrfd')) return prepareScrfdInput(canvas, inputW, inputH).data as Float32Array;
  if (modelId.startsWith('yunet')) return prepareRawInput(canvas, inputW, inputH).data as Float32Array;
  if (modelId.startsWith('retinaface')) return prepareRetinaFaceInput(canvas, inputW, inputH).data as Float32Array;
  if (modelId.startsWith('blazeface')) return prepareBlazeFaceInput(canvas, inputW, inputH).data as Float32Array;
  return prepareRawInput(canvas, inputW, inputH).data as Float32Array;
}

function parseDetections(
  modelId: string,
  outputs: Record<string, DetectorOutput>,
  outputNames: string[],
  inputW: number,
  inputH: number,
  canvasW: number,
  canvasH: number,
  threshold: number
): FaceBox[] {
  if (modelId.startsWith('scrfd')) {
    return parseScrfdDetections(
      outputs, outputNames, inputW, inputH, canvasW, canvasH, threshold
    ).map((d) => ({ x: d.x, y: d.y, width: d.w, height: d.h, confidence: d.score }));
  }
  if (modelId.startsWith('yunet')) {
    return parseYunetDetections(
      outputs, outputNames, inputW, inputH, canvasW, canvasH, threshold
    ).map((d) => ({ x: d.x, y: d.y, width: d.w, height: d.h, confidence: d.score }));
  }
  if (modelId.startsWith('retinaface')) {
    return parseRetinaFaceDetections(
      outputs, outputNames, inputW, inputH, canvasW, canvasH, threshold
    ).map((d) => ({ x: d.x, y: d.y, width: d.w, height: d.h, confidence: d.score }));
  }
  if (modelId.startsWith('blazeface')) {
    return parseBlazeFaceDetections(
      outputs, outputNames, canvasW, canvasH
    ).map((d) => ({ x: d.x, y: d.y, width: d.w, height: d.h, confidence: d.score }));
  }
  return [];
}

/**
 * Detect faces in the given canvas using the specified ONNX model.
 */
export async function detectFaces(
  canvas: HTMLCanvasElement,
  options: AnonymizeOptions = {}
): Promise<FaceBox[]> {
  const { modelId = 'scrfd-500m', threshold = 0.5, onProgress } = options;

  const model = getModel(modelId);
  if (!model) throw new Error(`Model not found: ${modelId}`);

  const inputH = model.inputShape[2];
  const inputW = model.inputShape[3];

  const modelBuffer = await loadModel(model.url);
  onProgress?.(10);

  const api = getWorker();
  const preferredBackend = model.forceWasm ? 'wasm' : 'webgpu';
  const backend = await api.initSession(
    Comlink.transfer(modelBuffer, [modelBuffer]),
    model.url,
    preferredBackend
  );
  onProgress?.(25);
  console.log(`[Anonymize] Model: ${model.name}, Backend: ${backend.toUpperCase()}`);

  const tiles = splitDetectionTiles(canvas, inputW, inputH, 64);
  const allFaces: FaceBox[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const padded = padCanvas(tile.canvas, inputW, inputH);
    const tensorData = prepareTensorData(padded, modelId, inputW, inputH);

    const outputRecord = await api.runMulti(
      Comlink.transfer(tensorData, [tensorData.buffer]),
      [1, 3, inputH, inputW],
      model.url
    );

    const outputNames = Object.keys(outputRecord);
    const outputs: Record<string, DetectorOutput> = {};
    for (const [name, { data, dims }] of Object.entries(outputRecord)) {
      outputs[name] = { data, dims };
    }

    // Debug: log output dims and sample values
    if (i === 0) {
      console.group(`[Anonymize] Model: ${model.name}, Tile 0 (${tile.tileW}×${tile.tileH})`);
      for (const [name, { data, dims }] of Object.entries(outputRecord)) {
        const samples = Array.from(data.slice(0, Math.min(8, data.length)));
        console.log(`  ${name} [${dims.join(',')}] samples:`, samples.map((v) => v.toFixed(4)));
      }
      console.groupEnd();
    }

    const tileFaces = parseDetections(
      modelId, outputs, outputNames,
      inputW, inputH, inputW, inputH, threshold
    );

    // Filter detections outside tile content area and clamp
    const maxTileX = tile.tileW - 1;
    const maxTileY = tile.tileH - 1;

    for (const f of tileFaces) {
      const fx = Math.max(0, f.x);
      const fy = Math.max(0, f.y);
      const fw = Math.min(maxTileX - fx, f.width);
      const fh = Math.min(maxTileY - fy, f.height);

      if (fw < 8 || fh < 8) continue;

      allFaces.push({
        x: fx + tile.tileX,
        y: fy + tile.tileY,
        width: fw,
        height: fh,
        confidence: f.confidence,
      });
    }

    onProgress?.(25 + Math.round((i + 1) / tiles.length * 60));
  }

  if (allFaces.length === 0) return [];

  const globalDets = allFaces.map((f) => ({
    score: f.confidence,
    x: f.x,
    y: f.y,
    w: f.width,
    h: f.height,
  }));
  const merged = nms(globalDets, 0.3);
  return merged.map((d) => ({
    x: d.x,
    y: d.y,
    width: d.w,
    height: d.h,
    confidence: d.score,
  }));
}

export async function anonymize(
  canvas: HTMLCanvasElement,
  options: AnonymizeOptions = {}
): Promise<AnonymizeResult> {
  const start = performance.now();
  const { onProgress, effectOptions, preDetectedFaces } = options;

  const faces = preDetectedFaces ?? (await detectFaces(canvas, options));
  onProgress?.(90);

  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const ctx = output.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);

  if (!effectOptions || faces.length === 0) {
    onProgress?.(100);
    return { canvas: output, faces, elapsedMs: performance.now() - start };
  }

  const resolvedOpts = resolveEffectOptions(effectOptions);
  const cW = canvas.width;
  const cH = canvas.height;

  for (let i = 0; i < faces.length; i++) {
    const box = faces[i];
    switch (resolvedOpts.effect) {
      case 'blur':
        applyBlur(ctx, canvas, box, resolvedOpts.blurRadius, resolvedOpts.padding, resolvedOpts.feather, resolvedOpts.maskShape, cW, cH);
        break;
      case 'pixelate':
        applyPixelate(ctx, canvas, box, resolvedOpts.pixelateSize, resolvedOpts.padding, resolvedOpts.feather, resolvedOpts.maskShape, cW, cH);
        break;
      case 'solid':
        applySolid(ctx, canvas, box, resolvedOpts.solidColor, resolvedOpts.padding, resolvedOpts.feather, resolvedOpts.maskShape, cW, cH);
        break;
      case 'emoji':
        applyEmoji(ctx, canvas, box, resolvedOpts.emojis?.[i] || resolvedOpts.emoji, resolvedOpts.padding, resolvedOpts.feather, resolvedOpts.maskShape, cW, cH);
        break;
    }
  }

  onProgress?.(100);
  return { canvas: output, faces, elapsedMs: performance.now() - start };
}

export { isModelCached };
