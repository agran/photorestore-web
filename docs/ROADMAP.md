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

- [x] Real-ESRGAN x4plus integration
- [x] Real-ESRGAN x4plus-anime integration
- [x] Real-CUGAN Up×4 (conservative)
- [x] Real-CUGAN Up×4 Denoise
- [x] Inference worker (ORT session + tensor inference via Comlink)
- [x] Tiling with model-input padding (64×64 tiles → pad → infer → crop → blend)
- [x] Model download progress + per-tile inference progress in ProgressBar
- [x] WebGPU/WASM backend auto-detection with timeout
- [x] Console logging: model name, input size, backend
- [x] Model selector in ToolPanel (dropdown with all upscale models)

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

- [ ] SCRFD-10G-KPS integration (primary detector)
- [ ] RetinaFace-R50 integration (profiles, occlusion)
- [ ] YOLOv8-face integration (dense groups)
- [ ] YuNet integration (tiny faces 16×16+)
- [ ] Model registry metadata (size, quality, speed)

### Detection pipeline (`thoroughDetect`)

- [ ] Multi-scale inference at 7 scales (512/768/1024/1280/1600/2048/2560)
- [ ] Test-Time Augmentation (horizontal flip)
- [ ] Tile-based detection (1024×1024, overlap 384) for large photos
- [ ] Weighted Box Fusion for ensemble result merging
- [ ] Soft-NMS as fallback for single-model mode
- [ ] Adaptive `smartDetect` strategy selector

### Optional max-recall techniques

- [ ] Image pyramid with 0.83× step
- [ ] ROI refinement in dense regions (zoom-in re-detection)
- [ ] Body detection (YOLOv8-person) as a "possibly missed face" hint
- [ ] Landmark refinement to filter out false positives

### UI and UX

- [ ] Two-step wizard (Detect → Apply effect)
- [ ] 5 presets: Fast / Standard / Thorough / Maximum / Paranoid
- [ ] Progress bar with stage, time and live face count
- [ ] "Stop and keep current results" button (AbortSignal)
- [ ] Live preview of boxes as they are detected
- [ ] Color-coded confidence (votes: 1=yellow, 2=blue, 3-4=green)
- [ ] Found-faces thumbnail grid for quick review
- [ ] Bulk operations (select all / by threshold, lasso selection)
- [ ] Canvas renderer (react-konva) for 100+ interactive boxes

### Manual box correction

- [ ] Add new boxes (drag-to-create)
- [ ] Delete boxes (Delete / right click)
- [ ] Move and resize via handles
- [ ] Undo / Redo for box operations

### Effect application

- [ ] Gaussian blur (with adaptive radius option)
- [ ] Pixelate (mosaic, with adaptive block size option)
- [ ] Solid color fill
- [ ] Emoji overlay
- [ ] Sticker (from bundled PNG set)
- [ ] Mask shapes: rectangle / ellipse / rounded
- [ ] Padding (expand area around face)
- [ ] Feather (soft mask edges)

### Performance and memory

- [ ] Web Worker with AbortSignal support
- [ ] Release ONNX sessions between models
- [ ] Tensor pool for Float32Array reuse
- [ ] GC pauses between inference stages
- [ ] Persist intermediate results in IndexedDB

### Tests

- [ ] Unit tests: WBF, IoU, NMS, box operations
- [ ] E2E (Playwright): fixtures with group photos
- [ ] Recall benchmarks: ≥95% on typical groups, ≥90% on WIDER Hard

## Future

- [ ] Batch processing
- [ ] EXIF preservation
- [ ] Metadata stripping (for privacy after anonymization)
- [ ] PWA offline support
- [ ] WebCodecs for faster decode/encode
