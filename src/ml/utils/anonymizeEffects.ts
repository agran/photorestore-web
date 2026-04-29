import type { FaceBox } from './faceDetect';

export type AnonymizeEffect = 'blur' | 'pixelate' | 'solid' | 'emoji' | 'sticker';
export type MaskShape = 'rect' | 'ellipse';

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

export function resolveEffectOptions(opts: AnonymizeEffectOptions): Required<AnonymizeEffectOptions> {
  return { ...DEFAULT_OPTIONS, ...opts };
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function expandBox(box: FaceBox, padding: number, canvasW: number, canvasH: number): FaceBox {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const w = Math.min(canvasW - x, box.width + padding * 2);
  const h = Math.min(canvasH - y, box.height + padding * 2);
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

function createFeatherMask(w: number, h: number, feather: number, shape: MaskShape): { mask: HTMLCanvasElement; border: number } {
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
  const eroded: FaceBox = { x: border + f, y: border + f, width: w - f * 2, height: h - f * 2, confidence: 0 };
  maskCtx.filter = `blur(${f}px)`;
  maskCtx.fillStyle = 'white';
  drawMaskShape(maskCtx, eroded, shape);
  maskCtx.filter = 'none';

  return { mask, border };
}

function getFaceRegion(
  source: HTMLCanvasElement,
  box: FaceBox
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const region = createCanvas(box.width, box.height);
  const ctx = region.getContext('2d')!;
  ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return { canvas: region, ctx };
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
  const { canvas: region, ctx: regionCtx } = getFaceRegion(source, expanded);

  if (blurRadius > 0) {
    regionCtx.filter = `blur(${blurRadius}px)`;
  }
  regionCtx.drawImage(region, 0, 0);
  regionCtx.filter = 'none';

  if (feather > 0) {
    const { mask, border } = createFeatherMask(expanded.width, expanded.height, feather, shape);
    const tmp = createCanvas(mask.width, mask.height);
    const tmpCtx = tmp.getContext('2d')!;
    tmpCtx.drawImage(region, border, border);
    tmpCtx.globalCompositeOperation = 'destination-in';
    tmpCtx.drawImage(mask, 0, 0);
    destCtx.drawImage(tmp, expanded.x - border, expanded.y - border);
  } else {
    destCtx.save();
    applyClip(destCtx, expanded, shape);
    destCtx.drawImage(region, expanded.x, expanded.y);
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
  smallCtx.drawImage(source, expanded.x, expanded.y, expanded.width, expanded.height, 0, 0, smallW, smallH);

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
    destCtx.drawImage(small, 0, 0, smallW, smallH, expanded.x, expanded.y, expanded.width, expanded.height);
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
