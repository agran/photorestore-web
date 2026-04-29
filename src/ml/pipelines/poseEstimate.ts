import * as Comlink from 'comlink';
import { getModel } from '@/ml/modelRegistry';
import { loadModel } from '@/ml/modelLoader';
import { getInferenceWorker } from '@/ml/inferenceClient';

export interface PoseKeypoint {
  x: number;
  y: number;
  score: number;
}

export interface PoseEstimate {
  bbox: { x: number; y: number; width: number; height: number; confidence: number };
  keypoints: PoseKeypoint[];
  /** Nose (index 0) position — used to estimate face center */
  nose: PoseKeypoint;
  /** Left eye (1), right eye (2) */
  leftEye: PoseKeypoint;
  rightEye: PoseKeypoint;
  /** Left ear (3), right ear (4) — fallback size reference when eyes are hidden */
  leftEar: PoseKeypoint;
  rightEar: PoseKeypoint;
  /** Left shoulder (5), right shoulder (6) — most reliable scale anchor */
  leftShoulder: PoseKeypoint;
  rightShoulder: PoseKeypoint;
}

const MODEL_ID = 'yolo26m-pose';
const INPUT_W = 704;
const INPUT_H = 576;
const NUM_KEYPOINTS = 17;
// Ultralytics YOLO-pose export with end2end=True (EfficientNMS) produces rows of:
//   [x1, y1, x2, y2, score, class, kpt0_x, kpt0_y, kpt0_v, ..., kpt16_v]
// = 4 box (xyxy) + 1 score + 1 class + 17×3 kpts = 57.
const FEATURES_PER_ANCHOR = 6 + NUM_KEYPOINTS * 3;
const KPT_OFFSET = 6;

let sessionReady = false;
let layoutLogged = false;

function letterbox(
  canvas: HTMLCanvasElement,
  targetW: number,
  targetH: number,
): { canvas: HTMLCanvasElement; scale: number; padX: number; padY: number } {
  const srcW = canvas.width;
  const srcH = canvas.height;
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.round((targetW - newW) / 2);
  const padY = Math.round((targetH - newH) / 2);

  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(canvas, padX, padY, newW, newH);
  return { canvas: out, scale, padX, padY };
}

function prepareInput(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, INPUT_W, INPUT_H);
  const { data } = imageData;
  const rgb = new Float32Array(3 * INPUT_H * INPUT_W);

  for (let h = 0; h < INPUT_H; h++) {
    for (let w = 0; w < INPUT_W; w++) {
      const srcIdx = (h * INPUT_W + w) * 4;
      const dstIdxR = 0 * INPUT_H * INPUT_W + h * INPUT_W + w;
      const dstIdxG = 1 * INPUT_H * INPUT_W + h * INPUT_W + w;
      const dstIdxB = 2 * INPUT_H * INPUT_W + h * INPUT_W + w;
      rgb[dstIdxR] = data[srcIdx] / 255;
      rgb[dstIdxG] = data[srcIdx + 1] / 255;
      rgb[dstIdxB] = data[srcIdx + 2] / 255;
    }
  }
  return rgb;
}

interface OutputAccessor {
  numAnchors: number;
  /** Read feature `c` (0..55) of anchor `a`. */
  get: (a: number, c: number) => number;
  /** True if scores look like raw logits (need sigmoid); false if already in [0,1]. */
  needsSigmoid: boolean;
}

function pickOutputAccessor(output: Float32Array, dims: number[]): OutputAccessor {
  // Standard Ultralytics raw export: [1, 56, N] (channel-major)
  // Custom transposed / end2end-decoded: [1, N, 56] (anchor-major)
  // 2-D variants (no batch) handled too.
  let numAnchors: number;
  let channelMajor: boolean;

  const lastDim = dims[dims.length - 1];
  const prevDim = dims[dims.length - 2];

  if (prevDim === FEATURES_PER_ANCHOR && lastDim !== FEATURES_PER_ANCHOR) {
    numAnchors = lastDim;
    channelMajor = true;
  } else if (lastDim === FEATURES_PER_ANCHOR) {
    numAnchors = prevDim;
    channelMajor = false;
  } else {
    // Unknown shape — fall back to flat anchor-major layout.
    numAnchors = Math.floor(output.length / FEATURES_PER_ANCHOR);
    channelMajor = false;
  }

  const get = channelMajor
    ? (a: number, c: number) => output[c * numAnchors + a]
    : (a: number, c: number) => output[a * FEATURES_PER_ANCHOR + c];

  // Sample a few score values to decide whether sigmoid is needed.
  // If any score is outside [0, 1], it must be a raw logit.
  let needsSigmoid = false;
  const probe = Math.min(numAnchors, 64);
  for (let a = 0; a < probe; a++) {
    const s = get(a, 4);
    if (s < 0 || s > 1) { needsSigmoid = true; break; }
  }

  if (!layoutLogged) {
    console.log(
      `[Pose] Output layout: dims=[${dims.join(',')}] anchors=${numAnchors} ` +
      `${channelMajor ? 'channel-major [1,56,N]' : 'anchor-major [1,N,56]'} ` +
      `sigmoid=${needsSigmoid}`,
    );
    layoutLogged = true;
  }

  return { numAnchors, get, needsSigmoid };
}

function parsePoseOutput(
  output: Float32Array,
  dims: number[],
  scale: number,
  padX: number,
  padY: number,
  srcW: number,
  srcH: number,
): PoseEstimate[] {
  const { numAnchors, get, needsSigmoid } = pickOutputAccessor(output, dims);
  const detections: PoseEstimate[] = [];

  const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
  const norm = (v: number): number => (needsSigmoid ? sigmoid(v) : Math.min(1, Math.max(0, v)));

  for (let a = 0; a < numAnchors; a++) {
    // xyxy box in input (letterboxed) pixel space
    const rx1 = get(a, 0);
    const ry1 = get(a, 1);
    const rx2 = get(a, 2);
    const ry2 = get(a, 3);
    const score = norm(get(a, 4));

    if (score < 0.4) continue;
    // end2end NMS pads unused slots with zeros — filter them
    if (rx2 <= rx1 || ry2 <= ry1) continue;

    const x1 = Math.max(0, Math.round((rx1 - padX) / scale));
    const y1 = Math.max(0, Math.round((ry1 - padY) / scale));
    const x2 = Math.min(srcW, Math.round((rx2 - padX) / scale));
    const y2 = Math.min(srcH, Math.round((ry2 - padY) / scale));

    const keypoints: PoseKeypoint[] = [];
    for (let k = 0; k < NUM_KEYPOINTS; k++) {
      const kxRaw = get(a, KPT_OFFSET + k * 3 + 0);
      const kyRaw = get(a, KPT_OFFSET + k * 3 + 1);
      const kcRaw = get(a, KPT_OFFSET + k * 3 + 2);

      const kx = (kxRaw - padX) / scale;
      const ky = (kyRaw - padY) / scale;
      const kc = norm(kcRaw);

      keypoints.push({
        x: Math.max(0, Math.min(srcW, Math.round(kx))),
        y: Math.max(0, Math.min(srcH, Math.round(ky))),
        score: kc,
      });
    }

    detections.push({
      bbox: {
        x: x1,
        y: y1,
        width: Math.max(1, x2 - x1),
        height: Math.max(1, y2 - y1),
        confidence: score,
      },
      keypoints,
      nose: keypoints[0],
      leftEye: keypoints[1],
      rightEye: keypoints[2],
      leftEar: keypoints[3],
      rightEar: keypoints[4],
      leftShoulder: keypoints[5],
      rightShoulder: keypoints[6],
    });
  }

  return nmsPose(detections, 0.5);
}

function nmsPose(dets: PoseEstimate[], iouThresh: number): PoseEstimate[] {
  if (dets.length === 0) return [];
  dets.sort((a, b) => b.bbox.confidence - a.bbox.confidence);

  const keep: PoseEstimate[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < dets.length; i++) {
    if (suppressed.has(i)) continue;
    keep.push(dets[i]);

    for (let j = i + 1; j < dets.length; j++) {
      if (suppressed.has(j)) continue;
      const a = dets[i].bbox;
      const b = dets[j].bbox;
      const interX1 = Math.max(a.x, b.x);
      const interY1 = Math.max(a.y, b.y);
      const interX2 = Math.min(a.x + a.width, b.x + b.width);
      const interY2 = Math.min(a.y + a.height, b.y + b.height);
      if (interX2 <= interX1 || interY2 <= interY1) continue;
      const interArea = (interX2 - interX1) * (interY2 - interY1);
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      const iou = interArea / (areaA + areaB - interArea);
      if (iou > iouThresh) suppressed.add(j);
    }
  }

  return keep;
}

async function ensureSession() {
  const api = getInferenceWorker();

  if (!sessionReady) {
    const model = getModel(MODEL_ID);
    if (!model) throw new Error(`Model not found: ${MODEL_ID}`);
    const modelBuffer = await loadModel(model.url, {});
    await api.initSession(Comlink.transfer(modelBuffer, [modelBuffer]), model.url, 'webgpu');
    sessionReady = true;
  }

  return api;
}

/**
 * Estimate body poses in the given canvas using YOLO-pose.
 * Returns array of PoseEstimate with 17 COCO keypoints.
 */
export async function estimatePoses(canvas: HTMLCanvasElement): Promise<PoseEstimate[]> {
  const api = await ensureSession();

  const { canvas: lbCanvas, scale, padX, padY } = letterbox(canvas, INPUT_W, INPUT_H);
  const tensorData = prepareInput(lbCanvas);
  const srcW = canvas.width;
  const srcH = canvas.height;

  const outputs = await api.runMulti(
    Comlink.transfer(tensorData, [tensorData.buffer]),
    [1, 3, INPUT_H, INPUT_W],
    getModel(MODEL_ID)!.url,
  );

  const outputData = outputs['output0'] ?? outputs[Object.keys(outputs)[0]];
  if (!outputData) return [];

  return parsePoseOutput(outputData.data, outputData.dims, scale, padX, padY, srcW, srcH);
}

/**
 * Estimate a face bounding box from pose keypoints. Used when the face track
 * is lost (or has shrunk) and we want to keep a mask over the head region.
 *
 * Size cascade — picks the most reliable visible reference:
 *   eye distance × 3.0    (≈ face width; eye-to-eye is ~38% of face width)
 *   ear distance × 1.6    (ears bracket the head, slight margin)
 *   shoulder width / 3.0  (adult shoulder-to-face-width ratio)
 *   fallbackBox           (last-known face box from the tracker)
 *
 * The center is the nose when visible, otherwise eye/ear midpoint.
 * Returns null only if there is no usable horizontal anchor.
 */
export function faceBoxFromPose(
  pose: PoseEstimate,
  fallbackBox: { width: number; height: number },
  frameW: number,
  frameH: number,
): { x: number; y: number; width: number; height: number } | null {
  const { nose, leftEye, rightEye, leftEar, rightEar, leftShoulder, rightShoulder } = pose;
  const KP_THRESH = 0.3;
  const dist = (a: PoseKeypoint, b: PoseKeypoint) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  // ---- estimate face WIDTH ----
  let faceW = 0;
  if (leftEye.score > KP_THRESH && rightEye.score > KP_THRESH) {
    faceW = dist(leftEye, rightEye) * 3.0;
  }
  if (faceW < 16 && leftEar.score > KP_THRESH && rightEar.score > KP_THRESH) {
    faceW = dist(leftEar, rightEar) * 1.6;
  }
  if (faceW < 16 && leftShoulder.score > KP_THRESH && rightShoulder.score > KP_THRESH) {
    faceW = dist(leftShoulder, rightShoulder) / 3.0;
  }
  if (faceW < 16) {
    faceW = fallbackBox.width;
  }
  // Never let it shrink below the prior face track — that's the whole point.
  faceW = Math.max(faceW, fallbackBox.width * 0.9);

  let faceH = faceW * 1.35;

  // ---- estimate face CENTER ----
  let cx: number;
  let cy: number;
  if (leftEye.score > KP_THRESH && rightEye.score > KP_THRESH) {
    cx = (leftEye.x + rightEye.x) / 2;
    cy = (leftEye.y + rightEye.y) / 2 + faceH * 0.05; // eyes sit slightly above center
  } else if (leftEar.score > KP_THRESH && rightEar.score > KP_THRESH) {
    cx = (leftEar.x + rightEar.x) / 2;
    cy = (leftEar.y + rightEar.y) / 2;
  } else if (nose.score > KP_THRESH) {
    cx = nose.x;
    cy = nose.y - faceH * 0.05; // nose is ~55% from top of head
  } else if (leftShoulder.score > KP_THRESH && rightShoulder.score > KP_THRESH) {
    // No head keypoints — fall back to head-above-shoulders heuristic.
    cx = (leftShoulder.x + rightShoulder.x) / 2;
    cy = (leftShoulder.y + rightShoulder.y) / 2 - faceH * 1.1;
  } else {
    return null;
  }

  let faceX = cx - faceW / 2;
  let faceY = cy - faceH / 2;

  faceX = Math.max(0, Math.min(faceX, frameW - faceW));
  faceY = Math.max(0, Math.min(faceY, frameH - faceH));
  faceW = Math.max(8, Math.min(faceW, frameW - faceX));
  faceH = Math.max(8, Math.min(faceH, frameH - faceY));

  return { x: faceX, y: faceY, width: faceW, height: faceH };
}
