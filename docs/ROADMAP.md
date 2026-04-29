# Roadmap

> 🇷🇺 [Русская версия](./ROADMAP.ru.md)

## MVP (current)

- [x] Project scaffold (Vite + React + TypeScript + Tailwind)
- [x] i18n (EN + RU)
- [x] Dropzone with drag&drop and preview (including HEIC→JPEG auto-conversion via `heic-to` for iOS/Android uploads)
- [x] ImageCompare before/after slider
- [x] Tool panel UI
- [x] History panel
- [x] ML infrastructure (ORT runtime, model registry, model loader)
- [x] Tiling utilities with cosine-window blending
- [x] Tensor conversion utilities
- [x] Pipeline stubs (upscale, faceRestore, inpaint, denoise)
- [x] Unit tests (tiling, tensor)
- [x] GitHub Actions CI + GitHub Pages deploy

## v0.2 — Real Upscaling ✅

- [x] Real-ESRGAN x4plus (128×128 tile, 67 MB, bukuroo) — WebGPU
- [x] NMKD Superscale (128×128 tile, 64→67 MB, RRDBNet, converted pth→ONNX) — WebGPU (was WASM, migrated on ORT 1.25.1)
- [x] 4xNomos8kSC (128×128 tile, 64→67 MB, nesaorg ONNX) — WebGPU (was WASM)
- [x] 4xLSDIR-DAT (256×256 tile, 62→64 MB, DAT backbone, nesaorg ONNX) — WebGPU (was WASM)
- [x] Real-CUGAN Up×4 + Real-CUGAN Up×4 Denoise (2 MB each) — WebGPU
- [x] ONNX Runtime Web upgraded to 1.25.1 stable (from 1.26.0-dev)
- [x] ESRGAN models fp16 conversion (keep_io_types=True) — sidesteps broken NHWC Conv kernel codegen in ORT 1.25.x
- [x] NCHW layout via `preferredLayout: 'NCHW'` + `graphOptimizationLevel: 'basic'` for ESRGAN-style models
- [x] Scripts `scripts/convert_fp16.py` and `scripts/patch_scrfd_ceil.py` for model preparation
- [x] CDN-based model loading (`erudit23.ru/models/`) for production
- [x] Constant → Initializer graph optimization (ORT WebGPU requirement)
- [x] `forceWasm` flag for models incompatible with WebGPU JSEP (removed from all models in 1.25.1)
- [x] Speed classes (`speedClass`: fast/medium/slow/very-slow) with icons ⚡⚡⚡/⚡⚡/⚡/🐢 based on benchmarks
- [x] Inference worker (ORT session + tensor inference via Comlink)
- [x] Tiling with model-input padding (pad → infer → crop → cosine-window blend)
- [x] Model download progress + per-tile inference progress in ProgressBar
- [x] WebGPU/WASM backend auto-detection with 3s timeout
- [x] Console logging: model name, input size, backend
- [x] Model selector in ToolPanel (dropdown with speed icons)
- [x] Default upscale model: nomos8ksc (was realesrgan-x4plus), always from originalImageUrl
- [x] Benchmark tool `window.bench` in dev mode: upscale and face-detect models
- [x] BrowserRouter basename for GitHub Pages routing
- [x] Vite `base` config for GitHub Pages asset paths
- [x] GitHub Actions CI + GitHub Pages deploy (source: Actions, not branch)

## v0.7 — Video Face Anonymization

> Extends the v0.6 Hide Faces pipeline to video. Same 4 effects,
> same 4 detectors, but applied frame-by-frame with face tracking
> and re-encoding into an MP4 file.

### Architecture

```
MP4/WebM → mediabunny demux → VideoSampleSink (decoded frames)
  → Canvas API → Face detection (keyframes) → ByteTrack → Effect → Canvas
  → VideoFrame → WebCodecs VideoEncoder (H.264) → EncodedVideoPacketSource
  → mediabunny Output (MP4) + EncodedAudioPacketSource (audio passthrough)
```

| Layer | Module | Purpose |
|-------|--------|---------|
| Demux | `mediabunny Input` | Split MP4/WebM into video + audio tracks |
| Decode | `mediabunny VideoSampleSink` | Decoded `VideoSample` stream via WebCodecs |
| Detect | reuse `anonymize.ts` ↔ `detectFaces()` | SCRFD-500M/10G face detection on keyframes (640×640 tiled) |
| Pose | `poseEstimate.ts` (YOLOv8-pose) | 17 COCO keypoints for body tracking — estimate face when occluded (optional, v0.7.3) |
| Track | `faceTracker.ts` | ByteTrack (three-stage IoU matching) + Kalman (8 states + anchors). Configurable `maxLost` |
| Re-ID | `faceReid.ts` (ArcFace ONNX) | Re-identify faces after long occlusions (v0.7.4, optional) |
| Effect | reuse `anonymizeEffects.ts` (canvas) | Blur / Pixelate / Solid / Emoji per-face per-frame, drawn to canvas |
| Encode | `WebCodecs VideoEncoder` | H.264 (`avc1.420028`), VP9 fallback. `isConfigSupported()` detect |
| Mux | `mediabunny` (`Mp4OutputFormat` + `BufferTarget`) | Combine encoded video + audio passthrough → MP4 |
| Audio | `mediabunny EncodedAudioPacketSource` | Remux original audio without re-encode |
| State | `videoAnonymizeStore.ts` | File, effects, quality, body tracking toggle, progress, ETA, output blob |
| Inference | `inferenceClient.ts` (shared worker singleton) | Centralized ORT session management, FIFO serialization for WebGPU run safety |

**Pipeline runs on the main thread** (not a WebWorker). Canvas API + WebCodecs `VideoFrame` constructor in the hot loop. Mediabunny handles demux/mux.

### Quality Modes

| Mode | Detection interval | Pose interval | Speed | Face gaps |
|------|-------------------|---------------|-------|-----------|
| **Fast** (default) | adaptive 5–60 frames | every face-keyframe | 3–10× realtime | ≤2s uncovered on new faces |
| **Accurate** | every frame (1) | every 5 face-keyframes | 1–3× realtime | none |

Both modes support **Body tracking** — runs YOLOv8-pose alongside face detection on keyframes (throttled to every 5 face-keyframes in Accurate mode to avoid 30-FPS inference on an 82 MB model).

### Why not `<video>` + Canvas for decode

- `<video>.currentTime` is async, imprecise (snaps to nearest keyframe), drops frames on long videos
- `requestVideoFrameCallback` can't decode faster than real-time — 30s video takes ≥30s
- `drawImage(video) → getImageData()` forces GPU→CPU readback, massive bottleneck
- **Fix:** mediabunny `VideoSampleSink` — WebCodecs decoding, frame-accurate, faster than real-time

### Encoding Strategy

| Method | Pros | Cons |
|--------|------|------|
| **WebCodecs H.264** | GPU-accelerated, universal (Chrome/Edge/Safari) | Firefox limited support |
| **WebCodecs VP9** | Open codec, good compression | Not everywhere for encode |
| **MediaRecorder** | Cross-browser fallback | WebM only, no audio, slower |

- **Primary:** H.264 via WebCodecs → MP4 (Chrome, Edge, Safari 17+)
- **Fallback:** MediaRecorder VP9 → WebM (no audio passthrough)
- **Detection:** `VideoEncoder.isConfigSupported({ codec: 'avc1.420028' })` — not browser sniffing

### Face Tracking — ByteTrack (v0.7.1)

- **ByteTrack**: three-stage association — Stage 1 (high-conf × strict cost 0.65), Stage 1.5 (unmatched high-conf rescue with per-track adaptive threshold `1.1 + lostFrames×0.06`), Stage 2 (low-conf × wide window 1.5). ~300 lines, no ML.
- **Keyframe interval**: adaptive — 15→60 frames when tracks confident, 5→30 frames when any track shaky. Accurate mode pins to 1.
- **Kalman filter**: 8 states (x, y, w, h, dx, dy, dw, dh) + anchor positions (ax, ay, aw, ah, dt) for precise per-frame velocity. dw/dh predict size change between keyframes.
- **Velocity**: computed as `(newPos − anchor) / elapsed` — where anchor = position at last `kalmanUpdate`, elapsed = frames since then. Eliminates error accumulation from dt·detectionInterval.
- **Re-association**: new track creation checks nearby recently-lost tracks (lost≤5, cost<2.5) — reuses old ID preserving velocity vector, resets smoothBoxes to prevent jump.
- **Cost function**: 1−IoU for overlapping boxes, 1+centerDist/diag for disjoint ones.
- **Velocity decay**: only on truly lost tracks (lostCount>0), not during normal predict frames. When lost: VEL_DECAY_POS=0.7, VEL_DECAY_SIZE=0.7 per frame (~3.3× total drift cap). Aggressive decay prevents predicted boxes from "flying" into empty space during camera pans
- **EMA smoothing**: α=0.55 on update, α=1.0 on predict (no lag, Kalman already smoothed via velocity EMA).
- **maxLost**: default 40 frames (~1.3s at 30fps). Extended to 300 (~10s) when body tracking is enabled — pose-derived face position keeps the mask on during occlusion.

### Body Tracking — YOLOv8-pose (v0.7.3)

Replaces the planned ArcFace re-ID approach with a pragmatic body-pose fallback:

- **Model:** YOLOv8-pose (`yolo26m-pose.onnx`, 82 MB, AGPL-3.0) — 17 COCO keypoints (nose, eyes, shoulders, elbows, wrists, hips, knees, ankles)
- **Input:** 576×704 letterbox, RGB normalized to [0,1], NCHW tensor
- **Output:** `[1, 56, 8400]` — end2end decoded (cx,cy,w,h,conf + 17×3 keypoints in input pixel space). NMS with IoU=0.5
- **When it runs:** on face-detection keyframes, parallel to `detectFaces()` via `Promise.all()`. Throttled in Accurate mode (every 5 face-keyframes — bodies don't move frame-to-frame)
- **Face-to-body assignment:** greedy 1-to-1 min-distance matching per keyframe — prevents two close-standing people from both attaching to the same body
- **Synthetic detection injection:** fresh poses seed new FaceBox detections for bodies whose nose isn't covered by any real face detection. Partially-visible faces (edge of frame, occlusion) get masked immediately — no waiting for the next detection keyframe
- **Lost face override:** when `framesSinceUpdate > 0`, `faceBoxFromPose()` estimates face position from nose/eyes and overrides the Kalman-predicted box
- **Weak detection override:** also triggers when body-estimated face area exceeds tracker area by 1.5× — catches the case where the detector "shrinks" on a rotated face but keeps matching
- **Phantom mask suppression:** tracks with `framesSinceUpdate > 1` AND no body pose backing are skipped — prevents Kalman-extrapolated masks from "flying" through empty space when the camera pans away from the original subject
- **EMA smoothing:** body-derived face box is EMA-smoothed across frames (α=0.4) to eliminate pose-keypoint jitter
- **Stable effect width:** per-track EMA of observed face width — grows instantly, decays at 0.99/frame (~70-frame half-life). Prevents pixelate/blur kernel from shrinking when the detector reports a smaller box during head rotation
- **`faceBoxFromPose` size cascade:** eye distance × 3.0 → ear distance × 1.6 → shoulder width / 3.0 → single-eye-to-nose × 6 → single-ear-to-nose × 2 → shoulder-to-nose / 1.6 → body bbox / 3.5 → fallback. Single-side fallbacks handle partial/edge views where only one side of the body is visible

### Scale-Invariant Effects

- **Effect strength scaling:** clamped-linear `scaleFactor = max(1, faceWidth / 100)` — constant block count per face ≥100px. Small faces keep slider value (factor ≥1).
- **Per-track stable width:** EMA with instant-grow / slow-decay — kernel doesn't jitter when the detector bbox fluctuates due to head rotation
- **Padding & feather:** linearly scaled with face width (`pad = userValue × faceWidth/100`)
- **Emoji font size:** `faceWidth × 0.6` — adapts to face size per frame

### Audio Passthrough (v0.7.2)

- **Demux:** `mediabunny` splits MP4/WebM into video + audio tracks
- **Remux:** `mediabunny` `EncodedAudioPacketSource` — audio passthrough without re-encode
- **Pre-roll handling:** negative-timestamp "priming" packets (AAC encoder delay) are detected and skipped — the MP4 muxer rejects them
- **Graceful degradation:** audio passthrough is wrapped in try/catch — if it fails, output is video-only with a console warning, instead of crashing the entire V2 pipeline
- **Metadata:** first packet carries `{ decoderConfig }` from `audioTrack.getDecoderConfig()`. Null decoder config is handled with `console.warn` + skip
- **No audio track?** Skip entirely, output video-only

### Progress & ETA

- **Timestamp-based:** progress = `sample.timestamp / videoDuration` — accurate regardless of variable FPS or encoder backpressure
- **Incremental post-processing updates:** encoder.flush (96%), video passthrough (97%), audio passthrough (98%), finalize (99%)
- **Fallback offset:** if V2 fails, fallback progress continues from V2's last value (no reset to 0%)
- **ETA:** `remainingDuration / progressRate` — based on temporal progress, not frame count

### Memory & Backpressure (implemented)

- **`VideoSample.close()`** in try/finally — no GPU memory leaks
- **Streaming pipeline:** decode → track → effect → encode — one frame in flight, EncodedVideoChunks buffered for muxing
- **Encoder flush:** `encoder.flush()` before finalize collects remaining encoded chunks
- **Cancel:** `AbortController` + `signal.aborted` checks in all loops
- **Body tracking GC:** `lastBodyBoxes` and `trackEffectWidths` maps cleaned up when tracks retire

### UI Flow

1. Drop video on Home page → navigate to Editor with wizard open (or drop on Editor directly)
2. Configure effects (reuse AnonymizeWizard effect panel) + quality + body tracking toggle
3. "Process" → progress bar with percentage, ETA, cancel button
4. "Download" → output MP4 (or WebM for fallback). Extension matched to actual format
5. "Back to settings" — adjust params and re-process without re-uploading the video

### Inference Worker Infrastructure

- **Centralized singleton:** `inferenceClient.ts` — one shared worker for face detection + pose estimation. Replaces per-pipeline worker management.
- **WebGPU run serialization:** FIFO queue in `inference.worker.ts` — prevents "Session mismatch" errors when face detection and pose estimation run concurrently on the same ORT WebGPU device
- **Session reuse:** same model URL → same session. Both model loading and session creation are lazy on first inference.
- **NCHW layout:** `preferNchw` parameter in `initSession` — ESRGAN models use `{ name: 'webgpu', preferredLayout: 'NCHW' }` + `graphOptimizationLevel: 'basic'` instead of broken NHWC
- **Extra inputs:** `runMulti` supports `extraInputs` (Float32/Int32/Int64 arrays) — for models with multiple named inputs (e.g. baked-in NMS thresholds)
- **Logging:** `ort.env.logLevel = 'error'` — silences per-call warnings (dynamic output shapes, op-to-EP fallbacks), logs input/output names
- **Worker teardown:** `terminateInferenceWorker()` — recreates the worker between benchmark models to prevent WebGPU session interference
- **Default SCRFD-10G** for anonymization (was SCRFD-500M) — higher detection recall, ceil_mode=0 WebGPU patch

### Milestones

- [x] v0.7.0: WebCodecs decode/encode + per-frame detection (proof-of-concept, short clips <10s, no tracking)
- [x] v0.7.1: ByteTrack + adaptive keyframes + temporal mask smoothing + scale-invariant effects
- [x] v0.7.2: Audio passthrough (mediabunny), ETA, cancel, progress improvements, quality toggle (accurate/fast)
- [x] v0.7.3: Body tracking (YOLOv8-pose), stable effect width, audio hardening, edit-again UX, direct video drop flow, inference worker serializer
- [ ] v0.7.4: UI — video scrubber, keyframe editor, preview during processing
- [ ] v0.7.5: [optional] ArcFace re-ID for long occlusions (face descriptor ONNX)

### Dependencies

- `mediabunny` (1.42.0) — MP4/WebM demux + mux with audio passthrough (npm, ~400KB)
- `onnxruntime-web` (1.25.1) — face detection + pose estimation
- No other new runtime deps — Canvas API + existing ORT

---

## v0.3 — Face Restoration

- [ ] GFPGAN v1.4 integration
- [ ] CodeFormer integration
- [ ] Face detection pipeline
- [ ] Face crop/align/paste-back

## v0.4 — Inpainting

- [ ] LaMa integration
- [ ] Mask editor (brush tool)
- [ ] Mask refinement

## v0.5 — Denoising

- [ ] DRUNet integration
- [ ] DRUNet Deblock integration (denoise + JPEG artifact removal)
- [ ] Noise level estimation

## v0.6 — Face Anonymization (Hide Faces)

> Two-step workflow: automatic detection of all faces with manual correction,
> then applying an effect (blur / pixelate / solid / emoji / sticker).
> **Priority — maximum detection recall over speed.** Robust on group photos
> (weddings, school classes, concerts, crowds).

### Models (4 detectors — single-model, interactive correction)

- [x] SCRFD-10G-KPS (15.5 MB, quality, WebGPU — ceil_mode=0 patch for ORT 1.25.1, now the default model)
- [x] SCRFD-500M (2.4 MB, lightweight, WebGPU)
- [x] YuNet 2023 (0.2 MB, lightweight, WebGPU)
- [x] RetinaFace-MobileNet0.25 (1.7 MB, profiles/occlusion, WebGPU)
- [x] ~~BlazeFace~~ — removed (doesn't convert to WebGPU, unsupported by ORT 1.25.x)
- [x] Model selector in wizard + speed icons (⚡⚡⚡/⚡⚡/⚡/🐢) from benchmark classes

### Detection pipeline

- [x] Two-pass strategy: global letterbox pass (full image → 640×640) for large faces + tiled pass (overlap 64) for medium/small faces
- [x] Single-model inference with tiling (overlap 64)
- [x] NMS deduplication with configurable IoU threshold
- [x] Face box parsing per model format (SCRFD stride vs pixel-space, etc.)
- [x] SCRFD anchors: centers at `ax * stride` (not `(ax+0.5) * stride` — fixed per insightface reference) — removes bbox shift by stride/2 down-right
- [x] Default model SCRFD-10G (was SCRFD-500M) — higher recall on group photos

### UI and UX

- [x] Two-step wizard (Detect → Apply effect)
- [x] Frozen source image (`sourceImageUrl`) — re-applying with new settings always renders from the clean original (no effect stacking)
- [x] "Open another photo" button in wizard — switch photos without leaving the wizard, with HEIC auto-conversion and effect setting preservation
- [x] Interactive face overlay — drag, resize, delete, draw new boxes
- [x] Confidence percentage label on each box
- [x] Live preview of effects (PreviewCanvas)
- [x] Before/after comparison slider (BeforeAfterSplit) when preview ON
- [x] "Revert to original" button in Editor (RotateCcw) — only visible after processing
- [x] Single-view mode (no BeforeAfterSplit) when no before/after pair exists (fresh photo, unedited)
- [x] "Open another photo" button in editor footer — full photo replacement (original+current) with HEIC conversion, without leaving the editor
- [x] History click auto-closes wizard
- [x] Compact controls: collapsible on mobile, full on desktop
- [x] Mobile-responsive layout (compact toolbar, horizontal history)
- [x] Touch support via Pointer Events
- [x] Progress bar (stage + percentage, positioned top-center on mobile)
- [x] Shared `imageFile.ts` utility — size validation, HEIC→JPEG, MIME check for Dropzone and "Open another photo" buttons

### Effect application

- [x] 4 effects: Blur, Pixelate, Solid Fill, Emoji
- [x] Mask shapes: rectangle / ellipse (oval default, disabled for emoji)
- [x] Padding (expand area around face)
- [x] Feather with proper gradient mask (eroded shape + blur)
- [x] Clamped-linear effect strength scaling: `max(1, faceWidth / 100)` — constant block count per face ≥100px, small faces don't shrink
- [x] Pre-Apply preview with the same per-face scaling (`scaleKernel`/`scaleEffectStrength`) — preview matches Apply result
- [x] Shared `scaleKernel`/`scaleEffectStrength` in `anonymizeEffects.ts` — used by both photo and video pipelines
- [x] `pixelateSize` default 10 (was 16)
- [x] Per-effect visibility: only relevant sliders shown
- [x] Random emoji per face

## Future

- [ ] Batch processing
- [ ] EXIF preservation
- [ ] Metadata stripping (for privacy after anonymization)
- [ ] PWA offline support
- [ ] WebCodecs for faster decode/encode

---

## v0.3 — Face Restoration

- [ ] GFPGAN v1.4 integration
- [ ] CodeFormer integration
- [ ] Face detection pipeline
- [ ] Face crop/align/paste-back

## v0.4 — Inpainting

- [ ] LaMa integration
- [ ] Mask editor (brush tool)
- [ ] Mask refinement

## v0.5 — Denoising

- [ ] DRUNet integration
- [ ] DRUNet Deblock integration (denoise + JPEG artifact removal)
- [ ] Noise level estimation

## v0.6 — Face Anonymization (Hide Faces)

> Two-step workflow: automatic detection of all faces with manual correction,
> then applying an effect (blur / pixelate / solid / emoji / sticker).
> **Priority — maximum detection recall over speed.** Robust on group photos
> (weddings, school classes, concerts, crowds).

### Models (4 detectors — single-model, interactive correction)

- [x] SCRFD-10G-KPS (15.5 MB, quality, WebGPU — ceil_mode=0 patch for ORT 1.25.1, now the default model)
- [x] SCRFD-500M (2.4 MB, lightweight, WebGPU)
- [x] YuNet 2023 (0.2 MB, lightweight, WebGPU)
- [x] RetinaFace-MobileNet0.25 (1.7 MB, profiles/occlusion, WebGPU)
- [x] ~~BlazeFace~~ — removed (doesn't convert to WebGPU, unsupported by ORT 1.25.x)
- [x] Model selector in wizard + speed icons (⚡⚡⚡/⚡⚡/⚡/🐢) from benchmark classes

### Detection pipeline

- [x] Two-pass strategy: global letterbox pass (full image → 640×640) for large faces + tiled pass (overlap 64) for medium/small faces
- [x] Single-model inference with tiling (overlap 64)
- [x] NMS deduplication with configurable IoU threshold
- [x] Face box parsing per model format (SCRFD stride vs pixel-space, etc.)
- [x] SCRFD anchors: centers at `ax * stride` (not `(ax+0.5) * stride` — fixed per insightface reference) — removes bbox shift by stride/2 down-right
- [x] Default model SCRFD-10G (was SCRFD-500M) — higher recall on group photos

### UI and UX

- [x] Two-step wizard (Detect → Apply effect)
- [x] Frozen source image (`sourceImageUrl`) — re-applying with new settings always renders from the clean original (no effect stacking)
- [x] "Open another photo" button in wizard — switch photos without leaving the wizard, with HEIC auto-conversion and effect setting preservation
- [x] Interactive face overlay — drag, resize, delete, draw new boxes
- [x] Confidence percentage label on each box
- [x] Live preview of effects (PreviewCanvas)
- [x] Before/after comparison slider (BeforeAfterSplit) when preview ON
- [x] "Revert to original" button in Editor (RotateCcw) — only visible after processing
- [x] Single-view mode (no BeforeAfterSplit) when no before/after pair exists (fresh photo, unedited)
- [x] "Open another photo" button in editor footer — full photo replacement (original+current) with HEIC conversion, without leaving the editor
- [x] History click auto-closes wizard
- [x] Compact controls: collapsible on mobile, full on desktop
- [x] Mobile-responsive layout (compact toolbar, horizontal history)
- [x] Touch support via Pointer Events
- [x] Progress bar (stage + percentage, positioned top-center on mobile)
- [x] Shared `imageFile.ts` utility — size validation, HEIC→JPEG, MIME check for Dropzone and "Open another photo" buttons

### Effect application

- [x] 4 effects: Blur, Pixelate, Solid Fill, Emoji
- [x] Mask shapes: rectangle / ellipse (oval default, disabled for emoji)
- [x] Padding (expand area around face)
- [x] Feather with proper gradient mask (eroded shape + blur)
- [x] Clamped-linear effect strength scaling: `max(1, faceWidth / 100)` — constant block count per face ≥100px, small faces don't shrink
- [x] Pre-Apply preview with the same per-face scaling (`scaleKernel`/`scaleEffectStrength`) — preview matches Apply result
- [x] Shared `scaleKernel`/`scaleEffectStrength` in `anonymizeEffects.ts` — used by both photo and video pipelines
- [x] `pixelateSize` default 10 (was 16)
- [x] Per-effect visibility: only relevant sliders shown
- [x] Random emoji per face

## Future

- [ ] Batch processing
- [ ] EXIF preservation
- [ ] Metadata stripping (for privacy after anonymization)
- [ ] PWA offline support
- [ ] WebCodecs for faster decode/encode