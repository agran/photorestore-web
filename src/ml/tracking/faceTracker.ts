import type { FaceBox } from '@/ml/utils/faceDetect';

export interface TrackedFace extends FaceBox {
  trackId: number;
  smoothX: number;
  smoothY: number;
  smoothWidth: number;
  smoothHeight: number;
  dx: number;
  dy: number;
  covariance: number;
  framesSinceUpdate: number;
}

interface KalmanState {
  x: number; y: number; w: number; h: number;
  dx: number; dy: number; dw: number; dh: number;
  p: number;
}

function iou(a: FaceBox, b: FaceBox): number {
  const ax1 = a.x; const ay1 = a.y; const ax2 = a.x + a.width; const ay2 = a.y + a.height;
  const bx1 = b.x; const by1 = b.y; const bx2 = b.x + b.width; const by2 = b.y + b.height;
  const interX1 = Math.max(ax1, bx1); const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2); const interY2 = Math.min(ay2, by2);
  if (interX2 <= interX1 || interY2 <= interY1) return 0;
  const interArea = (interX2 - interX1) * (interY2 - interY1);
  const areaA = a.width * a.height; const areaB = b.width * b.height;
  return interArea / (areaA + areaB - interArea);
}

function matchingCost(a: FaceBox, b: FaceBox): number {
  const iouVal = iou(a, b);
  if (iouVal > 0.01) return 1 - iouVal;
  const aCx = a.x + a.width / 2; const aCy = a.y + a.height / 2;
  const bCx = b.x + b.width / 2; const bCy = b.y + b.height / 2;
  const dist = Math.sqrt((aCx - bCx) ** 2 + (aCy - bCy) ** 2);
  const diag = Math.sqrt(Math.max(a.width, b.width) ** 2 + Math.max(a.height, b.height) ** 2);
  return 1 + dist / diag;
}

function matchByCost(
  tracks: KalmanState[],
  detections: FaceBox[],
  maxCost: number,
): { matched: Array<{ trackIdx: number; detIdx: number }>; unmatchedTracks: number[]; unmatchedDets: number[] } {
  const matched: Array<{ trackIdx: number; detIdx: number }> = [];
  const usedTracks = new Set<number>();
  const usedDets = new Set<number>();
  const pairs: Array<{ t: number; d: number; cost: number }> = [];
  for (let t = 0; t < tracks.length; t++) {
    for (let d = 0; d < detections.length; d++) {
      const trackBox: FaceBox = { x: tracks[t].x, y: tracks[t].y, width: tracks[t].w, height: tracks[t].h, confidence: 0 };
      const cost = matchingCost(trackBox, detections[d]);
      if (cost <= maxCost) pairs.push({ t, d, cost });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  for (const { t, d } of pairs) {
    if (usedTracks.has(t) || usedDets.has(d)) continue;
    matched.push({ trackIdx: t, detIdx: d });
    usedTracks.add(t); usedDets.add(d);
  }
  const unmatchedTracks: number[] = [];
  const unmatchedDets: number[] = [];
  for (let t = 0; t < tracks.length; t++) if (!usedTracks.has(t)) unmatchedTracks.push(t);
  for (let d = 0; d < detections.length; d++) if (!usedDets.has(d)) unmatchedDets.push(d);
  return { matched, unmatchedTracks, unmatchedDets };
}

const PROCESS_NOISE_POS = 0.02; // position noise per frame²
const MEASUREMENT_NOISE = 0.1;
const VEL_DECAY_LOST = 0.97; // velocity decay when truly lost
const ALPHA_VEL = 0.7; // EMA for velocity (higher = snappier)

function kalmanPredict(state: KalmanState, dt = 1, isLost = false): KalmanState {
  const decay = isLost ? VEL_DECAY_LOST ** dt : 1.0;
  const dxNew = state.dx * decay;
  const dyNew = state.dy * decay;
  const dwNew = state.dw * (isLost ? VEL_DECAY_LOST ** dt : 1.0);
  const dhNew = state.dh * (isLost ? VEL_DECAY_LOST ** dt : 1.0);
  return {
    x: state.x + dxNew * dt,
    y: state.y + dyNew * dt,
    w: Math.max(8, state.w + dwNew * dt),
    h: Math.max(8, state.h + dhNew * dt),
    dx: dxNew, dy: dyNew, dw: dwNew, dh: dhNew,
    p: state.p + (PROCESS_NOISE_POS + (isLost ? 0.01 : 0)) * dt * dt,
  };
}

function kalmanUpdate(state: KalmanState, detection: FaceBox, dt = 1): KalmanState {
  const k = state.p / (state.p + MEASUREMENT_NOISE);
  const newX = state.x + k * (detection.x - state.x);
  const newY = state.y + k * (detection.y - state.y);
  const newW = state.w + k * (detection.width - state.w);
  const newH = state.h + k * (detection.height - state.h);

  const prevX = state.x - state.dx * dt;
  const prevY = state.y - state.dy * dt;
  const prevW = state.w - state.dw * dt;
  const prevH = state.h - state.dh * dt;
  const instDx = (newX - prevX) / dt;
  const instDy = (newY - prevY) / dt;
  const instDw = (newW - prevW) / dt;
  const instDh = (newH - prevH) / dt;

  const newDx = state.dx * (1 - ALPHA_VEL) + instDx * ALPHA_VEL;
  const newDy = state.dy * (1 - ALPHA_VEL) + instDy * ALPHA_VEL;
  const newDw = state.dw * (1 - ALPHA_VEL) + instDw * ALPHA_VEL;
  const newDh = state.dh * (1 - ALPHA_VEL) + instDh * ALPHA_VEL;

  return {
    x: newX, y: newY, w: newW, h: newH,
    dx: newDx, dy: newDy, dw: newDw, dh: newDh,
    p: Math.max((1 - k) * state.p, 0.001),
  };
}

export class FaceTracker {
  private tracks: KalmanState[] = [];
  private trackIds: number[] = [];
  private nextId = 1;
  private lostCounts: number[] = [];
  private maxLost = 40;
  private costHigh = 0.65;
  private costLow = 1.5;

  private emaUpdate = 0.55;
  private emaPredict = 0.75;
  private smoothBoxes: Array<{ x: number; y: number; w: number; h: number } | null> = [];

  update(detections: FaceBox[], _confThreshold = 0.5, frameW = 1, frameH = 1): TrackedFace[] {
    const highDets = detections.filter((d) => d.confidence >= 0.5);
    const lowDets = detections.filter((d) => d.confidence < 0.5 && d.confidence >= 0.2);

    // Predict all tracks forward (not lost yet — isLost=false)
    const predicted = this.tracks.map((t) => kalmanPredict(t, 1, false));

    // Stage 1: high-confidence at strict cost
    const stage1 = matchByCost(predicted, highDets, this.costHigh);
    const updated = [...predicted];
    const matchedSet = new Set<number>();

    for (const { trackIdx, detIdx } of stage1.matched) {
      updated[trackIdx] = kalmanUpdate(predicted[trackIdx], highDets[detIdx]);
      matchedSet.add(trackIdx);
      this.lostCounts[trackIdx] = 0;
    }

    // Stage 1.5: rescue with adaptive cost (wider window for longer-lost tracks)
    let usedHighDets = new Set<number>();
    const unmatchedTrackIndices = stage1.unmatchedTracks.filter((t) => !matchedSet.has(t));
    const unmatchedHighDetIndices = stage1.unmatchedDets;

    if (unmatchedTrackIndices.length > 0 && unmatchedHighDetIndices.length > 0) {
      for (const detRelIdx of unmatchedHighDetIndices) {
        const det = highDets[detRelIdx];
        let bestCost = Infinity;
        let bestTrackIdx = -1;

        for (const tIdx of unmatchedTrackIndices) {
          if (matchedSet.has(tIdx) || usedHighDets.has(detRelIdx)) continue;
          const trackBox: FaceBox = { x: updated[tIdx].x, y: updated[tIdx].y, width: updated[tIdx].w, height: updated[tIdx].h, confidence: 0 };
          const cost = matchingCost(trackBox, det);
          const lostFrames = this.lostCounts[tIdx] || 0;
          // Adaptive threshold: wider window for longer-lost tracks
          const adaptiveMax = 1.1 + Math.min(1.0, lostFrames * 0.06);
          if (cost < bestCost && cost <= adaptiveMax) {
            bestCost = cost;
            bestTrackIdx = tIdx;
          }
        }

        if (bestTrackIdx >= 0) {
          updated[bestTrackIdx] = kalmanUpdate(updated[bestTrackIdx], det);
          matchedSet.add(bestTrackIdx);
          this.lostCounts[bestTrackIdx] = 0;
          usedHighDets = new Set([...usedHighDets, detRelIdx]);
        }
      }
    }

    // Stage 2: low-conf dets to remaining tracks
    const unmatchedTrackIndicesAll = unmatchedTrackIndices.filter((t) => !matchedSet.has(t));
    if (unmatchedTrackIndicesAll.length > 0 && lowDets.length > 0) {
      const remainingTracks = unmatchedTrackIndicesAll.map((t) => updated[t]);
      const stage2 = matchByCost(remainingTracks, lowDets, this.costLow);
      for (const { trackIdx: localIdx, detIdx } of stage2.matched) {
        const globalIdx = unmatchedTrackIndicesAll[localIdx];
        updated[globalIdx] = kalmanUpdate(updated[globalIdx], lowDets[detIdx]);
        matchedSet.add(globalIdx);
        this.lostCounts[globalIdx] = 0;
      }
    }

    // Increment lost counters for unmatched tracks
    for (let i = 0; i < this.tracks.length; i++) {
      if (!matchedSet.has(i)) {
        this.lostCounts[i] = (this.lostCounts[i] || 0) + 1;
      }
    }

    // Create new tracks from truly unmatched high-conf detections
    const remainingHighDets = unmatchedHighDetIndices.filter((_, idx) => !usedHighDets.has(idx));
    for (const detIdx of remainingHighDets) {
      const d = highDets[detIdx];

      // Try to re-associate with a recently-lost nearby track instead of creating new ID
      let reusedId = -1;
      let bestReuseCost = Infinity;
      for (let i = 0; i < this.tracks.length; i++) {
        if (matchedSet.has(i)) continue;
        if ((this.lostCounts[i] || 0) > 5) continue; // only recently lost
        const trackBox: FaceBox = { x: updated[i].x, y: updated[i].y, width: updated[i].w, height: updated[i].h, confidence: 0 };
        const cost = matchingCost(trackBox, d);
        if (cost < 2.5 && cost < bestReuseCost) {
          bestReuseCost = cost;
          reusedId = i;
        }
      }

      if (reusedId >= 0) {
        // Reuse old track: update position, keep velocity from it
        const oldTrack = updated[reusedId];
        updated[reusedId] = {
          x: d.x, y: d.y, w: d.width, h: d.height,
          dx: oldTrack.dx, dy: oldTrack.dy, dw: oldTrack.dw || 0, dh: oldTrack.dh || 0,
          p: 0.03, // confident re-association
        };
        matchedSet.add(reusedId);
        this.lostCounts[reusedId] = 0;
      } else {
        updated.push({ x: d.x, y: d.y, w: d.width, h: d.height, dx: 0, dy: 0, dw: 0, dh: 0, p: 0.1 });
        this.trackIds.push(this.nextId++);
        this.lostCounts.push(0);
        this.smoothBoxes.push({ x: d.x, y: d.y, w: d.width, h: d.height });
      }
    }

    // Delete tracks exceeding maxLost
    const keepMask = this.lostCounts.map((c) => c <= this.maxLost);
    this.tracks = updated.filter((_, i) => keepMask[i]);
    this.trackIds = this.trackIds.filter((_, i) => keepMask[i]);
    this.lostCounts = this.lostCounts.filter((_, i) => keepMask[i]);
    this.smoothBoxes = this.smoothBoxes.filter((_, i) => keepMask[i]);

    return this.buildResults(keepMask, updated, frameW, frameH, this.emaUpdate);
  }

  predictEmptyKeyframe(frameW = 1, frameH = 1): TrackedFace[] {
    return this.predict(frameW, frameH);
  }

  predict(frameW = 1, frameH = 1): TrackedFace[] {
    // Predict with lost status if track hasn't been updated recently
    this.tracks = this.tracks.map((t, i) => {
      const isLost = (this.lostCounts[i] || 0) > 0;
      return kalmanPredict(t, 1, isLost);
    });
    return this.buildResults(this.tracks.map(() => true), this.tracks, frameW, frameH, this.emaPredict);
  }

  private buildResults(
    keepMask: boolean[],
    states: KalmanState[],
    frameW: number,
    frameH: number,
    ema: number,
  ): TrackedFace[] {
    const results: TrackedFace[] = [];
    const currentTracks = keepMask.map((k, i) => (k ? states[i] : null)).filter((t): t is KalmanState => t !== null);

    for (let i = 0; i < currentTracks.length; i++) {
      const t = currentTracks[i];
      const raw = { x: t.x, y: t.y, w: t.w, h: t.h };

      let smooth: { x: number; y: number; w: number; h: number };
      if (this.smoothBoxes[i]) {
        smooth = {
          x: this.smoothBoxes[i]!.x * (1 - ema) + raw.x * ema,
          y: this.smoothBoxes[i]!.y * (1 - ema) + raw.y * ema,
          w: this.smoothBoxes[i]!.w * (1 - ema) + raw.w * ema,
          h: this.smoothBoxes[i]!.h * (1 - ema) + raw.h * ema,
        };
      } else {
        smooth = raw;
      }

      smooth.x = Math.max(0, Math.min(smooth.x, frameW - 1));
      smooth.y = Math.max(0, Math.min(smooth.y, frameH - 1));
      smooth.w = Math.max(8, Math.min(smooth.w, frameW - smooth.x));
      smooth.h = Math.max(8, Math.min(smooth.h, frameH - smooth.y));
      this.smoothBoxes[i] = smooth;

      results.push({
        trackId: this.trackIds[i],
        x: t.x, y: t.y, width: t.w, height: t.h,
        confidence: 0,
        smoothX: smooth.x, smoothY: smooth.y,
        smoothWidth: smooth.w, smoothHeight: smooth.h,
        dx: t.dx, dy: t.dy,
        covariance: t.p,
        framesSinceUpdate: this.lostCounts[i] || 0,
      });
    }
    return results;
  }

  reset(): void {
    this.tracks = [];
    this.trackIds = [];
    this.lostCounts = [];
    this.smoothBoxes = [];
    this.nextId = 1;
  }

  isConfident(): boolean {
    return this.tracks.every((t) => t.p < 0.05) && this.tracks.length > 0;
  }
}
