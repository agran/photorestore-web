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

### Architecture

```
MP4/WebM → Canvas decode → Frame → Detect (keyframes) → Track (Kalman+IoU)
                                   → [YOLO-pose body anchor]
                                   → Apply effect → Encode → Output video
```

| Layer | Module | Purpose |
|-------|--------|---------|
| Input | `VideoAnonymizeWizard.tsx` | Video upload, frame preview, effect settings, progress |
| Decode | `videoDecoder.ts` | `<video>` → Canvas → `ImageData` per frame |
| Detect | reuse `anonymize.ts` pipeline | Full detection every N keyframes |
| Track | `faceTracker.ts` | Kalman filter + IoU matching for in-between frames |
| Pose | `poseDetector.ts` (yolo26m-pose) | Body keypoints anchor face position, reduce drift |
| Effect | reuse `anonymizeEffects.ts` | Blur / Pixelate / Solid / Emoji per-face per-frame |
| Encode | `videoEncoder.ts` | WebCodecs (preferred) or ffmpeg.wasm → MP4/WebM |
| State | `videoAnonymizeStore.ts` | Per-frame face boxes, track IDs, processing progress |

### Face Tracking (v0.7.1)

- **Keyframe interval**: full detection every 10–15 frames
- **Kalman filter**: 4-state (x, y, dx, dy) per face, constant velocity model
- **IoU matching**: greedy Hungarian association between predicted and detected boxes
- **Drift recovery**: re-detect when IoU < 0.3 for 3 consecutive frames
- **New face detection**: any unmatched detection → spawn tracker

### YOLO Pose Integration (v0.7.2)

- Model: `yolo26m-pose.onnx` (~26 MB, 17 COCO keypoints)
- Each person gets bbox + keypoints (nose, eyes, ears, shoulders, elbows, wrists, hips, knees, ankles)
- Face bbox anchored to body via nose+eyes → body bbox; stabilizes during occlusion/turning
- Only runs on keyframes (every 10–15 frames, same schedule as detection)
- Optional: skip face detector entirely, use nose+eyes as face proxy (faster but less accurate)

### Encoding Strategy

| Method | Pros | Cons |
|--------|------|------|
| **WebCodecs** | GPU-accelerated, no WASM | Chrome/Edge only, no Firefox |
| **ffmpeg.wasm** | Cross-browser, mature | 30+ MB WASM, CPU-only, slow |
| **Hybrid** | WebCodecs if available, fallback to ffmpeg.wasm | Extra build complexity |

Choice: WebCodecs first (target Chrome/Edge, 93% of users), ffmpeg.wasm as fallback.

### UI Flow

1. Upload video → show first frame + duration/resolution info
2. Detect faces on frame 0 → show overlay (reuse FaceOverlay)
3. Configure effects (reuse AnonymizeWizard effect panel)
4. "Process" → progress: current frame / total frames, ETA, cancel button
5. "Download" → output video (WebM VP9, same resolution/fps as input)
6. Before/After: side-by-side video players (or frame comparison for selected frame)

### Milestones

- [ ] v0.7.0: Canvas decode → full detection per frame → WebCodecs/ffmpeg encode → download
- [ ] v0.7.1: Kalman+IoU face tracking → keyframe detection → 10× speedup
- [ ] v0.7.2: YOLO-pose body anchor → robust tracking through occlusion/turns
- [ ] v0.7.3: UI — video preview scrubber, keyframe editor, ETA, cancel, audio passthrough

### Dependencies

- `yolo26m-pose.onnx` → `src/ml/models/` + modelRegistry entry
- `@ffmpeg/ffmpeg` or `@ffmpeg/util` (if WebCodecs unavailable)
- No new runtime deps otherwise — Canvas API + existing ORT

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