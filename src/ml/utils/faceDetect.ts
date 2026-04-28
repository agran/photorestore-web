import * as ort from 'onnxruntime-web';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  /** Optional face landmarks (5 points: left-eye, right-eye, nose, left-mouth, right-mouth) */
  landmarks?: Array<{ x: number; y: number }>;
}

/** Lightweight tensor-like object returned by the inference worker */
export interface DetectorOutput {
  data: Float32Array;
  dims: readonly number[];
}

interface RawDetection {
  score: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** NMS — sort by score descending, keep boxes with IoU < threshold */
export function nms(dets: RawDetection[], iouThresh: number): RawDetection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const keep: RawDetection[] = [];
  const suppressed = new Uint8Array(sorted.length);

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed[i]) continue;
    keep.push(sorted[i]);
    if (keep.length >= 100) break;

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed[j]) continue;
      const xx1 = Math.max(sorted[i].x, sorted[j].x);
      const yy1 = Math.max(sorted[i].y, sorted[j].y);
      const xx2 = Math.min(sorted[i].x + sorted[i].w, sorted[j].x + sorted[j].w);
      const yy2 = Math.min(sorted[i].y + sorted[i].h, sorted[j].y + sorted[j].h);
      const interW = Math.max(0, xx2 - xx1);
      const interH = Math.max(0, yy2 - yy1);
      const inter = interW * interH;
      const areaI = sorted[i].w * sorted[i].h;
      const areaJ = sorted[j].w * sorted[j].h;
      const iou = inter / (areaI + areaJ - inter);
      if (iou > iouThresh) suppressed[j] = 1;
    }
  }
  return keep;
}

/**
 * Generic input: RGB, (pixel - 127.5) / 128
 * Used by: SCRFD (BGR variant below), Ultra-Light-Fast
 */
export function prepareOrtInput(
  sourceCanvas: HTMLCanvasElement,
  inputW: number,
  inputH: number,
  bgr: boolean
): ort.Tensor {
  const tmp = document.createElement('canvas');
  tmp.width = inputW;
  tmp.height = inputH;
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, inputW, inputH);
  const imgData = ctx.getImageData(0, 0, inputW, inputH);
  const pixels = imgData.data;
  const chSize = inputH * inputW;
  const floatData = new Float32Array(3 * chSize);

  if (bgr) {
    for (let i = 0; i < chSize; i++) {
      floatData[i] = (pixels[i * 4 + 2] - 127.5) / 128;
      floatData[chSize + i] = (pixels[i * 4 + 1] - 127.5) / 128;
      floatData[2 * chSize + i] = (pixels[i * 4] - 127.5) / 128;
    }
  } else {
    for (let i = 0; i < chSize; i++) {
      floatData[i] = (pixels[i * 4] - 127.5) / 128;
      floatData[chSize + i] = (pixels[i * 4 + 1] - 127.5) / 128;
      floatData[2 * chSize + i] = (pixels[i * 4 + 2] - 127.5) / 128;
    }
  }
  return new ort.Tensor('float32', floatData, [1, 3, inputH, inputW]);
}

/** SCRFD: BGR, (pixel - 127.5) / 128 */
export function prepareScrfdInput(sourceCanvas: HTMLCanvasElement, inputW: number, inputH: number): ort.Tensor {
  return prepareOrtInput(sourceCanvas, inputW, inputH, true);
}

/** YuNet / raw: RGB 0-255 as float32 (model does its own normalization) */
export function prepareRawInput(sourceCanvas: HTMLCanvasElement, inputW: number, inputH: number): ort.Tensor {
  const tmp = document.createElement('canvas');
  tmp.width = inputW;
  tmp.height = inputH;
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, inputW, inputH);
  const imgData = ctx.getImageData(0, 0, inputW, inputH);
  const pixels = imgData.data;
  const chSize = inputH * inputW;
  const floatData = new Float32Array(3 * chSize);

  for (let i = 0; i < chSize; i++) {
    floatData[i] = pixels[i * 4];
    floatData[chSize + i] = pixels[i * 4 + 1];
    floatData[2 * chSize + i] = pixels[i * 4 + 2];
  }
  return new ort.Tensor('float32', floatData, [1, 3, inputH, inputW]);
}

/** RetinaFace-MN0.25: BGR, subtract mean [104, 117, 123] */
export function prepareRetinaFaceInput(sourceCanvas: HTMLCanvasElement, inputW: number, inputH: number): ort.Tensor {
  const tmp = document.createElement('canvas');
  tmp.width = inputW;
  tmp.height = inputH;
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, inputW, inputH);
  const imgData = ctx.getImageData(0, 0, inputW, inputH);
  const pixels = imgData.data;
  const chSize = inputH * inputW;
  const floatData = new Float32Array(3 * chSize);

  for (let i = 0; i < chSize; i++) {
    floatData[i] = pixels[i * 4 + 2] - 104.0;
    floatData[chSize + i] = pixels[i * 4 + 1] - 117.0;
    floatData[2 * chSize + i] = pixels[i * 4] - 123.0;
  }
  return new ort.Tensor('float32', floatData, [1, 3, inputH, inputW]);
}

/** BlazeFace: RGB, (pixel/255 - 0.5) / 0.5  =>  pixel/127.5 - 1 */
export function prepareBlazeFaceInput(sourceCanvas: HTMLCanvasElement, inputW: number, inputH: number): ort.Tensor {
  const tmp = document.createElement('canvas');
  tmp.width = inputW;
  tmp.height = inputH;
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, inputW, inputH);
  const imgData = ctx.getImageData(0, 0, inputW, inputH);
  const pixels = imgData.data;
  const chSize = inputH * inputW;
  const floatData = new Float32Array(3 * chSize);

  for (let i = 0; i < chSize; i++) {
    floatData[i] = pixels[i * 4] / 127.5 - 1;
    floatData[chSize + i] = pixels[i * 4 + 1] / 127.5 - 1;
    floatData[2 * chSize + i] = pixels[i * 4 + 2] / 127.5 - 1;
  }
  return new ort.Tensor('float32', floatData, [1, 3, inputH, inputW]);
}

interface ScrfdOutput {
  score: Float32Array;
  box: Float32Array;
  kps: Float32Array | null;
  numAnchors: number;
}

function getScrfdLastDim(t: DetectorOutput): number {
  return t.dims[t.dims.length - 1];
}

function getScrfdNumAnchors(t: DetectorOutput): number {
  if (t.dims.length === 3) return t.dims[1];
  return t.dims[0];
}

/**
 * Parse SCRFD detections (anchor-free, 3 strides: 8/16/32).
 * Supports SCRFD-500M (unnamed outputs, [N, D] dims, stride-relative box offsets)
 * and SCRFD-10G (named outputs score_8/box_8/lmk5pt_8, [1, N, D] dims, pixel-space boxes).
 */
export function parseScrfdDetections(
  outputs: Record<string, DetectorOutput>,
  outputNames: string[],
  inputW: number,
  inputH: number,
  canvasW: number,
  canvasH: number,
  threshold = 0.5
): RawDetection[] {
  const strides = [8, 16, 32];
  const byStride = new Map<number, ScrfdOutput>();

  const hasNamedOutputs = outputNames.some((n) => n.startsWith('score_'));
  // 10G (named outputs) uses pixel-space box offsets; 500M (numeric outputs) uses stride-relative
  const boxIsPixelSpace = hasNamedOutputs;

  if (hasNamedOutputs) {
    for (const stride of strides) {
      const scoreOut = outputs[`score_${stride}`];
      const boxOut = outputs[`box_${stride}`];
      const kpsOut = outputs[`lmk5pt_${stride}`] ?? null;
      if (!scoreOut || !boxOut) continue;
      byStride.set(stride, {
        score: scoreOut.data,
        box: boxOut.data,
        kps: kpsOut ? (kpsOut.data) : null,
        numAnchors: getScrfdNumAnchors(scoreOut),
      });
    }
  } else {
    const scoreOutputs: DetectorOutput[] = [];
    const boxOutputs: DetectorOutput[] = [];
    const kpsOutputs: DetectorOutput[] = [];

    for (const name of outputNames) {
      const t = outputs[name];
      const lastDim = getScrfdLastDim(t);
      if (lastDim === 1) scoreOutputs.push(t);
      else if (lastDim === 4) boxOutputs.push(t);
      else if (lastDim === 10) kpsOutputs.push(t);
    }

    if (scoreOutputs.length < 3 || boxOutputs.length < 3) return [];

    for (let lvl = 0; lvl < 3; lvl++) {
      byStride.set(strides[lvl], {
        score: scoreOutputs[lvl].data,
        box: boxOutputs[lvl].data,
        kps: kpsOutputs[lvl] ? (kpsOutputs[lvl].data) : null,
        numAnchors: getScrfdNumAnchors(scoreOutputs[lvl]),
      });
    }
  }

  if (byStride.size < 3) return [];

  const scaleX = canvasW / inputW;
  const scaleY = canvasH / inputH;
  const dets: RawDetection[] = [];

  for (const stride of strides) {
    const out = byStride.get(stride);
    if (!out) continue;

    const { score: sd, box: bd, numAnchors } = out;
    const featW = Math.ceil(inputW / stride);

    for (let idx = 0; idx < numAnchors; idx++) {
      const conf = sd[idx];
      if (conf <= threshold) continue;

      const cellIdx = Math.floor(idx / 2);
      const ax = cellIdx % featW;
      const ay = Math.floor(cellIdx / featW);
      const cx = (ax + 0.5) * stride;
      const cy = (ay + 0.5) * stride;
      const scale = boxIsPixelSpace ? 1 : stride;
      const dl = bd[idx * 4] * scale;
      const dt = bd[idx * 4 + 1] * scale;
      const dr = bd[idx * 4 + 2] * scale;
      const db = bd[idx * 4 + 3] * scale;
      const x1 = (cx - dl) * scaleX;
      const y1 = (cy - dt) * scaleY;
      const x2 = (cx + dr) * scaleX;
      const y2 = (cy + db) * scaleY;

      dets.push({ score: conf, x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
  }

  return nms(dets, 0.4);
}

/**
 * Extract keypoints (5 landmarks) from SCRFD detections.
 * Returns null if model doesn't output keypoints.
 */
export function extractScrfdKeypoints(
  outputs: Record<string, DetectorOutput>,
  outputNames: string[],
  inputW: number,
  inputH: number,
  canvasW: number,
  canvasH: number,
  threshold = 0.5
): Array<{ x: number; y: number }[]> | null {
  const strides = [8, 16, 32];
  const hasNamedOutputs = outputNames.some((n) => n.startsWith('score_'));
  const kpsIsPixelSpace = hasNamedOutputs;

  for (const stride of strides) {
    let kpsData: Float32Array | null = null;
    let scoreData: Float32Array | null = null;
    let numAnchors = 0;

    if (hasNamedOutputs) {
      const kpsOut = outputs[`lmk5pt_${stride}`];
      const scoreOut = outputs[`score_${stride}`];
      if (kpsOut && scoreOut) {
        kpsData = kpsOut.data;
        scoreData = scoreOut.data;
        numAnchors = getScrfdNumAnchors(scoreOut);
      }
    } else {
      for (const name of outputNames) {
        const t = outputs[name];
        if (getScrfdLastDim(t) === 10) {
          kpsData = t.data;
        } else if (getScrfdLastDim(t) === 1) {
          scoreData = t.data;
          numAnchors = getScrfdNumAnchors(t);
        }
      }
    }

    if (kpsData && scoreData && numAnchors > 0) {
      const featW = Math.ceil(inputW / stride);
      const kpsAll: Array<{ x: number; y: number }[]> = [];
      for (let idx = 0; idx < numAnchors; idx++) {
        if (scoreData[idx] <= threshold) continue;
        const cellIdx = Math.floor(idx / 2);
        const ax = cellIdx % featW;
        const ay = Math.floor(cellIdx / featW);
        const cx = (ax + 0.5) * stride;
        const cy = (ay + 0.5) * stride;
        const landmarks: { x: number; y: number }[] = [];
        const scale = kpsIsPixelSpace ? 1 : stride;
        for (let k = 0; k < 5; k++) {
          landmarks.push({
            x: (cx + kpsData[idx * 10 + k * 2] * scale) * (canvasW / inputW),
            y: (cy + kpsData[idx * 10 + k * 2 + 1] * scale) * (canvasH / inputH),
          });
        }
        kpsAll.push(landmarks);
      }
      return kpsAll;
    }
  }
  return null;
}

/**
 * Parse YuNet 2023mar detections (12 outputs, 3 strides: 8/16/32).
 * Outputs: cls_8, cls_16, cls_32, obj_8, obj_16, obj_32, bbox_8, bbox_16, bbox_32, kps_8, kps_16, kps_32
 */
export function parseYunetDetections(
  outputs: Record<string, DetectorOutput>,
  _outputNames: string[],
  inputW: number,
  inputH: number,
  canvasW: number,
  canvasH: number,
  threshold = 0.5
): RawDetection[] {
  const scaleX = canvasW / inputW;
  const scaleY = canvasH / inputH;
  const dets: RawDetection[] = [];

  const strides = [8, 16, 32];
  const strideThresholds = [threshold * 0.7, threshold * 0.85, threshold];

  for (let si = 0; si < strides.length; si++) {
    const stride = strides[si];
    const sThresh = strideThresholds[si];
    const clsOut = outputs['cls_' + stride];
    const objOut = outputs['obj_' + stride];
    const bboxOut = outputs['bbox_' + stride];
    if (!clsOut || !objOut || !bboxOut) continue;

    const clsData = clsOut.data;
    const objData = objOut.data;
    const bboxData = bboxOut.data;
    const gridW = inputW / stride;
    const n = clsOut.dims[1];

    for (let i = 0; i < n; i++) {
      const score = clsData[i] * objData[i];
      if (score < sThresh) continue;

      const col = i % gridW;
      const row = Math.floor(i / gridW);
      const cx = col * stride;
      const cy = row * stride;

      const x1 = (cx - bboxData[i * 4] * stride) * scaleX;
      const y1 = (cy - bboxData[i * 4 + 1] * stride) * scaleY;
      const x2 = (cx + bboxData[i * 4 + 2] * stride) * scaleX;
      const y2 = (cy + bboxData[i * 4 + 3] * stride) * scaleY;

      const bw = x2 - x1;
      const bh = y2 - y1;
      if (bw < 10 || bh < 10) continue;
      const ar = bw / bh;
      if (ar < 0.35 || ar > 2.5) continue;

      dets.push({ score, x: x1, y: y1, w: bw, h: bh });
    }
  }

  return nms(dets, 0.3);
}

/**
 * Parse RetinaFace-MN0.25 detections (anchor-based, 3 strides: 8/16/32).
 * Outputs: loc [1,N,4], conf [1,N,2], landmarks [1,N,10]
 */
export function parseRetinaFaceDetections(
  outputs: Record<string, DetectorOutput>,
  outputNames: string[],
  inputW: number,
  inputH: number,
  canvasW: number,
  canvasH: number,
  threshold = 0.5
): RawDetection[] {
  const scaleX = canvasW / inputW;
  const scaleY = canvasH / inputH;

  let locOut: DetectorOutput | null = null;
  let confOut: DetectorOutput | null = null;
  for (const name of outputNames) {
    const t = outputs[name];
    const lastDim = t.dims[t.dims.length - 1];
    if (lastDim === 4 && !locOut) locOut = t;
    else if (lastDim === 2 && !confOut) confOut = t;
  }
  if (!locOut || !confOut) return [];

  const locData = locOut.data;
  const confData = confOut.data;
  const n = confOut.dims.length === 3 ? confOut.dims[1] : confOut.dims[0];

  const steps = [8, 16, 32];
  const minSizesList = [
    [16, 32],
    [64, 128],
    [256, 512],
  ];
  const priors: number[] = [];
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const minSizes = minSizesList[si];
    const fh = Math.ceil(inputH / step);
    const fw = Math.ceil(inputW / step);
    for (let row = 0; row < fh; row++) {
      for (let col = 0; col < fw; col++) {
        for (const ms of minSizes) {
          const cx = (col + 0.5) * step;
          const cy = (row + 0.5) * step;
          priors.push(cx, cy, ms, ms);
        }
      }
    }
  }

  const v0 = 0.1;
  const v1 = 0.2;
  const dets: RawDetection[] = [];

  for (let i = 0; i < n; i++) {
    const faceScore = confData[i * 2 + 1];
    if (faceScore < threshold) continue;

    const pcx = priors[i * 4];
    const pcy = priors[i * 4 + 1];
    const pw = priors[i * 4 + 2];
    const ph = priors[i * 4 + 3];

    const cx = pcx + locData[i * 4] * v0 * pw;
    const cy = pcy + locData[i * 4 + 1] * v0 * ph;
    const w = pw * Math.exp(locData[i * 4 + 2] * v1);
    const h = ph * Math.exp(locData[i * 4 + 3] * v1);

    dets.push({
      score: faceScore,
      x: (cx - w / 2) * scaleX,
      y: (cy - h / 2) * scaleY,
      w: w * scaleX,
      h: h * scaleY,
    });
  }

  return nms(dets, 0.4);
}

/**
 * Parse BlazeFace detections (NMS built into model, normalized 0-1 coords).
 * Output: [1, N, 16] — ymin, xmin, ymax, xmax, 6 keypoints × 2
 */
export function parseBlazeFaceDetections(
  outputs: Record<string, DetectorOutput>,
  outputNames: string[],
  canvasW: number,
  canvasH: number
): RawDetection[] {
  const out = outputs[outputNames[0]];
  const data = out.data;
  const totalVals = data.length;
  const numDets = totalVals / 16;
  const dets: RawDetection[] = [];

  for (let i = 0; i < numDets; i++) {
    const ymin = data[i * 16] * canvasH;
    const xmin = data[i * 16 + 1] * canvasW;
    const ymax = data[i * 16 + 2] * canvasH;
    const xmax = data[i * 16 + 3] * canvasW;
    if (xmax - xmin > 1 && ymax - ymin > 1) {
      dets.push({
        score: 1.0,
        x: xmin,
        y: ymin,
        w: xmax - xmin,
        h: ymax - ymin,
      });
    }
  }
  return dets;
}
