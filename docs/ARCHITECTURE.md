# PhotoRestore Web — Architecture

> 🇷🇺 [Русская версия](./ARCHITECTURE.ru.md)

## Overview

PhotoRestore Web is a fully client-side AI photo restoration application:

- **Vite 5 + React 18 + TypeScript 5 (strict)** — UI framework
- **ONNX Runtime Web (WebGPU + WASM)** — ML inference engine
- **Zustand 4** — state management
- **React Router 6** — routing
- **Tailwind CSS 3 + shadcn/ui** — styling
- **react-i18next** — i18n (EN + RU)
- **Comlink + Web Workers** — off-main-thread inference
- **Cache API + idb** — model and data persistence

## Key Principles

1. **No backend** — all processing happens in the browser.
2. **Privacy** — no images or data ever leave the user's device.
3. **Progressive enhancement** — WebGPU with WASM fallback.
4. **Modular pipelines** — each restoration type is an independent pipeline.

## Directory Structure

```
src/
├── ml/           # ML infrastructure (runtime, loader, pipelines, utils)
├── workers/      # Web Workers for off-main-thread inference
├── store/        # Zustand stores
├── routes/       # Page components (Home, Editor, About)
├── components/   # UI components
├── hooks/        # Custom React hooks
├── lib/          # Utilities (download, heic, imageFile, format)
├── i18n/         # Localization
└── styles/       # Global CSS
```

### `src/lib/imageFile.ts` — shared image input pipeline

Unifies validation and conversion for Dropzone and the editor / wizard "Open another photo" buttons:

- `readImageFile(file)` — size check (32 MB max), HEIC→JPEG auto-conversion via `heicToJpeg()`, final MIME type validation
- `PHOTO_ACCEPT_ATTR` — `accept` attribute for `<input type="file">` (image/png, image/jpeg, image/webp, image/heic, image/heif, .heic, .heif)
- Typed result `{ ok: true, file } | { ok: false, messageKey, description }` — keeps callers UI-agnostic (toast keys come from i18n)

## Data Flow

### Main upload + processing flow

```
User drops image
    ↓
Dropzone (blob URL) → imageFile.readImageFile() → EditorStore.loadNewImage()
    ↓
Click on tool
    ↓
ToolPanel → job → inference.worker (Comlink)
    ↓
Worker: loadModel (Cache API) → createSession (ORT) → run()
    ↓
EditorStore.pushHistory() ← result URL
    ↓
ImageCompare (before/after slider)
```

### Frozen source in the anonymize wizard

The anonymize wizard always operates on a **frozen snapshot** of the source photo (`AnonymizeStore.sourceImageUrl`), not on the live `EditorStore.currentImageUrl`:

```
Open wizard (handleOpenWizard) / "Open another photo"
    ↓
AnonymizeStore.setSourceImageUrl(currentImageUrl)  ← freeze source
    ↓
All operations (detect, apply, preview) read from sourceImageUrl
    ↓
Re-Apply with new settings → re-render from clean source
(no effects stacked on each other)
```

This solves the "effects stacking on top of each other" problem: without freezing, `Apply → change settings → Apply again` would produce double blur/pixelate, because `currentImageUrl` would already be the result of the previous Apply.

When closing the wizard or switching photos, `resetForNewImage()` clears faces/step but preserves effect settings (blurRadius, padding, modelId, etc.) — the user doesn't have to re-tune sliders.

### Switching photos in the editor

The editor's "Open another photo" button calls `EditorStore.loadNewImage(url)`, which replaces **both** `currentImageUrl` **and** `originalImageUrl`. Unlike `setImage()` (which preserves the very first load as original), `loadNewImage` treats the new photo as "starting from a clean slate" — correct before/after comparison, and "Revert to original" works against the current photo.

The "Revert to original" button only appears when `currentImageUrl !== originalImageUrl` (i.e. after processing, not immediately after upload).

## WebGPU optimizations (ORT 1.25.x)

### NCHW layout for ESRGAN models

ONNX Runtime Web 1.25.x breaks NHWC Conv kernel codegen for ESRGAN-style models (the final 3-channel Conv after PixelShuffle fusion). Fix: NCHW layout via `executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }, 'wasm']` and `graphOptimizationLevel: 'basic'` (instead of `'all'`). Activated by the `preferNchw: true` flag in `ModelMeta` for: NMKD Superscale, 4xNomos8kSC, 4xLSDIR-DAT.

These models were also converted to fp16 (`scripts/convert_fp16.py`) — internal weights/activations are float16, while inputs/outputs stay float32 (keep_io_types=True).

### SCRFD-10G ceil_mode patch

ORT 1.25.1's WebGPU EP doesn't support Pool ops with `ceil_mode=1`. SCRFD-10G uses `AveragePool`/`MaxPool` with ceil_mode=1 in three ResNet downsample blocks. The patch (`scripts/patch_scrfd_ceil.py` via `onnx`) replaces ceil_mode with 0 — for 640×640 input, all intermediate sizes are even, so the patch is mathematically equivalent to the original. The model is loaded as `scrfd_10g_gnkps-nochceil.onnx`.

### BlazeFace removal

BlazeFace was removed from the registry, detection pipeline, and i18n — it doesn't convert to WebGPU and isn't supported by ORT 1.25.x (Concat conflict in JSEP). Four detectors remain: SCRFD-10G, SCRFD-500M, YuNet 2023, RetinaFace-MobileNet0.25.

### SharedArrayBuffer / WASM threads on GitHub Pages

GitHub Pages (and most static hosts) don't set `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, so `crossOriginIsolated = false` and `SharedArrayBuffer` is unavailable. Multi-threaded WASM (`numThreads > 1`) crashes with `pthread_create failed` and **permanently breaks** `initWasm()` — no backend (neither WebGPU nor WASM) can start afterward.

Fix: `setupRuntime()` in `inference.worker.ts` checks `self.crossOriginIsolated` and falls back to `numThreads = 1` when absent. WebGPU still works normally; WASM runs single-threaded (slower, but functional).

The local dev server (`pnpm run dev`) sets COOP/COEP via `vite.config.ts` — there `crossOriginIsolated = true` and multi-threading is available.

### Speed classes (`speedClass`)

Models are tagged with relative inference speed based on in-browser benchmarks (`src/dev/benchmark.ts`):

| Class | Icon | Models |
|-------|------|--------|
| `fast` | ⚡⚡⚡ | Real-CUGAN (both), RetinaFace-MBN025 |
| `medium` | ⚡⚡ | Real-ESRGAN x4plus, SCRFD-10G, SCRFD-500M, YuNet 2023 |
| `slow` | ⚡ | NMKD Superscale, 4xNomos8kSC |
| `very-slow` | 🐢 | 4xLSDIR-DAT |

Icons appear in model dropdowns instead of a generic `⚡ GPU`.

### Streaming tiling (`src/ml/utils/tiling.ts`)

Large images are upscaled in tiles. The architecture is streaming, not batch:

```
planTiles(W, H, opts)            ← coordinates only (no canvases)
    ↓
for coord of coords {
  tileCanvas = extractTile(src, coord)     ← one tile in memory
  infer(tileCanvas) → outputCanvas
  merger.addTile(coord, outputCanvas)      ← incremental cosine blend
  // tileCanvas / outputCanvas drop immediately
}
    ↓
merged = merger.finalize()
```

`TileMerger` holds 5 Float32Array accumulators of size `outW × outH` (RGBA + weight). Old `splitTiles` / `mergeTiles` are kept as backward-compat wrappers for unit tests.

This dropped peak memory: previously ALL output canvases + accumulators were held simultaneously (N tile canvases in JS heap + 5×outW×outH×4 bytes). Now — only the current tile + accumulators. For 4K at scale=4 → ~2.6 GB (OK on devices with ≥4 GB RAM); for 8K → close to the limit.

The same `planTiles` + `extractTile` is used by face detection ([anonymize.ts](../src/ml/pipelines/anonymize.ts)) — that previously had its own `splitDetectionTiles` with the same all-canvases-at-once pattern.

### Crash-recovery inference worker (`src/ml/inferenceClient.ts`)

The singleton inference worker listens for `error` / `messageerror` events. On crash (uncaught exception in the worker, OOM, browser kill), the cached `worker`/`workerApi` is dropped → the next call to `getInferenceWorker()` spawns a fresh process. ONNX sessions are lost in the process; calling pipelines must have try/catch + reset their `sessionReady` flag (already done in `poseEstimate.estimatePoses`).

### Per-track lifecycle in the video pipeline

ByteTrack can reuse a track ID after counter wraparound. To prevent old state from "sticking" to a new track with the same ID, after each `tracker.update()` we GC against `aliveTrackIds`:

- `trackEmojis` — otherwise the old emoji stays on a new face
- `lastBodyBoxes` — otherwise an old pose-derived box is reused for someone else's body
- `trackEffectWidths` — otherwise stable kernel width transfers between tracks

### Benchmark tool (`src/dev/benchmark.ts`)

In dev mode (`import.meta.env.DEV`), a benchmark module is loaded and exposed as `window.bench`:

- `bench.upscale()` — benchmark all upscale models on the loaded photo
- `bench.face()` — benchmark all face-detect models on a photo or video
- `bench.upscale({ runs: 5 })` — more samples (default 2 + 1 warmup)

The worker is recreated between models (`terminateInferenceWorker`) — multiple WebGPU sessions in one ORT instance share device state and can interfere with each other. Results are printed to the console as Markdown tables.

By default upscale runs on `nomos8ksc`, anonymization on `scrfd-10g`. Upscale always reads the source from `originalImageUrl` (not `currentImageUrl`), to avoid stacking artifacts from chained upscalers.

## Face detection pipeline

### Two-pass strategy

Photo face detection uses two passes for maximum recall:

1. **Global pass** (whole-image letterbox) — `fitCanvasLetterbox()` shrinks the photo to model size (640×640) preserving aspect. Catches large faces (portraits) that span multiple tiles and don't fit any single 640×640 tile or detector anchor scale.

2. **Tiled pass** — standard `splitDetectionTiles()` with overlap 64 px. Catches medium and small faces in group photos.

Results from both passes are merged and deduplicated through NMS. The global pass is skipped for images ≤640×640 (they fit in a single tile without scaling).

### Clamped-linear effect scaling

`scaleKernel()` and `scaleEffectStrength()` in `anonymizeEffects.ts` are shared between the photo and video pipelines (previously duplicated in `anonymizeVideo.ts`).

- **`scaleKernel(userValue, bboxWidth)`** — linear scaling for padding/feather: `userValue × (bboxWidth / 100)`. Calibrated against a 100 px wide face.

- **`scaleEffectStrength(userValue, bboxWidth, minValue)`** — clamped-linear for effect *strength* (blur radius, pixelate block size): `max(1, bboxWidth / 100)`. Faces ≥100 px get linear scaling; faces <100 px keep the slider value (factor ≥1). Net effect: roughly constant pixelate-block count per face for any size ≥100 px. Small faces still get pixels at slider size — they look pixelated, not noisy. Replaces the previous super-linear formula `(faceWidth/100)^1.3`.

- **Symmetric expandBox**: when a face is near the canvas edge, padding is clipped symmetrically on both sides of the axis (previously only the left/top side was clipped, drifting the expanded box right/down — visible mask shifts).

PreviewCanvas now applies the same `scaleKernel`/`scaleEffectStrength` as Apply — preview accurately reflects the result. Default `pixelateSize = 10` (was 16).
