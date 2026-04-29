# Roadmap

> 🇷🇺 [Русская версия](./ROADMAP.ru.md)

## MVP (current)

- [x] Project scaffold (Vite + React + TypeScript + Tailwind)
- [x] i18n (EN + RU)
- [x] Dropzone with drag&drop and preview
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
- [x] NMKD Superscale (128×128 tile, 64 MB, RRDBNet, converted pth→ONNX) — WASM
- [x] 4xNomos8kSC (128×128 tile, 64 MB, nesaorg ONNX) — WASM
- [x] 4xLSDIR-DAT (256×256 tile, 62 MB, DAT backbone, nesaorg ONNX) — WASM
- [x] Real-CUGAN Up×4 + Real-CUGAN Up×4 Denoise (2 MB each) — WebGPU
- [x] ONNX Runtime Web 1.26.0-dev upgrade
- [x] CDN-based model loading (`erudit23.ru/models/`) for production
- [x] Constant → Initializer graph optimization (ORT WebGPU requirement)
- [x] `forceWasm` flag for models incompatible with WebGPU JSEP
- [x] Inference worker (ORT session + tensor inference via Comlink)
- [x] Tiling with model-input padding (pad → infer → crop → cosine-window blend)
- [x] Model download progress + per-tile inference progress in ProgressBar
- [x] WebGPU/WASM backend auto-detection with 3s timeout
- [x] Console logging: model name, input size, backend
- [x] Model selector in ToolPanel (dropdown with all upscale models)
- [x] BrowserRouter basename for GitHub Pages routing
- [x] Vite `base` config for GitHub Pages asset paths
- [x] GitHub Actions CI + GitHub Pages deploy (source: Actions, not branch)

## v0.7 — Video Face Anonymization

> Extends the v0.6 Hide Faces pipeline to video. Same 4 effects,
> same 5 detectors, but applied frame-by-frame with face tracking
> and re-encoding into a video file.
> **Entire pipeline runs in a WebWorker** — main thread handles only UI.

### Architecture

```
MP4/WebM → MP4Box demux → WebCodecs VideoDecoder → VideoFrame
  → Detect (keyframes) → ByteTrack → Apply effect → WebCodecs VideoEncoder
  → mp4-muxer remux → Output MP4/WebM (with audio passthrough)
```

Zero-copy where possible: `VideoFrame` / `ImageBitmap` between stages, `OffscreenCanvas` for rendering, no `getImageData()` in the hot path.

| Layer | Module | Purpose |
|-------|--------|---------|
| Demux | `MP4Box.js` | Split MP4 into video + audio tracks (`EncodedVideoChunk`) |
| Decode | `WebCodecs VideoDecoder` | GPU-accelerated frame-accurate decode → `VideoFrame` |
| Detect | reuse `anonymize.ts` pipeline | Full detection on keyframes; BlazeFace cheap verifier on every frame |
| Track | `faceTracker.ts` | ByteTrack (two-stage IoU matching) + adaptive keyframe interval |
| Re-ID | `faceReid.ts` (ArcFace ONNX) | Re-identify faces after long occlusions (v0.7.4, optional) |
| Pose | `poseDetector.ts` (yolo26m-pose) | Body keypoints anchor face position (v0.7.5, optional) |
| Effect | reuse `anonymizeEffects.ts` | Blur / Pixelate / Solid / Emoji per-face per-frame |
| Encode | `WebCodecs VideoEncoder` | H.264 baseline primary, VP9 optional. `isConfigSupported()` for capability |
| Mux | `mp4-muxer` | Combine encoded video + audio passthrough → MP4/WebM |
| Audio | `AudioEncoder` (if re-encode needed) | Remux original audio without re-encode when container matches |
| State | `videoAnonymizeStore.ts` | Per-frame face boxes, track IDs, processing progress |
| Worker | `videoWorker.ts` | Entire pipeline (decode→track→effect→encode), `postMessage` + transferable `VideoFrame` |

### Why not `<video>` + Canvas for decode

- `<video>.currentTime` is async, imprecise (snaps to nearest keyframe), drops frames on long videos
- `requestVideoFrameCallback` can't decode faster than real-time — 30s video takes ≥30s
- `drawImage(video) → getImageData()` forces GPU→CPU readback, massive bottleneck
- **Fix:** WebCodecs `VideoDecoder` — frame-accurate, faster than real-time, GPU-native

### Encoding Strategy

| Method | Pros | Cons |
|--------|------|------|
| **WebCodecs H.264** | GPU-accelerated, universal (Chrome/Edge/Safari) | Firefox limited support |
| **WebCodecs VP9** | Open codec, good compression | Not everywhere for encode |
| **ffmpeg.wasm** | Cross-browser fallback | 30+ MB WASM, CPU-only, <2% users |

- **Primary:** H.264 baseline via WebCodecs (Chrome, Edge, Safari 17+)
- **Fallback:** ffmpeg.wasm for very old browsers (<2%)
- **Detection:** `VideoEncoder.isConfigSupported({ codec: 'avc1.42001E' })` — not browser sniffing
- **Container:** MP4 for H.264, WebM for VP9

### Face Tracking — ByteTrack (v0.7.1)

- **ByteTrack**: two-stage association — high-confidence detections matched first, then low-confidence detections matched to remaining tracks. Handles occlusions and crossing faces. ~200 lines, no ML.
- **Keyframe interval**: adaptive — 15 frames when all tracks confident (Kalman covariance low), 5 frames when any track shaky
- **Kalman filter**: 4-state (x, y, dx, dy) per face, constant velocity model, for prediction between keyframes
- **Cheap verifier**: BlazeFace on every frame (<5ms), full detector (SCRFD/RetinaFace) only on keyframes for high recall
- **Drift recovery**: re-detect when IoU < 0.3 for 3 consecutive frames
- **New face**: unmatched high-conf detection → spawn tracker
- **Forward-backward consistency**: at finalize, run tracking in both directions and average — drastically stabilizes bbox
- **Temporal mask smoothing**: low-pass filter (EMA α≈0.5) on bbox corners before rasterize — eliminates "flickering halo" from feather + tracking jitter

### Scale-Invariant Effects for Video

- **Pixelate kernel / Blur radius**: tied to bbox size (`kernel = bbox.width * 0.1`), not fixed pixels — avoids visual "breathing" as face moves closer/further
- **Feather**: proportional to bbox size, not absolute pixels
- **Emoji font size**: `bbox.width * 0.6` — adapts to face size per frame

### Audio Passthrough (v0.7.2)

- **Demux:** `MP4Box.js` reads audio track as `EncodedAudioChunk` packets
- **Remux:** `mp4-muxer` (npm, ~20KB) accepts `EncodedAudioChunk` directly — no re-encode
- **Caveat:** container must match (MP4→MP4 for AAC, WebM→WebM for Opus/Vorbis). If crossing containers (MP4→WebM), re-encode audio via `AudioEncoder`
- **No audio track?** Skip entirely, output video-only

### Memory & Backpressure (built into pipeline from day 1)

- **`VideoFrame.close()`** after every stage — unclosed frame on 1080p = ~8MB GPU memory leak
- **Streaming pipeline:** decode → track → effect → encode — one frame in flight + small buffer, never accumulate all frames in arrays
- **Encoder backpressure:** `encodeQueueSize` can grow faster than encoder processes; await `flush()` every N frames
- **Tab throttling:** use `requestVideoFrameCallback` or worker-internal pump via `setTimeout(0)`, not `rAF` (stops in background)
- **Cancel:** `worker.terminate()` — clean, immediate

### UI Flow

1. Upload video → first frame + duration/resolution/metadata
2. Detect faces on frame 0 → overlay (reuse FaceOverlay)
3. Configure effects (reuse AnonymizeWizard effect panel)
4. "Process" → progress: frames done / total, ETA (EMA over last 30 frames), cancel
5. Preview: render every N-th finished frame in `OffscreenCanvas` → post to main thread (not realtime)
6. "Download" → output video (same resolution/fps as input, audio passthrough)
7. Before/After: frame comparison or side-by-side video players

### Milestones (reordered after architecture review)

- [ ] v0.7.0: WebCodecs decode/encode + per-frame detection + WebWorker pipeline (proof-of-concept, short clips <10s, no tracking)
- [ ] v0.7.1: ByteTrack + adaptive keyframes + temporal mask smoothing + scale-invariant effects
- [ ] v0.7.2: Audio passthrough (MP4Box + mp4-muxer), ETA, cancel, long video support
- [ ] v0.7.3: UI — video scrubber, keyframe editor, preview during processing
- [ ] v0.7.4: [optional] ArcFace re-ID for long occlusions (face descriptor ONNX)
- [ ] v0.7.5: [optional, only if test failures warrant] YOLO-pose body anchor for 3/4 profile / turning cases

### Dependencies

- `mp4box.js` — MP4 demuxing (npm, ~200KB)
- `mp4-muxer` — MP4/WebM muxing with audio passthrough (npm, ~20KB)
- `@ffmpeg/ffmpeg` / `@ffmpeg/util` — fallback encode for very old browsers
- `yolo26m-pose.onnx` — only for v0.7.5, not a hard dependency
- `arcface-mbn.onnx` — only for v0.7.4 re-ID
- No other new runtime deps — Canvas API (`OffscreenCanvas`, `ImageBitmap`) + existing ORT

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

### Models (5 detectors — single-model, interactive correction)

- [x] SCRFD-10G-KPS (15.5 MB, quality, WASM-only)
- [x] SCRFD-500M (2.4 MB, default, WebGPU) 
- [x] YuNet 2023 (0.2 MB, lightweight, WebGPU)
- [x] RetinaFace-MobileNet0.25 (1.7 MB, profiles/occlusion, WebGPU)
- [x] BlazeFace (0.5 MB, ultra-fast, WebGPU)
- [x] Model selector in wizard + runtime labels (GPU/CPU · size)

### Detection pipeline

- [x] Single-model inference with tiling (overlap 64)
- [x] NMS deduplication with configurable IoU threshold
- [x] Face box parsing per model format (SCRFD stride vs pixel-space, etc.)

### UI and UX

- [x] Two-step wizard (Detect → Apply effect)
- [x] Interactive face overlay — drag, resize, delete, draw new boxes
- [x] Confidence percentage label on each box
- [x] Live preview of effects (PreviewCanvas)
- [x] Before/after comparison slider (BeforeAfterSplit) when preview ON
- [x] Compact controls: collapsible on mobile, full on desktop
- [x] Mobile-responsive layout (compact toolbar, horizontal history)
- [x] Touch support via Pointer Events
- [x] Progress bar (stage + percentage, positioned top-center on mobile)

### Effect application

- [x] 4 effects: Blur, Pixelate, Solid Fill, Emoji
- [x] Mask shapes: rectangle / ellipse (oval default, disabled for emoji)
- [x] Padding (expand area around face)
- [x] Feather with proper gradient mask (eroded shape + blur)
- [x] Per-effect visibility: only relevant sliders shown
- [x] Random emoji per face

## Future

- [ ] Batch processing
- [ ] EXIF preservation
- [ ] Metadata stripping (for privacy after anonymization)
- [ ] PWA offline support
- [ ] WebCodecs for faster decode/encode