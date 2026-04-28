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
  pixelateSize: 8,
  solidColor: '#000000',
  padding: 4,
  feather: 0,
  maskShape: 'rect',
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

function clipShape(ctx: CanvasRenderingContext2D, box: FaceBox, shape: MaskShape) {
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
  ctx.closePath();
  ctx.clip();
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

function applyFeatherMask(
  targetCtx: CanvasRenderingContext2D,
  box: FaceBox,
  feather: number,
  shape: MaskShape,
  canvasW: number,
  canvasH: number
) {
  if (feather <= 0) return;

  const mask = createCanvas(canvasW, canvasH);
  const maskCtx = mask.getContext('2d')!;

  maskCtx.fillStyle = 'white';
  drawMaskShape(maskCtx, box, shape);

  maskCtx.filter = `blur(${feather}px)`;
  maskCtx.fillStyle = 'white';
  const padW = feather * 2;
  const padH = feather * 2;
  const paddedBox: FaceBox = {
    x: box.x - feather,
    y: box.y - feather,
    width: box.width + padW,
    height: box.height + padH,
    confidence: 0,
  };
  drawMaskShape(maskCtx, paddedBox, shape);
  maskCtx.filter = 'none';

  targetCtx.globalCompositeOperation = 'destination-in';
  targetCtx.drawImage(mask, 0, 0);
  targetCtx.globalCompositeOperation = 'source-over';
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

  destCtx.save();
  clipShape(destCtx, expanded, shape);
  destCtx.drawImage(region, expanded.x, expanded.y);

  if (feather > 0) {
    applyFeatherMask(destCtx, expanded, feather, shape, canvasW, canvasH);
  }
  destCtx.restore();
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
  const blockSize = Math.max(2, pixelateSize);

  const smallW = Math.max(1, Math.round(expanded.width / blockSize));
  const smallH = Math.max(1, Math.round(expanded.height / blockSize));

  const small = createCanvas(smallW, smallH);
  const smallCtx = small.getContext('2d')!;
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.drawImage(source, expanded.x, expanded.y, expanded.width, expanded.height, 0, 0, smallW, smallH);

  destCtx.save();
  clipShape(destCtx, expanded, shape);
  destCtx.imageSmoothingEnabled = false;
  destCtx.drawImage(small, 0, 0, smallW, smallH, expanded.x, expanded.y, expanded.width, expanded.height);

  if (feather > 0) {
    applyFeatherMask(destCtx, expanded, feather, shape, canvasW, canvasH);
  }
  destCtx.restore();
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

  destCtx.save();
  destCtx.fillStyle = solidColor;
  clipShape(destCtx, expanded, shape);
  destCtx.fillRect(expanded.x, expanded.y, expanded.width, expanded.height);

  if (feather > 0) {
    applyFeatherMask(destCtx, expanded, feather, shape, canvasW, canvasH);
  }
  destCtx.restore();
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

  const textCanvas = createCanvas(expanded.width, expanded.height);
  const textCtx = textCanvas.getContext('2d')!;
  const fontSize = Math.min(expanded.width, expanded.height);
  textCtx.font = `${fontSize}px sans-serif`;
  textCtx.textAlign = 'center';
  textCtx.textBaseline = 'middle';
  textCtx.fillText(emoji, expanded.width / 2, expanded.height / 2);

  destCtx.save();
  clipShape(destCtx, expanded, shape);
  destCtx.drawImage(textCanvas, expanded.x, expanded.y);

  if (feather > 0) {
    applyFeatherMask(destCtx, expanded, feather, shape, canvasW, canvasH);
  }
  destCtx.restore();
}
