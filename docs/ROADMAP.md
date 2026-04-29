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