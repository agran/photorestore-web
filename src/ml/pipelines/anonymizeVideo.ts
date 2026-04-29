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
  EncodedVideoPacketSource, EncodedAudioPacketSource,
  EncodedPacket,
  type VideoCodec, type AudioCodec,
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

function hasVideoEncoder(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoEncoder.isConfigSupported === 'function';
}

export async function anonymizeVideo(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  if (!hasVideoEncoder()) {
    return anonymizeVideoFallback(file, options);
  }
  return anonymizeVideoV2(file, options);
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
  const videoCodec = (await videoTrack.getCodec()) ?? 'avc';

  // 2. Setup output
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  const encodedChunks: EncodedPacket[] = [];

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      encodedChunks.push(new EncodedPacket(
        data,
        chunk.type === 'key' ? 'key' : 'delta',
        chunk.timestamp,
        chunk.duration ?? 33_333,
      ));
    },
    error: (err) => { console.error('VideoEncoder error:', err); },
  });

  const outputCodec: VideoCodec = videoCodec as VideoCodec;
  const h264Config: VideoEncoderConfig = {
    codec: 'avc1.42001E',
    width: cW,
    height: cH,
    bitrate: 5_000_000,
  };
  const configSupported = await VideoEncoder.isConfigSupported(h264Config);
  encoder.configure(configSupported ? h264Config : {
    codec: 'vp09.00.10.08',
    width: cW,
    height: cH,
    bitrate: 5_000_000,
  });

  // 3. Stream video frames
  const videoSink = new VideoSampleSink(videoTrack);
  const tracker = new FaceTracker();
  let frameIndex = 0;
  const trackEmojis = new Map<number, string>();
  let nextDetectionFrame = 0;
  let detectionIntervalAdaptive = detectionInterval;
  const minInterval = 5;
  const maxInterval = 60;

  const processCanvas = document.createElement('canvas');
  processCanvas.width = cW;
  processCanvas.height = cH;
  const processCtx = processCanvas.getContext('2d')!;

  for await (const sample of videoSink.samples()) {
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

    // Draw sample to processing canvas
    sample.draw(processCtx, 0, 0, cW, cH);

    // Apply effects
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

    // Encode processed frame (use microsecond timestamps)
    const tsUs = Math.round(sample.timestamp * 1_000_000);
    const durUs = Math.round(sample.duration * 1_000_000) || 33_333;
    const videoFrame = new VideoFrame(processCanvas, { timestamp: tsUs, duration: durUs });
    encoder.encode(videoFrame);
    videoFrame.close();
    sample.close();

    frameIndex++;

    // Report progress (frame-based, 5-95%)
    const progress = 5 + Math.min(90, Math.round((frameIndex / Math.max(frameIndex + 5, 10)) * 90));
    onProgress?.(progress);

    if (onEta && frameIndex > 5) {
      const elapsed = (performance.now() - startTime) / 1000;
      const msPerFrame = elapsed / frameIndex;
      const remainingFrames = Math.max(0, (frameIndex * 3) - frameIndex); // rough estimate
      const eta = msPerFrame * remainingFrames;
      onEta(Math.max(0, Math.round(eta)));
    }
  }

  try { await encoder.flush(); } catch { /* ignore */ }
  encoder.close();

  // 4. Add encoded chunks to output
  const videoSource = new EncodedVideoPacketSource(outputCodec);
  output.addVideoTrack(videoSource);
  await output.start();

  for (const pkt of encodedChunks) {
    if (signal?.aborted) break;
    await videoSource.add(pkt);
  }
  videoSource.close();

  // 5. Audio passthrough
  if (audioTrack) {
    const audioCodec = await audioTrack.getCodec() as AudioCodec;
    if (audioCodec) {
      const audioSource = new EncodedAudioPacketSource(audioCodec);
      output.addAudioTrack(audioSource);
      const audioSink = new EncodedPacketSink(audioTrack);
      for await (const packet of audioSink.packets()) {
        if (signal?.aborted) break;
        await audioSource.add(packet);
      }
      audioSource.close();
    }
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
