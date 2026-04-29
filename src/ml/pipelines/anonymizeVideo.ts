import { detectFaces } from '@/ml/pipelines/anonymize';
import {
  resolveEffectOptions,
  applyBlur,
  applyPixelate,
  applySolid,
  applyEmoji,
  type AnonymizeEffectOptions,
} from '@/ml/utils/anonymizeEffects';
import { FaceTracker, type TrackedFace } from '@/ml/tracking/faceTracker';
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

/**
 * Scale a user-configured kernel value to be proportional to the face bbox width.
 * Reference face size = 100px (standard face in a typical photo).
 * Keeps visual consistency when face moves closer/further.
 */
function scaleKernel(userValue: number, bboxWidth: number): number {
  const refWidth = 100;
  return Math.max(1, Math.round(userValue * (bboxWidth / refWidth)));
}

function applyEffect(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  box: FaceBox,
  opts: ReturnType<typeof resolveEffectOptions>,
  idx: number,
  cW: number,
  cH: number,
  useScaleInvariant: boolean,
) {
  const bboxW = box.width;

  switch (opts.effect) {
    case 'blur': {
      const radius = useScaleInvariant ? scaleKernel(opts.blurRadius, bboxW) : opts.blurRadius;
      const pad = useScaleInvariant ? scaleKernel(opts.padding, bboxW) : opts.padding;
      const feather = useScaleInvariant ? scaleKernel(opts.feather, bboxW) : opts.feather;
      applyBlur(ctx, source, box, radius, pad, feather, opts.maskShape, cW, cH);
      break;
    }
    case 'pixelate': {
      const size = useScaleInvariant ? Math.max(2, Math.round(opts.pixelateSize * (bboxW / 100))) : opts.pixelateSize;
      const pad = useScaleInvariant ? scaleKernel(opts.padding, bboxW) : opts.padding;
      const feather = useScaleInvariant ? scaleKernel(opts.feather, bboxW) : opts.feather;
      applyPixelate(ctx, source, box, size, pad, feather, opts.maskShape, cW, cH);
      break;
    }
    case 'solid': {
      const pad = useScaleInvariant ? scaleKernel(opts.padding, bboxW) : opts.padding;
      const feather = useScaleInvariant ? scaleKernel(opts.feather, bboxW) : opts.feather;
      applySolid(ctx, source, box, opts.solidColor, pad, feather, opts.maskShape, cW, cH);
      break;
    }
    case 'emoji':
      applyEmoji(ctx, source, box, opts.emojis?.[idx] || opts.emoji, opts.padding, 0, 'rect', cW, cH);
      break;
  }
}

const EMOJI_POPULAR = [
  '😀', '😎', '🤣', '😇', '😍', '🤩', '😘', '😜', '🥳',
  '🐱', '🐶', '🐼', '🦊', '🐸', '👻', '💀', '🎃', '🤖',
];

function randomEmoji(): string {
  return EMOJI_POPULAR[Math.floor(Math.random() * EMOJI_POPULAR.length)];
}

/**
 * Process video with ByteTrack face tracking:
 * - Detect faces on keyframes (adaptive interval: 5-30 frames)
 * - ByteTrack predicts between keyframes
 * - Temporal mask smoothing via EMA
 * - Scale-invariant effect kernels
 * - Encode via MediaRecorder + canvas.requestFrame()
 */
export async function anonymizeVideo(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  const { effectOptions, modelId, onProgress } = options;
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

  const fps = 30;
  const totalFrames = Math.round(video.duration * fps);
  onProgress?.(0);

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

  const tracker = new FaceTracker();
  let trackedFaces: TrackedFace[] = [];
  let nextDetectionFrame = 0;
  let detectionInterval = 15;
  const minInterval = 5;
  const maxInterval = 30;
  const useScaleInvariant = true;

  // Per-track emoji assignments
  const trackEmojis = new Map<number, string>();

  for (let f = 0; f < totalFrames; f++) {
    // Run full detection on keyframes
    if (f >= nextDetectionFrame) {
      await seekToFrame(video, f, fps);
      const frameCanvas = canvasFromVideo(video);
      const detections = await detectFaces(frameCanvas, { modelId });

      trackedFaces = tracker.update(detections, 0.5, cW, cH);

      // Assign emojis to new tracks
      if (resolvedOpts.effect === 'emoji') {
        for (const tf of trackedFaces) {
          if (!trackEmojis.has(tf.trackId)) {
            trackEmojis.set(tf.trackId, randomEmoji());
          }
        }
      }

      // Adaptive interval: shorter when tracks are shaky
      if (tracker.isConfident() && trackedFaces.length > 0) {
        detectionInterval = Math.min(maxInterval, detectionInterval + 5);
      } else {
        detectionInterval = Math.max(minInterval, detectionInterval - 5);
      }
      nextDetectionFrame = f + detectionInterval;
    } else {
      // Between keyframes: predict tracker without new detections
      trackedFaces = tracker.update([], 0.5, cW, cH);
    }

    // Seek to frame and draw
    await seekToFrame(video, f, fps);
    encodeCtx.drawImage(video, 0, 0, cW, cH);

    if (trackedFaces.length > 0) {
      const frameCanvas = canvasFromCanvas(encodeCanvas);

      for (let i = 0; i < trackedFaces.length; i++) {
        const tf = trackedFaces[i];
        // Use smoothed bbox for effect — eliminates flickering
        const smoothBox: FaceBox = {
          x: tf.smoothX,
          y: tf.smoothY,
          width: tf.smoothWidth,
          height: tf.smoothHeight,
          confidence: 1,
        };

        // Resolve per-track emoji
        const trackOpts = { ...resolvedOpts };
        if (resolvedOpts.effect === 'emoji' && trackEmojis.has(tf.trackId)) {
          trackOpts.emojis = [trackEmojis.get(tf.trackId)!];
        }

        applyEffect(encodeCtx, frameCanvas, smoothBox, trackOpts, i, cW, cH, useScaleInvariant);
      }
    }

    if ('requestFrame' in videoTrack) {
      (videoTrack as { requestFrame: () => void }).requestFrame();
    }

    onProgress?.(Math.round((f / totalFrames) * 95));
  }

  onProgress?.(99);
  recorder.stop();

  URL.revokeObjectURL(video.src);
  video.remove();

  return outputBlobPromise;
}
