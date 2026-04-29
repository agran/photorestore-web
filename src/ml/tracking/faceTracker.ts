import type { FaceBox } from '@/ml/utils/faceDetect';

export interface TrackedFace extends FaceBox {
  trackId: number;
  /** Smoothed bbox after temporal EMA */
  smoothX: number;
  smoothY: number;
  smoothWidth: number;
  smoothHeight: number;
  /** Kalman velocity */
  dx: number;
  dy: number;
  /** Kalman covariance (higher = less confident) */
  covariance: number;
  /** Frames since last matched detection */
  framesSinceUpdate: number;
}

interface KalmanState {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  /** Error covariance diagonal */
  p: number;
}

/**
 * Compute IoU between two face boxes
 */
function iou(a: FaceBox, b: FaceBox): number {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  if (interX2 <= interX1 || interY2 <= interY1) return 0;

  const interArea = (interX2 - interX1) * (interY2 - interY1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;

  return interArea / (areaA + areaB - interArea);
}

/**
 * Greedy IoU matching. Pairs detections to tracks by highest IoU.
 */
function matchByIoU(
  tracks: KalmanState[],
  detections: FaceBox[],
  iouThreshold: number,
): { matched: Array<{ trackIdx: number; detIdx: number }>; unmatchedTracks: number[]; unmatchedDets: number[] } {
  const matched: Array<{ trackIdx: number; detIdx: number }> = [];
  const usedTracks = new Set<number>();
  const usedDets = new Set<number>();

  // Build all valid pairs
  const pairs: Array<{ t: number; d: number; iou: number }> = [];
  for (let t = 0; t < tracks.length; t++) {
    for (let d = 0; d < detections.length; d++) {
      const trackBox: FaceBox = { x: tracks[t].x, y: tracks[t].y, width: tracks[t].w, height: tracks[t].h, confidence: 0 };
      const iouScore = iou(trackBox, detections[d]);
      if (iouScore >= iouThreshold) {
        pairs.push({ t, d, iou: iouScore });
      }
    }
  }

  // Sort by IoU descending
  pairs.sort((a, b) => b.iou - a.iou);

  for (const { t, d } of pairs) {
    if (usedTracks.has(t) || usedDets.has(d)) continue;
    matched.push({ trackIdx: t, detIdx: d });
    usedTracks.add(t);
    usedDets.add(d);
  }

  const unmatchedTracks: number[] = [];
  const unmatchedDets: number[] = [];

  for (let t = 0; t < tracks.length; t++) {
    if (!usedTracks.has(t)) unmatchedTracks.push(t);
  }
  for (let d = 0; d < detections.length; d++) {
    if (!usedDets.has(d)) unmatchedDets.push(d);
  }

  return { matched, unmatchedTracks, unmatchedDets };
}

// Kalman filter constants
const PROCESS_NOISE = 0.01; // how much we trust motion model (lower = smoother)
const MEASUREMENT_NOISE = 0.1; // how much we trust detections (lower = snappier)

function kalmanPredict(state: KalmanState): KalmanState {
  // Update covariance
  const pNew = state.p + PROCESS_NOISE * 0.1;
  return {
    x: state.x + state.dx,
    y: state.y + state.dy,
    w: state.w,
    h: state.h,
    dx: state.dx,
    dy: state.dy,
    p: pNew,
  };
}

function kalmanUpdate(state: KalmanState, detection: FaceBox): KalmanState {
  const k = state.p / (state.p + MEASUREMENT_NOISE);
  const newX = state.x + k * (detection.x - state.x);
  const newY = state.y + k * (detection.y - state.y);
  const newW = state.w + k * (detection.width - state.w);
  const newH = state.h + k * (detection.height - state.h);
  const newDx = newX - state.x;
  const newDy = newY - state.y;
  const newP = (1 - k) * state.p;

  return {
    x: newX,
    y: newY,
    w: newW,
    h: newH,
    dx: newDx,
    dy: newDy,
    p: Math.max(newP, 0.001),
  };
}

/**
 * ByteTrack face tracker — two-stage association, Kalman prediction.
 *
 * Tracks faces across video frames:
 * 1. Predict all tracks forward (Kalman)
 * 2. Match high-confidence detections to tracks (IoU)
 * 3. Match remaining low-confidence detections to remaining tracks
 * 4. Create new tracks for unmatched high-confidence detections
 * 5. Delete lost tracks after TTL
 */
export class FaceTracker {
  private tracks: KalmanState[] = [];
  private trackIds: number[] = [];
  private nextId = 1;
  private lostCounts: number[] = [];
  private maxLost = 10; // frames before track deletion
  private iouHigh = 0.4; // IoU threshold for high-confidence
  private iouLow = 0.2; // IoU threshold for low-confidence
  
  /** EMA smoothing factor (0 = no smoothing, 1 = frozen) */
  private ema = 0.5;
  /** Smoothed bbox history per track */
  private smoothBoxes: Array<{ x: number; y: number; w: number; h: number } | null> = [];

  /**
   * Update tracker with new detections.
   * @param detections — all face boxes from current frame
   * @param confThreshold — threshold for high-confidence detections
   * @param frameW — canvas width (for clamping)
   * @param frameH — canvas height
   * @returns smoothed face boxes with track IDs
   */
  update(detections: FaceBox[], _confThreshold = 0.5, frameW = 1, frameH = 1): TrackedFace[] {
    // Split detections into high and low confidence
    const highDets = detections.filter((d) => d.confidence >= 0.5);
    const lowDets = detections.filter((d) => d.confidence < 0.5 && d.confidence >= 0.2);

    // Predict all tracks forward
    const predicted = this.tracks.map((t) => kalmanPredict(t));

    // Stage 1: Match high-confidence detections
    const stage1 = matchByIoU(predicted, highDets, this.iouHigh);

    // Update matched tracks
    const updated = [...predicted];
    const matchedTrackIndices = new Set<number>();

    for (const { trackIdx, detIdx } of stage1.matched) {
      updated[trackIdx] = kalmanUpdate(predicted[trackIdx], highDets[detIdx]);
      matchedTrackIndices.add(trackIdx);
      this.lostCounts[trackIdx] = 0;
    }

    // Stage 2: Match low-confidence detections to remaining tracks
    const unmatchedTrackIndices = stage1.unmatchedTracks.filter((t) => !matchedTrackIndices.has(t));
    const stage2 = matchByIoU(
      unmatchedTrackIndices.map((t) => updated[t]),
      lowDets,
      this.iouLow,
    );

    for (const { trackIdx: localIdx, detIdx } of stage2.matched) {
      const globalIdx = unmatchedTrackIndices[localIdx];
      updated[globalIdx] = kalmanUpdate(updated[globalIdx], lowDets[detIdx]);
      this.lostCounts[globalIdx] = 0;
    }

    // Increment lost counters for unmatched tracks
    const allMatched = new Set<number>();
    for (const { trackIdx } of stage1.matched) allMatched.add(trackIdx);
    for (const { trackIdx: localIdx } of stage2.matched) allMatched.add(unmatchedTrackIndices[localIdx]);

    for (let i = 0; i < this.tracks.length; i++) {
      if (!allMatched.has(i)) {
        this.lostCounts[i] = (this.lostCounts[i] || 0) + 1;
      }
    }

    // Create new tracks for unmatched high-confidence detections
    const unmatchedHighDetIndices = new Set(stage1.unmatchedDets);
    for (const detIdx of unmatchedHighDetIndices) {
      const d = highDets[detIdx];
      const state: KalmanState = {
        x: d.x,
        y: d.y,
        w: d.width,
        h: d.height,
        dx: 0,
        dy: 0,
        p: 0.1,
      };
      updated.push(state);
      this.trackIds.push(this.nextId++);
      this.lostCounts.push(0);
      this.smoothBoxes.push(null);
    }

    // Delete tracks that exceed maxLost
    const keepMask = this.lostCounts.map((c) => c <= this.maxLost);
    this.tracks = updated.filter((_, i) => keepMask[i]);
    this.trackIds = this.trackIds.filter((_, i) => keepMask[i]);
    this.lostCounts = this.lostCounts.filter((_, i) => keepMask[i]);
    this.smoothBoxes = this.smoothBoxes.filter((_, i) => keepMask[i]);

    // Apply EMA smoothing to bbox corners and clamp to frame
    const results: TrackedFace[] = [];
    const currentTracks = keepMask.map((k, i) => (k ? updated[i] : null)).filter((t): t is KalmanState => t !== null);
    const currentIds = this.trackIds;

    for (let i = 0; i < currentTracks.length; i++) {
      const t = currentTracks[i];
      const raw = { x: t.x, y: t.y, w: t.w, h: t.h };

      // EMA smoothing
      let smooth: { x: number; y: number; w: number; h: number };
      if (this.smoothBoxes[i]) {
        smooth = {
          x: this.smoothBoxes[i]!.x * (1 - this.ema) + raw.x * this.ema,
          y: this.smoothBoxes[i]!.y * (1 - this.ema) + raw.y * this.ema,
          w: this.smoothBoxes[i]!.w * (1 - this.ema) + raw.w * this.ema,
          h: this.smoothBoxes[i]!.h * (1 - this.ema) + raw.h * this.ema,
        };
      } else {
        smooth = raw;
      }

      // Clamp to frame
      smooth.x = Math.max(0, Math.min(smooth.x, frameW - 1));
      smooth.y = Math.max(0, Math.min(smooth.y, frameH - 1));
      smooth.w = Math.max(8, Math.min(smooth.w, frameW - smooth.x));
      smooth.h = Math.max(8, Math.min(smooth.h, frameH - smooth.y));

      this.smoothBoxes[i] = smooth;

      results.push({
        trackId: currentIds[i],
        x: t.x,
        y: t.y,
        width: t.w,
        height: t.h,
        confidence: 0,
        smoothX: smooth.x,
        smoothY: smooth.y,
        smoothWidth: smooth.w,
        smoothHeight: smooth.h,
        dx: t.dx,
        dy: t.dy,
        covariance: t.p,
        framesSinceUpdate: this.lostCounts[i] || 0,
      });
    }

    return results;
  }

  /** Reset tracker (new video) */
  reset(): void {
    this.tracks = [];
    this.trackIds = [];
    this.lostCounts = [];
    this.smoothBoxes = [];
    this.nextId = 1;
  }

  /** Check if all tracks are confident (low covariance) */
  isConfident(): boolean {
    return this.tracks.every((t) => t.p < 0.05) && this.tracks.length > 0;
  }
}
