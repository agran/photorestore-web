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
import {
  Input, Output, Mp4OutputFormat, BufferTarget,
  ALL_FORMATS, BlobSource,
  VideoSampleSink, EncodedPacketSink,
  CanvasSource, EncodedAudioPacketSource,
  type AudioCodec,
} from 'mediabunny';

export interface VideoAnonymizeOptions {
  effectOptions: AnonymizeEffectOptions;
  modelId: string;
  detectionInterval?: number;
  onProgress?: (percent: number) => void;
  onEta?: (etaSec: number) => void;
  signal?: AbortSignal;
}

function canvasFromCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function scaleKernel(userValue: number, bboxWidth: number): number {
  return Math.max(1, Math.round(userValue * (bboxWidth / 100)));
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

export async function anonymizeVideo(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  // Ensure onProgress only increases (no regression on fallback)
  let lastProgress = 0;
  const monotonicProgress = (p: number) => {
    if (p > lastProgress) {
      lastProgress = p;
      options.onProgress?.(p);
    }
  };

  const opts = { ...options, onProgress: monotonicProgress };

  try {
    return await anonymizeVideoV2(file, opts);
  } catch (err) {
    console.warn('[anonymizeVideo] V2 failed, using fallback:', err);
    lastProgress = 0; // reset for fallback to start clean
    return anonymizeVideoFallback(file, opts);
  }
}

async function anonymizeVideoV2(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  const { effectOptions, modelId, detectionInterval = 30, onProgress, onEta, signal } = options;
  const resolvedOpts = resolveEffectOptions(effectOptions);
  const useScaleInvariant = true;

  onProgress?.(0);
  const startTime = performance.now();

  // 1. Demux input
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  const videoTrack = await input.getPrimaryVideoTrack();
  const audioTrack = await input.getPrimaryAudioTrack();
  if (!videoTrack) throw new Error('No video track found');

  const cW = await videoTrack.getCodedWidth();
  const cH = await videoTrack.getCodedHeight();
  const videoDuration = (videoTrack as unknown as { duration?: number }).duration ?? 10;
  const estimatedTotalFrames = Math.round(videoDuration * 30);

  const processCanvas = document.createElement('canvas');
  processCanvas.width = cW;
  processCanvas.height = cH;
  const processCtx = processCanvas.getContext('2d')!;

  // 2. Setup output — add ALL tracks before starting
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  const canvasSource = new CanvasSource(processCanvas, {
    codec: 'avc',
    bitrate: 5_000_000,
  });
  output.addVideoTrack(canvasSource);

  let audioSource: EncodedAudioPacketSource | null = null;
  if (audioTrack) {
    const audioCodec = await audioTrack.getCodec() as AudioCodec;
    if (audioCodec) {
      audioSource = new EncodedAudioPacketSource(audioCodec);
      output.addAudioTrack(audioSource);
    }
  }

  await output.start();

  // 3. Stream video frames (in parallel with audio if desired)
  const videoSink = new VideoSampleSink(videoTrack);
  const tracker = new FaceTracker();
  let frameIndex = 0;
  const trackEmojis = new Map<number, string>();
  let nextDetectionFrame = 0;
  let detectionIntervalAdaptive = detectionInterval;
  const minInterval = 5;
  const maxInterval = 60;

  const sampleIterator = videoSink.samples();
  let sampleResult = await sampleIterator.next();

  while (!sampleResult.done) {
    const sample = sampleResult.value;

    try {
      if (signal?.aborted) break;

      let trackedFaces: TrackedFace[] = [];

      if (frameIndex >= nextDetectionFrame) {
        const detectCanvas = document.createElement('canvas');
        detectCanvas.width = cW;
        detectCanvas.height = cH;
        sample.draw(detectCanvas.getContext('2d')!, 0, 0, cW, cH);
        const detections = await detectFaces(detectCanvas, { modelId });
        trackedFaces = tracker.update(detections, 0.5, cW, cH);

        if (resolvedOpts.effect === 'emoji') {
          for (const tf of trackedFaces) {
            if (!trackEmojis.has(tf.trackId)) {
              trackEmojis.set(tf.trackId, randomEmoji());
            }
          }
        }

        if (tracker.isConfident() && trackedFaces.length > 0) {
          detectionIntervalAdaptive = Math.min(maxInterval, detectionIntervalAdaptive + 5);
        } else {
          detectionIntervalAdaptive = Math.max(minInterval, detectionIntervalAdaptive - 5);
        }
        nextDetectionFrame = frameIndex + detectionIntervalAdaptive;
      } else {
        trackedFaces = tracker.update([], 0.5, cW, cH);
      }

      sample.draw(processCtx, 0, 0, cW, cH);

      if (trackedFaces.length > 0) {
        const frameCopy = canvasFromCanvas(processCanvas);
        for (let i = 0; i < trackedFaces.length; i++) {
          const tf = trackedFaces[i];
          const smoothBox: FaceBox = {
            x: tf.smoothX, y: tf.smoothY, width: tf.smoothWidth, height: tf.smoothHeight, confidence: 1,
          };
          const trackOpts = { ...resolvedOpts };
          if (resolvedOpts.effect === 'emoji' && trackEmojis.has(tf.trackId)) {
            trackOpts.emojis = [trackEmojis.get(tf.trackId)!];
          }
          applyEffect(processCtx, frameCopy, smoothBox, trackOpts, i, cW, cH, useScaleInvariant);
        }
      }

      // CanvasSource encodes and adds the current canvas state
      await canvasSource.add(sample.timestamp, sample.duration || 1 / 30);

      frameIndex++;

      // Progress based on frame index vs estimated total
      const progress = estimatedTotalFrames > 0
        ? 5 + Math.round((frameIndex / estimatedTotalFrames) * 90)
        : 5 + Math.min(90, Math.round(frameIndex / (frameIndex + 30) * 90));
      onProgress?.(Math.min(95, progress));

      if (onEta && frameIndex > 5) {
        const elapsed = (performance.now() - startTime) / 1000;
        const rate = frameIndex / elapsed;
        const remaining = estimatedTotalFrames - frameIndex;
        const eta = Math.max(0, Math.round(remaining / rate));
        onEta(eta);
      }
    } finally {
      sample.close();
    }

    sampleResult = await sampleIterator.next();
  }

  canvasSource.close();

  // 4. Audio passthrough (track already added to output before start)
  if (audioSource) {
    const decoderConfig = await audioTrack!.getDecoderConfig();
    const audioMetadata = decoderConfig ? { decoderConfig } : undefined;

    const audioSink = new EncodedPacketSink(audioTrack!);
    let isFirstPacket = true;
    for await (const packet of audioSink.packets()) {
      if (signal?.aborted) break;
      await audioSource.add(packet, isFirstPacket ? audioMetadata : undefined);
      isFirstPacket = false;
    }
    audioSource.close();
  }

  onProgress?.(99);
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('No output buffer');
  return new Blob([buffer], { type: 'video/mp4' });
}

/** Fallback: seek-based frame extraction + MediaRecorder */
async function anonymizeVideoFallback(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  const { effectOptions, modelId, detectionInterval = 30, onProgress } = options;
  const resolvedOpts = resolveEffectOptions(effectOptions);
  const useScaleInvariant = true;

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

  const encodeCanvas = document.createElement('canvas');
  encodeCanvas.width = cW;
  encodeCanvas.height = cH;
  const encodeCtx = encodeCanvas.getContext('2d')!;

  const stream = encodeCanvas.captureStream(0);
  const vt = stream.getVideoTracks()[0];

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const outputBlobPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
  });
  recorder.start();

  const tracker = new FaceTracker();
  let nextDetectionFrame = 0;
  let dInterval = detectionInterval;
  const minInterval = 5;
  const maxInterval = 60;
  const trackEmojis = new Map<number, string>();

  function seekToFrame(v: HTMLVideoElement, frameIndex: number): Promise<void> {
    return new Promise((resolve) => {
      const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(); };
      v.addEventListener('seeked', onSeeked);
      v.currentTime = frameIndex / fps;
    });
  }

  function canvasFromVideo(v: HTMLVideoElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    return canvas;
  }

  for (let f = 0; f < totalFrames; f++) {
    let trackedFaces: TrackedFace[] = [];
    if (f >= nextDetectionFrame) {
      await seekToFrame(video, f);
      const frameCanvas = canvasFromVideo(video);
      const detections = await detectFaces(frameCanvas, { modelId });
      trackedFaces = tracker.update(detections, 0.5, cW, cH);

      if (resolvedOpts.effect === 'emoji') {
        for (const tf of trackedFaces) {
          if (!trackEmojis.has(tf.trackId)) trackEmojis.set(tf.trackId, randomEmoji());
        }
      }
      if (tracker.isConfident() && trackedFaces.length > 0) {
        dInterval = Math.min(maxInterval, dInterval + 5);
      } else {
        dInterval = Math.max(minInterval, dInterval - 5);
      }
      nextDetectionFrame = f + dInterval;
    } else {
      trackedFaces = tracker.update([], 0.5, cW, cH);
    }

    await seekToFrame(video, f);
    encodeCtx.drawImage(video, 0, 0, cW, cH);

    if (trackedFaces.length > 0) {
      const frameCopy = canvasFromCanvas(encodeCanvas);
      for (let i = 0; i < trackedFaces.length; i++) {
        const tf = trackedFaces[i];
        const smoothBox: FaceBox = { x: tf.smoothX, y: tf.smoothY, width: tf.smoothWidth, height: tf.smoothHeight, confidence: 1 };
        const trackOpts = { ...resolvedOpts };
        if (resolvedOpts.effect === 'emoji' && trackEmojis.has(tf.trackId)) {
          trackOpts.emojis = [trackEmojis.get(tf.trackId)!];
        }
        applyEffect(encodeCtx, frameCopy, smoothBox, trackOpts, i, cW, cH, useScaleInvariant);
      }
    }

    if ('requestFrame' in vt) {
      (vt as { requestFrame: () => void }).requestFrame();
    }
    onProgress?.(Math.round((f / totalFrames) * 95));
  }

  onProgress?.(99);
  recorder.stop();
  URL.revokeObjectURL(video.src);
  video.remove();
  return outputBlobPromise;
}
