import { detectFaces } from '@/ml/pipelines/anonymize';
import {
  resolveEffectOptions,
  applyBlur,
  applyPixelate,
  applySolid,
  applyEmoji,
  type AnonymizeEffectOptions,
} from '@/ml/utils/anonymizeEffects';
import type { FaceBox } from '@/ml/utils/faceDetect';

export interface VideoAnonymizeOptions {
  effectOptions: AnonymizeEffectOptions;
  modelId: string;
  /** Re-detect faces every N frames (default 30) */
  detectionInterval?: number;
  onProgress?: (percent: number) => void;
}

function seekToFrame(video: HTMLVideoElement, frameIndex: number, fps: number): Promise<void> {
  return new Promise((resolve) => {
    const time = frameIndex / fps;
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

function canvasFromVideo(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  return canvas;
}

function canvasFromCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function applyEffect(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  box: FaceBox,
  opts: ReturnType<typeof resolveEffectOptions>,
  idx: number,
  cW: number,
  cH: number,
) {
  switch (opts.effect) {
    case 'blur':
      applyBlur(ctx, source, box, opts.blurRadius, opts.padding, opts.feather, opts.maskShape, cW, cH);
      break;
    case 'pixelate':
      applyPixelate(ctx, source, box, opts.pixelateSize, opts.padding, opts.feather, opts.maskShape, cW, cH);
      break;
    case 'solid':
      applySolid(ctx, source, box, opts.solidColor, opts.padding, opts.feather, opts.maskShape, cW, cH);
      break;
    case 'emoji':
      applyEmoji(ctx, source, box, opts.emojis?.[idx] || opts.emoji, opts.padding, 0, 'rect', cW, cH);
      break;
  }
}

/**
 * Process video: detect faces periodically, apply effect to every frame,
 * encode via MediaRecorder + canvas.requestFrame().
 */
export async function anonymizeVideo(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  const { effectOptions, modelId, detectionInterval = 30, onProgress } = options;
  const resolvedOpts = resolveEffectOptions(effectOptions);

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  const fps = 30; // use detected fps or default
  const totalFrames = Math.round(video.duration * fps);
  onProgress?.(0);

  // Detect faces on frame 0
  video.currentTime = 0;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  const cW = video.videoWidth;
  const cH = video.videoHeight;

  // Encode canvas
  const encodeCanvas = document.createElement('canvas');
  encodeCanvas.width = cW;
  encodeCanvas.height = cH;
  const encodeCtx = encodeCanvas.getContext('2d')!;

  const stream = encodeCanvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0];

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const outputBlobPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const type = mimeType.split(';')[0];
      resolve(new Blob(chunks, { type }));
    };
  });

  recorder.start();

  let currentFaces: FaceBox[] = [];

  for (let f = 0; f < totalFrames; f++) {
    // Detect faces periodically
    if (f % detectionInterval === 0 || f === 0) {
      await seekToFrame(video, f, fps);
      const frameCanvas = canvasFromVideo(video);
      currentFaces = await detectFaces(frameCanvas, { modelId });
    }

    await seekToFrame(video, f, fps);
    encodeCtx.drawImage(video, 0, 0, cW, cH);

    if (currentFaces.length > 0) {
      const frameCanvas = canvasFromCanvas(encodeCanvas);
      for (let i = 0; i < currentFaces.length; i++) {
        applyEffect(encodeCtx, frameCanvas, currentFaces[i], resolvedOpts, i, cW, cH);
      }
    }

    if ('requestFrame' in videoTrack) {
      (videoTrack as { requestFrame: () => void }).requestFrame();
    }

    onProgress?.(Math.round((f / totalFrames) * 95));
  }

  // Final remaining progress
  onProgress?.(99);

  recorder.stop();

  URL.revokeObjectURL(video.src);
  video.remove();

  return outputBlobPromise;
}
