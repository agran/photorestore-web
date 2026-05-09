import * as Comlink from 'comlink';
import { getModel } from '@/ml/modelRegistry';
import { loadModel, isModelCached } from '@/ml/modelLoader';
import { getInferenceWorker } from '@/ml/inferenceClient';
import { planTiles, extractTile } from '@/ml/utils/tiling';
import {
  prepareScrfdInput,
  prepareRawInput,
  prepareRetinaFaceInput,
  parseScrfdDetections,
  parseYunetDetections,
  parseRetinaFaceDetections,
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
  scaleKernel,
  scaleEffectStrength,
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

function padCanvas(canvas: HTMLCanvasElement, targetW: number, targetH: number): HTMLCanvasElement {
  const padded = document.createElement('canvas');
  padded.width = targetW;
  padded.height = targetH;
  const ctx = padded.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  return padded;
}

/** Letterbox the whole source into targetW×targetH, preserving aspect ratio.
 *  Returns the canvas plus the transform needed to map model-space bboxes
 *  back to source-image coordinates. Used for the global-scale detection
 *  pass that catches big portraits which span multiple tiles. */
function fitCanvasLetterbox(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
): { canvas: HTMLCanvasElement; scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(targetW / source.width, targetH / source.height);
  const drawW = Math.round(source.width * scale);
  const drawH = Math.round(source.height * scale);
  const offsetX = Math.floor((targetW - drawW) / 2);
  const offsetY = Math.floor((targetH - drawH) / 2);
  const c = document.createElement('canvas');
  c.width = targetW;
  c.height = targetH;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, source.width, source.height, offsetX, offsetY, drawW, drawH);
  return { canvas: c, scale, offsetX, offsetY };
}

// Detection tiles are uniformly model-input-sized (e.g. 640×640 for SCRFD).
// We use the shared planTiles helper, but face-detection tiles are square and
// don't share scale/merge concerns with upscale, so we wrap planTiles to keep
// the call sites readable.

function prepareTensorData(
  canvas: HTMLCanvasElement,
  modelId: string,
  inputW: number,
  inputH: number
): Float32Array {
  if (modelId.startsWith('scrfd')) return prepareScrfdInput(canvas, inputW, inputH).data as Float32Array;
  if (modelId.startsWith('yunet')) return prepareRawInput(canvas, inputW, inputH).data as Float32Array;
  if (modelId.startsWith('retinaface')) return prepareRetinaFaceInput(canvas, inputW, inputH).data as Float32Array;
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
  return [];
}

/**
 * Detect faces in the given canvas using the specified ONNX model.
 */
export async function detectFaces(
  canvas: HTMLCanvasElement,
  options: AnonymizeOptions = {}
): Promise<FaceBox[] & { backend?: string }> {
  const { modelId = 'scrfd-10g', threshold = 0.5, onProgress } = options;

  const model = getModel(modelId);
  if (!model) throw new Error(`Model not found: ${modelId}`);

  const inputH = model.inputShape[2];
  const inputW = model.inputShape[3];

  const modelBuffer = await loadModel(model.url);
  onProgress?.(10);

  const api = getInferenceWorker();
  const preferredBackend = model.forceWasm ? 'wasm' : 'webgpu';
  const backend = await api.initSession(
    Comlink.transfer(modelBuffer, [modelBuffer]),
    model.url,
    preferredBackend
  );
  onProgress?.(25);
  console.log(`[Anonymize] Model: ${model.name}, Backend: ${backend.toUpperCase()}`);

  const allFaces: FaceBox[] & { backend?: string } = [];

  // Global pass: letterbox the whole image into the model input. This catches
  // large faces (portraits) that would otherwise span multiple 640×640 tiles
  // and never fit any single tile or any anchor scale.
  if (canvas.width > inputW || canvas.height > inputH) {
    const fit = fitCanvasLetterbox(canvas, inputW, inputH);
    const tensorData = prepareTensorData(fit.canvas, modelId, inputW, inputH);

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

    const globalFaces = parseDetections(
      modelId, outputs, outputNames,
      inputW, inputH, inputW, inputH, threshold
    );

    for (const f of globalFaces) {
      // Translate from model space back to source-image coordinates.
      const x = (f.x - fit.offsetX) / fit.scale;
      const y = (f.y - fit.offsetY) / fit.scale;
      const w = f.width / fit.scale;
      const h = f.height / fit.scale;
      if (w < 8 || h < 8) continue;
      allFaces.push({
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.min(canvas.width - Math.max(0, x), w),
        height: Math.min(canvas.height - Math.max(0, y), h),
        confidence: f.confidence,
      });
    }
    console.log(`[Anonymize] Global pass: ${globalFaces.length} face(s) detected`);
  }

  // Plan coordinates only — extract each tile lazily so we don't hold N
  // canvases simultaneously. Detection tiles are square, scale=1 (no
  // upscaling), 64 px overlap so faces split across a tile boundary still
  // appear whole in at least one neighbor.
  const tileCoords = planTiles(canvas.width, canvas.height, {
    tileSize: inputW,
    overlap: 64,
    scale: 1,
  });

  for (let i = 0; i < tileCoords.length; i++) {
    const coord = tileCoords[i];
    const tileCanvas = extractTile(canvas, coord);
    const padded = padCanvas(tileCanvas, inputW, inputH);
    const tensorData = prepareTensorData(padded, modelId, inputW, inputH);

    const outputRecord = await api.runMulti(
      Comlink.transfer(tensorData, [tensorData.buffer]),
      [1, 3, inputH, inputW],
      model.url,
    );

    const outputNames = Object.keys(outputRecord);
    const outputs: Record<string, DetectorOutput> = {};
    for (const [name, { data, dims }] of Object.entries(outputRecord)) {
      outputs[name] = { data, dims };
    }

    // Debug: log output dims and sample values
    if (i === 0) {
      console.group(`[Anonymize] Model: ${model.name}, Tile 0 (${coord.srcW}×${coord.srcH})`);
      for (const [name, { data, dims }] of Object.entries(outputRecord)) {
        const samples = Array.from(data.slice(0, Math.min(8, data.length)));
        console.log(`  ${name} [${dims.join(',')}] samples:`, samples.map((v) => v.toFixed(4)));
      }
      console.groupEnd();
    }

    const tileFaces = parseDetections(
      modelId, outputs, outputNames,
      inputW, inputH, inputW, inputH, threshold,
    );

    // Filter detections outside tile content area and clamp
    const maxTileX = coord.srcW - 1;
    const maxTileY = coord.srcH - 1;

    for (const f of tileFaces) {
      const fx = Math.max(0, f.x);
      const fy = Math.max(0, f.y);
      const fw = Math.min(maxTileX - fx, f.width);
      const fh = Math.min(maxTileY - fy, f.height);

      if (fw < 8 || fh < 8) continue;

      allFaces.push({
        x: fx + coord.srcX,
        y: fy + coord.srcY,
        width: fw,
        height: fh,
        confidence: f.confidence,
      });
    }

    onProgress?.(25 + Math.round(((i + 1) / tileCoords.length) * 60));
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
  const faces = merged.map((d) => ({
    x: d.x,
    y: d.y,
    width: d.w,
    height: d.h,
    confidence: d.score,
  }));
  (faces as FaceBox[] & { backend?: string }).backend = backend;
  return faces as FaceBox[] & { backend?: string };
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

  // Slider values are calibrated against a 100px-wide face. Scale per-face
  // (super-linear for blur radius / pixelate block, linear for padding /
  // feather) so the effect strength stays visually consistent across face
  // sizes — same logic as the video pipeline.
  for (let i = 0; i < faces.length; i++) {
    const box = faces[i];
    const bboxW = box.width;
    const pad = scaleKernel(resolvedOpts.padding, bboxW);
    const feather = scaleKernel(resolvedOpts.feather, bboxW);
    switch (resolvedOpts.effect) {
      case 'blur': {
        const radius = scaleEffectStrength(resolvedOpts.blurRadius, bboxW);
        applyBlur(ctx, canvas, box, radius, pad, feather, resolvedOpts.maskShape, cW, cH);
        break;
      }
      case 'pixelate': {
        const size = scaleEffectStrength(resolvedOpts.pixelateSize, bboxW, 2);
        applyPixelate(ctx, canvas, box, size, pad, feather, resolvedOpts.maskShape, cW, cH);
        break;
      }
      case 'solid':
        applySolid(ctx, canvas, box, resolvedOpts.solidColor, pad, feather, resolvedOpts.maskShape, cW, cH);
        break;
      case 'emoji':
        applyEmoji(ctx, canvas, box, resolvedOpts.emojis?.[i] || resolvedOpts.emoji, pad, 0, resolvedOpts.maskShape, cW, cH);
        break;
    }
  }

  onProgress?.(100);
  return { canvas: output, faces, elapsedMs: performance.now() - start };
}

export { isModelCached };
