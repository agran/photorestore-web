import { detectFaces } from '@/ml/pipelines/anonymize';
import { estimatePoses, faceBoxFromPose, type PoseEstimate } from '@/ml/pipelines/poseEstimate';
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
import { FaceTracker, type TrackedFace } from '@/ml/tracking/faceTracker';
import type { FaceBox } from '@/ml/utils/faceDetect';
import {
  Input, Output, Mp4OutputFormat, BufferTarget,
  ALL_FORMATS, BlobSource,
  VideoSampleSink, EncodedPacketSink,
  EncodedVideoPacketSource, EncodedAudioPacketSource,
  EncodedPacket,
} from 'mediabunny';

export type VideoAnonymizeQuality = 'fast' | 'accurate';

// Tracker maxLost in frames. Without body tracking, 40 frames (~1.3 s @ 30fps)
// is enough to bridge brief detector misses without "sticky" masks lingering
// where a person already left. With body tracking, 300 frames (~10 s) gives
// the pose-derived face position time to take over during long occlusions
// (someone turning around, walking behind a foreground object, etc.).
const MAX_LOST_FRAMES_NO_BODY = 40;
const MAX_LOST_FRAMES_WITH_BODY = 300;

export interface TrackMeta {
  trackId: number;
  firstFrame: number;
  lastFrame: number;
  thumbnailUrl: string;
}

export interface KeyframeData {
  frameIndex: number;
  detections: FaceBox[];
  poses: PoseEstimate[] | null;
}

export interface VideoAnonymizeOptions {
  effectOptions: AnonymizeEffectOptions;
  modelId: string;
  /**
   * 'accurate' (default): detect every frame — no gaps when faces appear, slower.
   * 'fast': adaptive detection (5–60 frame interval) — faster, but newly-appearing
   * faces may be uncovered for up to ~2 seconds until the next detection keyframe.
   */
  quality?: VideoAnonymizeQuality;
  videoDuration?: number;
  videoFps?: number;
  bodyTracking?: boolean;
  onProgress?: (percent: number) => void;
  onEta?: (etaSec: number) => void;
  signal?: AbortSignal;
  /** Track IDs to exclude from anonymization (skip their masks). */
  excludeTrackIds?: Set<number>;
  /** Callback with collected track metadata after first pass. */
  onTrackMeta?: (tracks: TrackMeta[]) => void;
  /** Pre-computed keyframe data from a previous pass. Skips ONNX inference for speed. */
  storedKeyframes?: KeyframeData[];
  /** Callback with keyframe data collected during processing, for reuse on re-process. */
  onKeyframeData?: (keyframes: KeyframeData[]) => void;
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
  useScaleInvariant: boolean,
  /**
   * Width to use for *effect strength* scaling (blur radius / pixel size).
   * Pass a per-track stabilized width here so the kernel doesn't jitter as the
   * detected bbox shrinks/grows when the head rotates. Padding/feather still
   * use the live box width so the mask outline stays tight to the face.
   */
  effectWidth?: number,
) {
  const bboxW = box.width;
  const strengthW = effectWidth ?? bboxW;
  switch (opts.effect) {
    case 'blur': {
      const radius = useScaleInvariant ? scaleEffectStrength(opts.blurRadius, strengthW) : opts.blurRadius;
      const pad = useScaleInvariant ? scaleKernel(opts.padding, bboxW) : opts.padding;
      const feather = useScaleInvariant ? scaleKernel(opts.feather, bboxW) : opts.feather;
      applyBlur(ctx, source, box, radius, pad, feather, opts.maskShape, cW, cH);
      break;
    }
    case 'pixelate': {
      const size = useScaleInvariant ? scaleEffectStrength(opts.pixelateSize, strengthW, 2) : opts.pixelateSize;
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
    case 'emoji': {
      const pad = useScaleInvariant ? scaleKernel(opts.padding, bboxW) : opts.padding;
      applyEmoji(ctx, source, box, opts.emojis?.[idx] || opts.emoji, pad, 0, opts.maskShape, cW, cH);
      break;
    }
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
    // Offset fallback progress to continue from V2's last value
    const offset = lastProgress;
    const fallbackOpts = {
      ...options,
      onProgress: (p: number) => {
        const adjusted = offset + Math.round(p * (99 - offset) / 99);
        monotonicProgress(adjusted);
      },
    };
    return anonymizeVideoFallback(file, fallbackOpts);
  }
}

async function anonymizeVideoV2(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  const { effectOptions, modelId, quality = 'fast', videoDuration: optDuration, bodyTracking = false, onProgress, onEta, signal, excludeTrackIds, onTrackMeta, storedKeyframes, onKeyframeData } = options;
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
  const videoDuration = optDuration ?? 10;

  const processCanvas = document.createElement('canvas');
  processCanvas.width = cW;
  processCanvas.height = cH;
  const processCtx = processCanvas.getContext('2d')!;

  // Detection canvas is a separate buffer so the inference pipeline reads a
  // pristine frame while we mutate processCanvas (mask draws). Reused across
  // every keyframe — at 1080p30 in accurate mode this saves ~240 MB/s of
  // canvas allocations vs. document.createElement('canvas') per keyframe.
  const detectCanvas = document.createElement('canvas');
  detectCanvas.width = cW;
  detectCanvas.height = cH;
  const detectCtx = detectCanvas.getContext('2d')!;

  // 2. Setup codec + encoder
  const h264Config: VideoEncoderConfig = {
    codec: 'avc1.420028',
    width: cW,
    height: cH,
    bitrate: 5_000_000,
  };
  const configSupported = await VideoEncoder.isConfigSupported(h264Config);
  const outputCodec = configSupported ? 'avc1.420028' : 'vp09.00.10.08';
  const outputCodecType = configSupported ? 'avc' as const : 'vp9' as const;

  const encodedChunks: EncodedVideoChunk[] = [];
  let encoderMeta: EncodedVideoChunkMetadata | undefined;
  let isFirstVideoPacket = true;
  let encoderError: unknown = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (!encoderMeta && meta) encoderMeta = meta;
      encodedChunks.push(chunk);
    },
    error: (err) => { console.error('VideoEncoder error:', err); encoderError = err; },
  });
  encoder.configure(configSupported ? h264Config : {
    codec: 'vp09.00.10.08', width: cW, height: cH, bitrate: 5_000_000,
  });

  // 3. Setup output
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  const videoSource = new EncodedVideoPacketSource(outputCodecType);
  output.addVideoTrack(videoSource);

  let audioSource: EncodedAudioPacketSource | null = null;
  if (audioTrack) {
    const rawCodec = await audioTrack.getCodec();
    if (rawCodec) {
      audioSource = new EncodedAudioPacketSource(rawCodec);
      output.addAudioTrack(audioSource);
    } else {
      console.warn('[anonymizeVideo] Audio codec not recognized, skipping audio');
    }
  }

  await output.start();

  async function drainEncodedChunks() {
    while (encodedChunks.length > 0) {
      if (signal?.aborted) break;
      const chunk = encodedChunks.shift()!;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const pkt = new EncodedPacket(
        data,
        chunk.type === 'key' ? 'key' : 'delta',
        chunk.timestamp / 1_000_000,
        (chunk.duration ?? 33_333) / 1_000_000,
      );
      const meta = isFirstVideoPacket
        ? (encoderMeta ?? { decoderConfig: { codec: outputCodec, codedWidth: cW, codedHeight: cH } })
        : undefined;
      await videoSource.add(pkt, meta);
      isFirstVideoPacket = false;
    }
  }

  // 4. Stream video frames
  const videoSink = new VideoSampleSink(videoTrack);
  // When body tracking is enabled, keep tracks alive much longer so the
  // pose-derived face position can take over while the face is occluded.
  const tracker = new FaceTracker({
    maxLost: bodyTracking ? MAX_LOST_FRAMES_WITH_BODY : MAX_LOST_FRAMES_NO_BODY,
  });
  let frameIndex = 0;
  const trackEmojis = new Map<number, string>();
  let nextDetectionFrame = 0;
  // 'accurate' = detect every frame (interval pinned to 1).
  // 'fast' = adaptive 5–60, starting at 30 (legacy behaviour).
  let detectionIntervalAdaptive = quality === 'accurate' ? 1 : 30;
  const minInterval = quality === 'accurate' ? 1 : 5;
  const maxInterval = quality === 'accurate' ? 1 : 60;

  // Track metadata collection for mask review after first pass. Thumbnail
  // canvas is held until finalize() — encoded to a blob URL there to avoid
  // synchronous toDataURL on every new track (which can block the main
  // thread for ~5–10 ms each on 1080p frames).
  const trackMetaMap = new Map<number, { firstFrame: number; lastFrame: number; thumbCanvas: HTMLCanvasElement }>();
  const excludedSet = excludeTrackIds ?? new Set<number>();

  // Pre-computed keyframes from a previous pass — skip ONNX inference on replay.
  const keyframeLookup = storedKeyframes
    ? new Map(storedKeyframes.map((k) => [k.frameIndex, k]))
    : undefined;
  const keyframeDataList: KeyframeData[] = [];

  const sampleIterator = videoSink.samples();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  let sampleResult = await sampleIterator.next();
  if (signal?.aborted) {
    if (!sampleResult.done) sampleResult.value.close();
    throw new DOMException('Aborted', 'AbortError');
  }

  // Body tracking: cache pose estimates and map trackId → pose index
  let cachedPoses: PoseEstimate[] | null = null;
  const trackBodyMap = new Map<number, number>();
  // Per-track EMA-smoothed body-derived face box. Without this the mask jumps
  // frame-to-frame because pose keypoints jitter slightly.
  const lastBodyBoxes = new Map<number, { x: number; y: number; width: number; height: number }>();
  // Per-track stable width used to scale effect strength. Grows instantly
  // (when face gets bigger) but shrinks slowly (1% per frame, ~70 frame
  // half-life) — head rotation can reduce the detected width by 30–50% for a
  // few frames; without this the pixel/blur kernel would shrink and the face
  // would become more recognizable mid-rotation.
  const EFFECT_W_DECAY = 0.99;
  const trackEffectWidths = new Map<number, number>();
  // Pose runs on face-keyframes, but throttled in 'accurate' mode where every
  // frame is a face-keyframe (running an 80 MB pose model 30 times/sec is slow
  // and bodies don't move much frame-to-frame).
  let nextPoseFrame = 0;
  const poseStride = quality === 'accurate' ? 5 : 1; // in face-keyframe units

  function rebuildTrackBodyMap(faces: TrackedFace[], poses: PoseEstimate[] | null) {
    trackBodyMap.clear();
    if (!poses || poses.length === 0) return;

    // 1-to-1 greedy assignment by smallest distance. Without this, two
    // close-standing people can have both face tracks attached to the same
    // pose — the second person's mask "jumps" onto the first person's face.
    const pairs: Array<{ f: number; p: number; dist: number }> = [];
    for (let f = 0; f < faces.length; f++) {
      const tf = faces[f];
      const fcx = tf.smoothX + tf.smoothWidth / 2;
      const fcy = tf.smoothY + tf.smoothHeight / 2;
      const radiusMul = tf.framesSinceUpdate > 0 ? 5 : 3;
      const radius = Math.max(tf.smoothWidth, tf.smoothHeight) * radiusMul;
      for (let p = 0; p < poses.length; p++) {
        const nose = poses[p].nose;
        if (nose.score < 0.3) continue;
        if (nose.x <= 0 || nose.y <= 0 || nose.x >= cW || nose.y >= cH) continue;
        const d = Math.sqrt((fcx - nose.x) ** 2 + (fcy - nose.y) ** 2);
        if (d < radius) pairs.push({ f, p, dist: d });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const usedFaces = new Set<number>();
    const usedPoses = new Set<number>();
    for (const { f, p } of pairs) {
      if (usedFaces.has(f) || usedPoses.has(p)) continue;
      usedFaces.add(f);
      usedPoses.add(p);
      trackBodyMap.set(faces[f].trackId, p);
    }
  }

  while (!sampleResult.done) {
    const sample = sampleResult.value;

    try {
      if (signal?.aborted) break;

      let trackedFaces: TrackedFace[] = [];

      if (frameIndex >= nextDetectionFrame) {
        const runPose = bodyTracking && frameIndex >= nextPoseFrame;

        let detections: FaceBox[];
        let posesResult: PoseEstimate[] | null;

        // Replay stored keyframe data from a previous pass to skip expensive
        // ONNX inference when re-processing with modified exclusion masks.
        const stored = keyframeLookup?.get(frameIndex);
        // detectCanvas is the pre-allocated reusable buffer. We only redraw
        // it from the current sample on real-detection passes; on stored
        // (replay) passes we leave it untouched and skip thumbnail capture.
        let detectCanvasFresh = false;
        if (stored) {
          detections = stored.detections.map((d) => ({ ...d }));
          posesResult = stored.poses;
        } else {
          detectCtx.clearRect(0, 0, cW, cH);
          sample.draw(detectCtx, 0, 0, cW, cH);
          detectCanvasFresh = true;

          const [dets, poses] = await Promise.all([
            detectFaces(detectCanvas, { modelId }),
            runPose ? estimatePoses(detectCanvas).catch(() => null) : Promise.resolve(null),
          ]);
          detections = dets;
          posesResult = poses;

          // Collect keyframe data for reuse on subsequent re-processing passes.
          if (onKeyframeData) {
            keyframeDataList.push({
              frameIndex,
              detections: detections.map((d) => ({ ...d })),
              poses: runPose ? posesResult : null,
            });
          }
        }

        // Inject pose-only synthetic detections so partial/edge faces (where
        // the face detector misses but the pose detector still sees the body)
        // get masked from the very first frame they enter. Only inject from
        // FRESH poses — stale cachedPoses would create phantom tracks at old
        // positions when the camera pans.
        const posesForInject = runPose ? posesResult : null;
        if (bodyTracking && posesForInject) {
          for (const pose of posesForInject) {
            if (pose.nose.score < 0.3) continue;
            // Skip if any real detection already covers this pose's nose
            const noseCovered = detections.some(d =>
              pose.nose.x >= d.x && pose.nose.x <= d.x + d.width &&
              pose.nose.y >= d.y && pose.nose.y <= d.y + d.height
            );
            if (noseCovered) continue;
            const synth = faceBoxFromPose(pose, { width: 0, height: 0 }, cW, cH);
            if (!synth) continue;
            detections.push({
              x: synth.x, y: synth.y,
              width: synth.width, height: synth.height,
              confidence: 0.6, // synthetic — high enough to seed a track
            });
          }
        }

        // Always call update() — even on empty detections, so framesSinceUpdate
        // increments and the body-tracking override can take over.
        trackedFaces = tracker.update(detections, cW, cH);

        // Collect track metadata for mask review. Thumbnail capture only
        // happens when we have a fresh detect frame — on replay passes
        // (stored data) onTrackMeta is undefined anyway, so this is fine.
        if (onTrackMeta && detectCanvasFresh) {
          for (const tf of trackedFaces) {
            const existing = trackMetaMap.get(tf.trackId);
            if (existing) {
              existing.lastFrame = frameIndex;
            } else {
              const pad = 20;
              const tx = Math.max(0, Math.round(tf.x) - pad);
              const ty = Math.max(0, Math.round(tf.y) - pad);
              const tw = Math.min(Math.round(tf.width) + pad * 2, cW - tx);
              const th = Math.min(Math.round(tf.height) + pad * 2, cH - ty);
              const thumbCanvas = document.createElement('canvas');
              thumbCanvas.width = tw;
              thumbCanvas.height = th;
              thumbCanvas.getContext('2d')!.drawImage(detectCanvas, tx, ty, tw, th, 0, 0, tw, th);
              trackMetaMap.set(tf.trackId, {
                firstFrame: frameIndex,
                lastFrame: frameIndex,
                thumbCanvas,
              });
            }
          }
        }

        if (runPose) {
          cachedPoses = posesResult;
          nextPoseFrame = frameIndex + poseStride;
        }
        // Always rebuild associations against the most-recent poses so that
        // trackId → pose mappings stay valid as the tracker creates/retires
        // tracks. Lost tracks are mapped too (with a wider radius).
        if (bodyTracking) rebuildTrackBodyMap(trackedFaces, cachedPoses);

        if (resolvedOpts.effect === 'emoji') {
          for (const tf of trackedFaces) {
            if (!trackEmojis.has(tf.trackId)) trackEmojis.set(tf.trackId, randomEmoji());
          }
        }
        if (tracker.isConfident() && trackedFaces.length > 0) {
          detectionIntervalAdaptive = Math.min(maxInterval, detectionIntervalAdaptive + 5);
        } else {
          detectionIntervalAdaptive = Math.max(minInterval, detectionIntervalAdaptive - 5);
        }
        nextDetectionFrame = frameIndex + detectionIntervalAdaptive;
      } else {
        trackedFaces = tracker.predict(cW, cH);
      }

      sample.draw(processCtx, 0, 0, cW, cH);

      if (trackedFaces.length > 0) {
        const frameCopy = canvasFromCanvas(processCanvas);
        const aliveTrackIds = new Set<number>();
        for (let i = 0; i < trackedFaces.length; i++) {
          const tf = trackedFaces[i];
          aliveTrackIds.add(tf.trackId);

          // Skip tracks excluded by user during mask review
          if (excludedSet.has(tf.trackId)) continue;

          // Suppress the mask for tracks that look like phantoms: face has
          // been unmatched for several frames AND no body pose backs them up.
          // Without this guard the predicted bbox keeps moving (Kalman extra-
          // polation) and the mask "flies" through empty parts of the frame
          // when the camera pans away from the original subject.
          if (bodyTracking && tf.framesSinceUpdate > 1 && !trackBodyMap.has(tf.trackId)) {
            continue;
          }

          let faceBox: FaceBox = { x: tf.smoothX, y: tf.smoothY, width: tf.smoothWidth, height: tf.smoothHeight, confidence: 1 };

          // Body tracking override. Triggers either when the face track is
          // unmatched (framesSinceUpdate > 0) OR the body estimate is much
          // larger than the track box — that catches the "weak detection
          // shrinks the mask" case where the track stays matched but on
          // increasingly tiny detections.
          if (bodyTracking && cachedPoses) {
            const bodyIdx = trackBodyMap.get(tf.trackId);
            if (bodyIdx !== undefined && bodyIdx < cachedPoses.length) {
              const estimated = faceBoxFromPose(
                cachedPoses[bodyIdx],
                { width: tf.smoothWidth, height: tf.smoothHeight },
                cW, cH,
              );
              if (estimated) {
                const trackArea = tf.smoothWidth * tf.smoothHeight;
                const bodyArea = estimated.width * estimated.height;
                const useBody = tf.framesSinceUpdate > 0 || bodyArea > trackArea * 1.5;
                if (useBody) {
                  // EMA-smooth across frames so pose-keypoint jitter doesn't
                  // wobble the mask.
                  const prev = lastBodyBoxes.get(tf.trackId);
                  const alpha = prev ? 0.4 : 1.0;
                  const smoothed = {
                    x: (prev ? prev.x * (1 - alpha) : 0) + estimated.x * alpha,
                    y: (prev ? prev.y * (1 - alpha) : 0) + estimated.y * alpha,
                    width: (prev ? prev.width * (1 - alpha) : 0) + estimated.width * alpha,
                    height: (prev ? prev.height * (1 - alpha) : 0) + estimated.height * alpha,
                  };
                  lastBodyBoxes.set(tf.trackId, smoothed);
                  faceBox = { ...smoothed, confidence: 1 };
                }
              }
            }
          }

          // Stable per-track width for effect-strength scaling. Always derived
          // from the face track (not body override) so the kernel ignores body
          // pose jitter. Grows instantly, decays slowly.
          const observedW = tf.smoothWidth;
          const prevEffW = trackEffectWidths.get(tf.trackId);
          const stableEffectWidth = prevEffW === undefined
            ? observedW
            : Math.max(observedW, prevEffW * EFFECT_W_DECAY);
          trackEffectWidths.set(tf.trackId, stableEffectWidth);

          const trackOpts = { ...resolvedOpts };
          if (resolvedOpts.effect === 'emoji' && trackEmojis.has(tf.trackId)) {
            trackOpts.emojis = [trackEmojis.get(tf.trackId)!];
          }
          applyEffect(processCtx, frameCopy, faceBox, trackOpts, i, cW, cH, useScaleInvariant, stableEffectWidth);
        }
        // GC per-track state for tracks that no longer exist. Without this,
        // ByteTrack's reused IDs (after wraparound) would inherit stale
        // emojis / body boxes / kernel widths from a previous track.
        for (const id of lastBodyBoxes.keys()) {
          if (!aliveTrackIds.has(id)) lastBodyBoxes.delete(id);
        }
        for (const id of trackEffectWidths.keys()) {
          if (!aliveTrackIds.has(id)) trackEffectWidths.delete(id);
        }
        for (const id of trackEmojis.keys()) {
          if (!aliveTrackIds.has(id)) trackEmojis.delete(id);
        }
      }

      const tsUs = Math.round(sample.timestamp * 1_000_000);
      const durUs = Math.round(sample.duration * 1_000_000) || 33_333;
      try {
        const vf = new VideoFrame(processCanvas, { timestamp: tsUs, duration: durUs });
        encoder.encode(vf);
        vf.close();
      } catch (e) { console.error('Frame encode failed:', e); }

      if (encoderError) { console.error('VideoEncoder failed'); throw new Error('VideoEncoder error'); }

      frameIndex++;
      // Periodically drain encoded chunks to avoid OOM on long videos
      if (frameIndex % 300 === 0 && encodedChunks.length > 0) {
        await drainEncodedChunks();
      }
      const progress = videoDuration > 0
        ? 5 + Math.round((sample.timestamp / videoDuration) * 90)
        : 5 + Math.min(90, Math.round(frameIndex / (frameIndex + 30) * 90));
      onProgress?.(Math.min(95, progress));

      if (onEta && frameIndex > 5) {
        const elapsed = (performance.now() - startTime) / 1000;
        const timeProgress = videoDuration > 0 ? sample.timestamp / videoDuration : frameIndex / (frameIndex + 30);
        const rate = timeProgress / elapsed;
        const remainingTotal = 1 - timeProgress;
        onEta(Math.max(0, Math.round(remainingTotal / (rate || 0.001))));
      }
    } finally {
      sample.close();
    }
    sampleResult = await sampleIterator.next();
  }

  // 5. Flush encoder and add to output
  let buffer: ArrayBuffer | null = null;

  try {
    try { await encoder.flush(); } catch { /* ignore */ }
    encoder.close();
    onProgress?.(96);

    // Drain remaining chunks after flush
    await drainEncodedChunks();
    videoSource.close();
    onProgress?.(97);

    // 6. Audio passthrough — wrapped in try/catch so audio errors degrade
    // gracefully (MP4 without audio) instead of triggering the WebM fallback.
    if (audioSource) {
      let audioClosed = false;
      try {
        const decoderConfig = await audioTrack!.getDecoderConfig();
        if (!decoderConfig) {
          console.warn('[anonymizeVideo] No audio decoder config available, skipping audio');
          audioSource.close();
          audioClosed = true;
        } else {
          const audioMetadata: EncodedAudioChunkMetadata = { decoderConfig };
          const audioSink = new EncodedPacketSink(audioTrack!);
          let isFirstPacket = true;
          let skippedPreRoll = 0;
          for await (const packet of audioSink.packets()) {
            if (signal?.aborted) break;
            // AAC and similar codecs emit "priming" packets with negative
            // timestamps that the player should discard. The MP4 muxer
            // rejects them outright — drop them here.
            if (packet.timestamp < 0) {
              skippedPreRoll++;
              continue;
            }
            await audioSource.add(packet, isFirstPacket ? audioMetadata : undefined);
            isFirstPacket = false;
          }
          if (skippedPreRoll > 0) {
            console.log(`[anonymizeVideo] Skipped ${skippedPreRoll} audio pre-roll packet(s)`);
          }
          audioSource.close();
          audioClosed = true;
        }
      } catch (audioErr) {
        console.warn('[anonymizeVideo] Audio passthrough failed, output will have no audio:', audioErr);
        if (!audioClosed) {
          try { audioSource.close(); } catch { /* idempotent close */ }
        }
      }
    }

    // Surface collected metadata BEFORE finalize — if finalize throws (e.g.
    // bad MP4 layout), the user still gets the masks-review UI populated and
    // can re-process with exclusions instead of losing the entire run.
    if (onKeyframeData && keyframeDataList.length > 0) {
      onKeyframeData(keyframeDataList);
    }
    if (onTrackMeta) {
      const entries = Array.from(trackMetaMap.entries());
      entries.sort((a, b) => a[1].firstFrame - b[1].firstFrame);
      // Encode thumbnails as JPEG blob URLs in parallel — async but doesn't
      // block the encoder finalize step. Caller (videoAnonymizeStore) must
      // revoke these URLs on reset/setFile/loadFile.
      const metas = await Promise.all(
        entries.map(
          ([trackId, m]) =>
            new Promise<TrackMeta>((resolve) => {
              m.thumbCanvas.toBlob(
                (blob) => {
                  const thumbnailUrl = blob
                    ? URL.createObjectURL(blob)
                    : '';
                  resolve({
                    trackId,
                    firstFrame: m.firstFrame,
                    lastFrame: m.lastFrame,
                    thumbnailUrl,
                  });
                },
                'image/jpeg',
                0.7,
              );
            }),
        ),
      );
      onTrackMeta(metas);
    }

    onProgress?.(98);
    await output.finalize();
    onProgress?.(99);

    buffer = output.target.buffer;
  } finally {
    // Ensure resources are released even if the pipeline fails mid-processing
    try { encoder.close(); } catch { /* already closed */ }
    try { videoSource.close(); } catch { /* already closed */ }
    try { audioSource?.close(); } catch { /* already closed */ }
  }

  if (!buffer) throw new Error('No output buffer');
  return new Blob([buffer], { type: 'video/mp4' });
}

/** Fallback: seek-based frame extraction + MediaRecorder */
async function anonymizeVideoFallback(
  file: File,
  options: VideoAnonymizeOptions,
): Promise<Blob> {
  const { effectOptions, modelId, quality = 'fast', videoDuration: optDuration, videoFps: optFps, bodyTracking = false, onProgress } = options;
  const resolvedOpts = resolveEffectOptions(effectOptions);
  const useScaleInvariant = true;

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
  });

  const fps = optFps ?? 30;
  const totalFrames = Math.round(video.duration * fps);
  const videoDuration = optDuration ?? video.duration;
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
  // 1-second timeslice — without it MediaRecorder buffers the entire video
  // until stop(), so a 5-minute clip holds ~150 MB+ in memory before flushing.
  recorder.start(1000);

  // When body tracking is enabled, keep tracks alive much longer so the
  // pose-derived face position can take over while the face is occluded.
  const tracker = new FaceTracker({
    maxLost: bodyTracking ? MAX_LOST_FRAMES_WITH_BODY : MAX_LOST_FRAMES_NO_BODY,
  });
  let nextDetectionFrame = 0;
  let dInterval = quality === 'accurate' ? 1 : 30;
  const minInterval = quality === 'accurate' ? 1 : 5;
  const maxInterval = quality === 'accurate' ? 1 : 60;
  const trackEmojis = new Map<number, string>();

  // Body tracking state — same shape as V2.
  let cachedPoses: PoseEstimate[] | null = null;
  const trackBodyMap = new Map<number, number>();
  const lastBodyBoxes = new Map<number, { x: number; y: number; width: number; height: number }>();
  // Per-track stable width for effect strength — see V2 main loop.
  const FB_EFFECT_W_DECAY = 0.99;
  const trackEffectWidths = new Map<number, number>();
  let nextPoseFrame = 0;
  const poseStride = quality === 'accurate' ? 5 : 1;

  function rebuildTrackBodyMap(faces: TrackedFace[], poses: PoseEstimate[] | null) {
    trackBodyMap.clear();
    if (!poses || poses.length === 0) return;

    // 1-to-1 greedy assignment — see V2 main loop comment.
    const pairs: Array<{ f: number; p: number; dist: number }> = [];
    for (let f = 0; f < faces.length; f++) {
      const tf = faces[f];
      const fcx = tf.smoothX + tf.smoothWidth / 2;
      const fcy = tf.smoothY + tf.smoothHeight / 2;
      const radiusMul = tf.framesSinceUpdate > 0 ? 5 : 3;
      const radius = Math.max(tf.smoothWidth, tf.smoothHeight) * radiusMul;
      for (let p = 0; p < poses.length; p++) {
        const nose = poses[p].nose;
        if (nose.score < 0.3) continue;
        if (nose.x <= 0 || nose.y <= 0 || nose.x >= cW || nose.y >= cH) continue;
        const d = Math.sqrt((fcx - nose.x) ** 2 + (fcy - nose.y) ** 2);
        if (d < radius) pairs.push({ f, p, dist: d });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const usedFaces = new Set<number>();
    const usedPoses = new Set<number>();
    for (const { f, p } of pairs) {
      if (usedFaces.has(f) || usedPoses.has(p)) continue;
      usedFaces.add(f);
      usedPoses.add(p);
      trackBodyMap.set(faces[f].trackId, p);
    }
  }

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

  try {
    for (let f = 0; f < totalFrames; f++) {
    let trackedFaces: TrackedFace[] = [];
    if (f >= nextDetectionFrame) {
      await seekToFrame(video, f);
      const frameCanvas = canvasFromVideo(video);

      const runPose = bodyTracking && f >= nextPoseFrame;
      const [detections, posesResult] = await Promise.all([
        detectFaces(frameCanvas, { modelId }),
        runPose ? estimatePoses(frameCanvas).catch(() => null) : Promise.resolve(null),
      ]);

      // See V2: inject synthetic detections from FRESH poses only.
      const posesForInject = runPose ? posesResult : null;
      if (bodyTracking && posesForInject) {
        for (const pose of posesForInject) {
          if (pose.nose.score < 0.3) continue;
          const noseCovered = detections.some(d =>
            pose.nose.x >= d.x && pose.nose.x <= d.x + d.width &&
            pose.nose.y >= d.y && pose.nose.y <= d.y + d.height
          );
          if (noseCovered) continue;
          const synth = faceBoxFromPose(pose, { width: 0, height: 0 }, cW, cH);
          if (!synth) continue;
          detections.push({
            x: synth.x, y: synth.y,
            width: synth.width, height: synth.height,
            confidence: 0.6,
          });
        }
      }

      // See V2: always update() so empty keyframes increment framesSinceUpdate.
      trackedFaces = tracker.update(detections, cW, cH);

      if (runPose) {
        cachedPoses = posesResult;
        nextPoseFrame = f + poseStride;
      }
      if (bodyTracking) rebuildTrackBodyMap(trackedFaces, cachedPoses);

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
      trackedFaces = tracker.predict(cW, cH);
      await seekToFrame(video, f);
    }

    encodeCtx.drawImage(video, 0, 0, cW, cH);

    if (trackedFaces.length > 0) {
      const frameCopy = canvasFromCanvas(encodeCanvas);
      const aliveTrackIds = new Set<number>();
      for (let i = 0; i < trackedFaces.length; i++) {
        const tf = trackedFaces[i];
        aliveTrackIds.add(tf.trackId);

        // Phantom-mask guard — see V2 main loop comment.
        if (bodyTracking && tf.framesSinceUpdate > 1 && !trackBodyMap.has(tf.trackId)) {
          continue;
        }

        let smoothBox: FaceBox = { x: tf.smoothX, y: tf.smoothY, width: tf.smoothWidth, height: tf.smoothHeight, confidence: 1 };

        if (bodyTracking && cachedPoses) {
          const bodyIdx = trackBodyMap.get(tf.trackId);
          if (bodyIdx !== undefined && bodyIdx < cachedPoses.length) {
            const estimated = faceBoxFromPose(
              cachedPoses[bodyIdx],
              { width: tf.smoothWidth, height: tf.smoothHeight },
              cW, cH,
            );
            if (estimated) {
              const trackArea = tf.smoothWidth * tf.smoothHeight;
              const bodyArea = estimated.width * estimated.height;
              const useBody = tf.framesSinceUpdate > 0 || bodyArea > trackArea * 1.5;
              if (useBody) {
                const prev = lastBodyBoxes.get(tf.trackId);
                const alpha = prev ? 0.4 : 1.0;
                const blended = {
                  x: (prev ? prev.x * (1 - alpha) : 0) + estimated.x * alpha,
                  y: (prev ? prev.y * (1 - alpha) : 0) + estimated.y * alpha,
                  width: (prev ? prev.width * (1 - alpha) : 0) + estimated.width * alpha,
                  height: (prev ? prev.height * (1 - alpha) : 0) + estimated.height * alpha,
                };
                lastBodyBoxes.set(tf.trackId, blended);
                smoothBox = { ...blended, confidence: 1 };
              }
            }
          }
        }

        const observedW = tf.smoothWidth;
        const prevEffW = trackEffectWidths.get(tf.trackId);
        const stableEffectWidth = prevEffW === undefined
          ? observedW
          : Math.max(observedW, prevEffW * FB_EFFECT_W_DECAY);
        trackEffectWidths.set(tf.trackId, stableEffectWidth);

        const trackOpts = { ...resolvedOpts };
        if (resolvedOpts.effect === 'emoji' && trackEmojis.has(tf.trackId)) {
          trackOpts.emojis = [trackEmojis.get(tf.trackId)!];
        }
        applyEffect(encodeCtx, frameCopy, smoothBox, trackOpts, i, cW, cH, useScaleInvariant, stableEffectWidth);
      }
      for (const id of lastBodyBoxes.keys()) {
        if (!aliveTrackIds.has(id)) lastBodyBoxes.delete(id);
      }
      for (const id of trackEffectWidths.keys()) {
        if (!aliveTrackIds.has(id)) trackEffectWidths.delete(id);
      }
    }

    if ('requestFrame' in vt) {
      (vt as { requestFrame: () => void }).requestFrame();
    }
    onProgress?.(videoDuration > 0 ? Math.round((video.currentTime / videoDuration) * 95) : Math.round((f / totalFrames) * 95));
  }

  onProgress?.(99);
  return outputBlobPromise;
  } finally {
    try { recorder.stop(); } catch { /* already stopped */ }
    URL.revokeObjectURL(video.src);
    video.remove();
  }
}
