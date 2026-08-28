import type { FaceBox } from './faceDetect';

export type AnonymizeEffect = 'blur' | 'pixelate' | 'solid' | 'emoji' | 'sticker';
export type MaskShape = 'rect' | 'ellipse';

/**
 * 'faces' (default): run face detection and apply the effect only to faces.
 * 'full': skip detection entirely and apply the effect to the whole frame —
 * used for blurring / pixelating an entire photo or video without finding
 * faces first.
 */
export type AnonymizeMode = 'faces' | 'full';

export interface AnonymizeEffectOptions {
  effect: AnonymizeEffect;
  blurRadius?: number;
  pixelateSize?: number;
  solidColor?: string;
  padding?: number;
  feather?: number;
  maskShape?: MaskShape;
  emoji?: string;
  emojis?: string[];
}

const DEFAULT_OPTIONS: Required<AnonymizeEffectOptions> = {
  effect: 'pixelate',
  blurRadius: 12,
  pixelateSize: 16,
  solidColor: '#000000',
  padding: 4,
  feather: 4,
  maskShape: 'ellipse',
  emoji: '😶',
  emojis: [],
};

export function resolveEffectOptions(
  opts: AnonymizeEffectOptions
): Required<AnonymizeEffectOptions> {
  return { ...DEFAULT_OPTIONS, ...opts };
}

/** Linear scale of a kernel-like value (padding, feather) to face size.
 *  Slider values are calibrated against a 100px-wide face. */
export function scaleKernel(userValue: number, bboxWidth: number): number {
  return Math.max(1, Math.round(userValue * (bboxWidth / 100)));
}

/**
 * Clamped-linear scale for effect *strength* (blur radius, pixelate block).
 * Linear in face width above the 100px reference, but never shrinks below
 * the slider value (factor floored at 1). Net effect: roughly constant
 * block count across the face for any size ≥ 100px, while small faces
 * still get pixels at slider-size so they look like pixelation, not noise.
 *
 *   factor = max(1, faceWidth / 100)
 *
 * face=50  → ×1   (slider value preserved — no shrinking)
 * face=100 → ×1
 * face=500 → ×5
 * face=2000 → ×20
 */
export function scaleEffectStrength(userValue: number, bboxWidth: number, minValue = 1): number {
  const factor = Math.max(1, bboxWidth / 100);
  return Math.max(minValue, Math.round(userValue * factor));
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function expandBox(box: FaceBox, padding: number, canvasW: number, canvasH: number): FaceBox {
  // Symmetric padding: when the face is close to a canvas edge, clamp the
  // padding on BOTH sides of that axis to the edge distance — otherwise
  // only one side gets clipped and the expanded box drifts off-center
  // (visible as masks shifted toward the opposite side, especially with
  // big-face padding scaling where padding can be 50-100px).
  const padX = Math.min(padding, box.x, canvasW - box.x - box.width);
  const padY = Math.min(padding, box.y, canvasH - box.y - box.height);
  const safePadX = Math.max(0, padX);
  const safePadY = Math.max(0, padY);
  const x = box.x - safePadX;
  const y = box.y - safePadY;
  const w = box.width + safePadX * 2;
  const h = box.height + safePadY * 2;
  return { x, y, width: w, height: h, confidence: box.confidence };
}

function drawMaskShape(ctx: CanvasRenderingContext2D, box: FaceBox, shape: MaskShape) {
  ctx.beginPath();
  if (shape === 'ellipse') {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const rx = box.width / 2;
    const ry = box.height / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(box.x, box.y, box.width, box.height);
  }
  ctx.fill();
}

function applyClip(ctx: CanvasRenderingContext2D, box: FaceBox, shape: MaskShape) {
  ctx.beginPath();
  if (shape === 'ellipse') {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const rx = box.width / 2;
    const ry = box.height / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(box.x, box.y, box.width, box.height);
  }
  ctx.clip();
}

function createFeatherMask(
  w: number,
  h: number,
  feather: number,
  shape: MaskShape
): { mask: HTMLCanvasElement; border: number } {
  const border = feather > 0 ? Math.ceil(feather * 3) : 0;
  const mw = w + border * 2;
  const mh = h + border * 2;
  const mask = createCanvas(mw, mh);
  const maskCtx = mask.getContext('2d')!;

  if (feather <= 0) {
    maskCtx.fillStyle = 'white';
    drawMaskShape(maskCtx, { x: border, y: border, width: w, height: h, confidence: 0 }, shape);
    return { mask, border };
  }

  const f = Math.max(0, Math.min(feather, w / 2 - 1, h / 2 - 1));
  const eroded: FaceBox = {
    x: border + f,
    y: border + f,
    width: w - f * 2,
    height: h - f * 2,
    confidence: 0,
  };
  maskCtx.filter = `blur(${f}px)`;
  maskCtx.fillStyle = 'white';
  drawMaskShape(maskCtx, eroded, shape);
  maskCtx.filter = 'none';

  return { mask, border };
}

/**
 * Draws `source` into `ctx` at (dx, dy) with an extra `margin`-wide ring of
 * edge-clamped pixels around it. Without this, blur filters would sample
 * transparent pixels beyond the content and fade the picture near the border.
 */
function drawWithEdgePadding(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  margin: number
) {
  if (margin <= 0) {
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, sw, sh);
    return;
  }
  // Center + edge-stretched strips and corners (edge clamp).
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, sw, sh);
  ctx.drawImage(source, sx, sy, sw, 1, dx, dy - margin, sw, margin);
  ctx.drawImage(source, sx, sy + sh - 1, sw, 1, dx, dy + sh, sw, margin);
  ctx.drawImage(source, sx, sy, 1, sh, dx - margin, dy, margin, sh);
  ctx.drawImage(source, sx + sw - 1, sy, 1, sh, dx + sw, dy, margin, sh);
  ctx.drawImage(source, sx, sy, 1, 1, dx - margin, dy - margin, margin, margin);
  ctx.drawImage(source, sx + sw - 1, sy, 1, 1, dx + sw, dy - margin, margin, margin);
  ctx.drawImage(source, sx, sy + sh - 1, 1, 1, dx - margin, dy + sh, margin, margin);
  ctx.drawImage(source, sx + sw - 1, sy + sh - 1, 1, 1, dx + sw, dy + sh, margin, margin);
}

export function applyBlur(
  destCtx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  box: FaceBox,
  blurRadius: number,
  padding: number,
  feather: number,
  shape: MaskShape,
  canvasW: number,
  canvasH: number
) {
  const expanded = expandBox(box, padding, canvasW, canvasH);

  // The blur kernel samples outside the region edges — without a padded,
  // edge-clamped margin those samples land on transparent pixels, so the
  // region border fades back toward the original. Most visible in
  // whole-frame mode, where the frame edges stay unblurred. Work on a
  // canvas padded by ~3×radius and crop the center back when compositing.
  const margin = blurRadius > 0 ? Math.ceil(blurRadius * 3) : 0;
  const region = createCanvas(expanded.width + margin * 2, expanded.height + margin * 2);
  const regionCtx = region.getContext('2d')!;
  drawWithEdgePadding(
    regionCtx,
    source,
    expanded.x,
    expanded.y,
    expanded.width,
    expanded.height,
    margin,
    margin,
    margin
  );

  if (blurRadius > 0) {
    regionCtx.filter = `blur(${blurRadius}px)`;
  }
  regionCtx.drawImage(region, 0, 0);
  regionCtx.filter = 'none';

  if (feather > 0) {
    const { mask, border } = createFeatherMask(expanded.width, expanded.height, feather, shape);
    const tmp = createCanvas(mask.width, mask.height);
    const tmpCtx = tmp.getContext('2d')!;
    tmpCtx.drawImage(
      region,
      margin,
      margin,
      expanded.width,
      expanded.height,
      border,
      border,
      expanded.width,
      expanded.height
    );
    tmpCtx.globalCompositeOperation = 'destination-in';
    tmpCtx.drawImage(mask, 0, 0);
    destCtx.drawImage(tmp, expanded.x - border, expanded.y - border);
  } else {
    destCtx.save();
    applyClip(destCtx, expanded, shape);
    destCtx.drawImage(
      region,
      margin,
      margin,
      expanded.width,
      expanded.height,
      expanded.x,
      expanded.y,
      expanded.width,
      expanded.height
    );
    destCtx.restore();
  }
}

export function applyPixelate(
  destCtx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  box: FaceBox,
  pixelateSize: number,
  padding: number,
  feather: number,
  shape: MaskShape,
  canvasW: number,
  canvasH: number
) {
  const expanded = expandBox(box, padding, canvasW, canvasH);
  const blockSize = Math.max(1, pixelateSize);

  const smallW = Math.max(1, Math.round(expanded.width / blockSize));
  const smallH = Math.max(1, Math.round(expanded.height / blockSize));

  const small = createCanvas(smallW, smallH);
  const smallCtx = small.getContext('2d')!;
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.drawImage(
    source,
    expanded.x,
    expanded.y,
    expanded.width,
    expanded.height,
    0,
    0,
    smallW,
    smallH
  );

  if (feather > 0) {
    const { mask, border } = createFeatherMask(expanded.width, expanded.height, feather, shape);
    const tmp = createCanvas(mask.width, mask.height);
    const tmpCtx = tmp.getContext('2d')!;
    tmpCtx.imageSmoothingEnabled = false;
    tmpCtx.drawImage(small, 0, 0, smallW, smallH, border, border, expanded.width, expanded.height);
    tmpCtx.globalCompositeOperation = 'destination-in';
    tmpCtx.drawImage(mask, 0, 0);
    destCtx.drawImage(tmp, expanded.x - border, expanded.y - border);
  } else {
    destCtx.save();
    applyClip(destCtx, expanded, shape);
    destCtx.imageSmoothingEnabled = false;
    destCtx.drawImage(
      small,
      0,
      0,
      smallW,
      smallH,
      expanded.x,
      expanded.y,
      expanded.width,
      expanded.height
    );
    destCtx.restore();
  }
}

export function applySolid(
  destCtx: CanvasRenderingContext2D,
  _source: HTMLCanvasElement,
  box: FaceBox,
  solidColor: string,
  padding: number,
  feather: number,
  shape: MaskShape,
  canvasW: number,
  canvasH: number
) {
  const expanded = expandBox(box, padding, canvasW, canvasH);

  if (feather > 0) {
    const { mask, border } = createFeatherMask(expanded.width, expanded.height, feather, shape);
    const tmp = createCanvas(mask.width, mask.height);
    const tmpCtx = tmp.getContext('2d')!;
    tmpCtx.fillStyle = solidColor;
    tmpCtx.fillRect(border, border, expanded.width, expanded.height);
    tmpCtx.globalCompositeOperation = 'destination-in';
    tmpCtx.drawImage(mask, 0, 0);
    destCtx.drawImage(tmp, expanded.x - border, expanded.y - border);
  } else {
    destCtx.save();
    destCtx.fillStyle = solidColor;
    applyClip(destCtx, expanded, shape);
    destCtx.fillRect(expanded.x, expanded.y, expanded.width, expanded.height);
    destCtx.restore();
  }
}

export function applyEmoji(
  destCtx: CanvasRenderingContext2D,
  _source: HTMLCanvasElement,
  box: FaceBox,
  emoji: string,
  padding: number,
  feather: number,
  shape: MaskShape,
  canvasW: number,
  canvasH: number
) {
  const expanded = expandBox(box, padding, canvasW, canvasH);

  if (feather > 0) {
    const { mask, border } = createFeatherMask(expanded.width, expanded.height, feather, shape);
    const tmp = createCanvas(mask.width, mask.height);
    const tmpCtx = tmp.getContext('2d')!;
    const fontSize = Math.min(expanded.width, expanded.height);
    tmpCtx.font = `${fontSize}px sans-serif`;
    tmpCtx.textAlign = 'center';
    tmpCtx.textBaseline = 'middle';
    tmpCtx.fillText(emoji, mask.width / 2, mask.height / 2);
    tmpCtx.globalCompositeOperation = 'destination-in';
    tmpCtx.drawImage(mask, 0, 0);
    destCtx.drawImage(tmp, expanded.x - border, expanded.y - border);
  } else {
    destCtx.save();
    applyClip(destCtx, expanded, shape);
    const fontSize = Math.min(expanded.width, expanded.height);
    destCtx.font = `${fontSize}px sans-serif`;
    destCtx.textAlign = 'center';
    destCtx.textBaseline = 'middle';
    destCtx.fillText(emoji, expanded.x + expanded.width / 2, expanded.y + expanded.height / 2);
    destCtx.restore();
  }
}
