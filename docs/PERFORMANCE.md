# Performance

> 🇷🇺 [Русская версия](./PERFORMANCE.ru.md)

## Tiling Strategy

Large images are split into overlapping tiles to avoid OOM:

- Default tile size: **512×512** input pixels
- Default overlap: **32px** (ensures seamless blending)
- Scale factor: set per-pipeline (e.g. 4 for Real-ESRGAN)

### Streaming tile processing

API: `planTiles` (coordinates only) → `extractTile` (one canvas on the fly) → `TileMerger.addTile` → `TileMerger.finalize`. Tiles are created and disposed one at a time, instead of allocating an array up-front before inference begins.

Peak memory for 4× upscale of a 4K photo: ~2.6 GB (5 Float32Array accumulators of size `outW × outH` plus one in-flight input/output canvas). For 8K → ~10.6 GB — input ≤4K is recommended on devices with <8 GB RAM. Future optimization: row-band streaming on top of `TileMerger`.

### Cosine-Window Blending

Tiles are blended with a 2D cosine window:

```
w(x) = 0.5 - 0.5 * cos(2π * (x+0.5) / N)
```

This produces a smooth, seamless result even with large overlaps.

## Backend Performance

| Backend       | VRAM | Speed  | Notes                                         |
| ------------- | ---- | ------ | --------------------------------------------- |
| WebGPU        | GPU  | Fast   | Chrome/Edge 113+, requires secure context     |
| WASM SIMD     | CPU  | Medium | Supported by all modern browsers              |
| WASM fallback | CPU  | Slow   | Maximum compatibility                         |

## Hot loops

Tensor conversions (`canvasToNCHW`, `nchwToCanvas`, `prepareOrtInput`, `prepareRawInput`, `prepareRetinaFaceInput`, `prepareInput` for pose) are critical performance hotspots. All six are written in canonical form:

- pre-computed `inv255 = 1/255` (multiplication beats division in a hot loop)
- pointer walk `pi += 4` instead of `i * 4 + offset` per iteration
- loop-invariant plane offsets hoisted out of the inner loop (V8 scalar replacement)

Bench on M1: ~1.5–2× speedup on a 512×512 tile. For 4K upscale with 256 tiles, that's ~50–100 ms saved.

## Memory management

- **Inference worker** — single shared singleton ([inferenceClient.ts](../src/ml/inferenceClient.ts)). All ONNX sessions live on one WebGPU device, no VRAM contention. On worker crash (`error` event) — auto-respawn.
- **Blob URLs** — every blob URL is explicitly revoked: editorStore (history evictions, reset, loadNewImage), videoAnonymizeStore (videoUrl, outputUrl, thumbnailUrls on reset/setFile/loadFile/editAgain/enterReview), Dropzone (preview on file change + unmount), PreviewCanvas (every update + unmount).
- **MediaRecorder fallback** — `start(1000)` timeslice, so the encoder doesn't buffer the entire video blob until stop().
- **Pre-allocated detect canvas** in video — one canvas through the entire pipeline with `clearRect` before each `sample.draw` (instead of `createElement` per keyframe). On 1080p30 in Accurate mode this saves ~240 MB/s of allocations.

## Optimization Tips

- Use **tileSize=256** on mobile to lower peak memory
- For animated content use `realesrgan-x4plus-anime`
- Enable **SIMD** (default on) for 2–4× WASM speedup
- Models are cached after first download — subsequent runs are instant (on cache hit `onProgress` jumps straight to 100%, UI doesn't hang at 0%)

## Benchmarks

The in-browser tool `window.bench` is available in dev mode (`pnpm dev`):

- `bench.upscale()` — all upscale models on the loaded photo
- `bench.face()` — all face-detect models on a photo or video
- `bench.upscale({ runs: 5 })` — more samples

The worker is recreated between models (`terminateInferenceWorker`) — multiple WebGPU sessions in a single ORT instance share device state. Results print to the console as Markdown tables.
