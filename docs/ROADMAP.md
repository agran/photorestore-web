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

### Models (ensemble for max recall)

- [x] SCRFD-10G-KPS integration (primary detector)
- [x] RetinaFace-R50 integration (profiles, occlusion)
- [x] YOLOv8-face integration (dense groups)
- [x] YuNet integration (tiny faces 16×16+)
- [x] Model registry metadata (size, quality, speed)

### Detection pipeline (`thoroughDetect`)

- [x] Multi-scale inference at 7 scales (512/768/1024/1280/1600/2048/2560)
- [x] Test-Time Augmentation (horizontal flip)
- [x] Tile-based detection (1024×1024, overlap 384) for large photos
- [x] Weighted Box Fusion for ensemble result merging
- [x] Soft-NMS as fallback for single-model mode
- [x] Adaptive `smartDetect` strategy selector

### Optional max-recall techniques

- [x] Image pyramid with 0.83× step
- [x] ROI refinement in dense regions (zoom-in re-detection)
- [x] Body detection (YOLOv8-person) as a "possibly missed face" hint
- [x] Landmark refinement to filter out false positives

### UI and UX

- [x] Two-step wizard (Detect → Apply effect)
- [x] 5 presets: Fast / Standard / Thorough / Maximum / Paranoid
- [x] Progress bar with stage, time and live face count
- [x] "Stop and keep current results" button (AbortSignal)
- [x] Live preview of boxes as they are detected
- [x] Color-coded confidence (votes: 1=yellow, 2=blue, 3-4=green)
- [x] Found-faces thumbnail grid for quick review
- [x] Bulk operations (select all / by threshold, lasso selection)
- [x] Canvas renderer (react-konva) for 100+ interactive boxes

### Manual box correction

- [x] Add new boxes (drag-to-create)
- [x] Delete boxes (Delete / right click)
- [x] Move and resize via handles
- [x] Undo / Redo for box operations

### Effect application

- [x] Gaussian blur (with adaptive radius option)
- [x] Pixelate (mosaic, with adaptive block size option)
- [x] Solid color fill
- [x] Emoji overlay
- [x] Sticker (from bundled PNG set)
- [x] Mask shapes: rectangle / ellipse / rounded
- [x] Padding (expand area around face)
- [x] Feather (soft mask edges)

### Performance and memory

- [x] Web Worker with AbortSignal support
- [x] Release ONNX sessions between models
- [x] Tensor pool for Float32Array reuse
- [x] GC pauses between inference stages
- [x] Persist intermediate results in IndexedDB

### Tests

- [x] Unit tests: WBF, IoU, NMS, box operations
- [x] E2E (Playwright): fixtures with group photos
- [x] Recall benchmarks: ≥95% on typical groups, ≥90% on WIDER Hard

## Future

- [ ] Batch processing
- [ ] EXIF preservation
- [ ] Metadata stripping (for privacy after anonymization)
- [ ] PWA offline support
- [ ] WebCodecs for faster decode/encode