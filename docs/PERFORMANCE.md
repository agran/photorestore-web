# Performance

> 🇷🇺 [Русская версия](./PERFORMANCE.ru.md)

## Tiling Strategy

Large images are split into overlapping tiles to avoid OOM errors:

- Default tile size: **512×512** input pixels
- Default overlap: **32px** (ensures seamless blending)
- Scale factor: set per-pipeline (e.g. 4 for Real-ESRGAN)

### Cosine-Window Blending

Tiles are blended using a 2D cosine window weight:

```
w(x) = 0.5 - 0.5 * cos(2π * (x+0.5) / N)
```

This produces smooth, seam-free output even with large overlaps.

## Backend Performance

| Backend       | VRAM | Speed  | Notes                                     |
| ------------- | ---- | ------ | ----------------------------------------- |
| WebGPU        | GPU  | Fast   | Chrome/Edge 113+, requires secure context |
| WASM SIMD     | CPU  | Medium | Supported in all modern browsers          |
| WASM fallback | CPU  | Slow   | Maximum compatibility                     |

## Optimization Tips

- Use **tileSize=256** on mobile to reduce peak memory
- For anime content, use `realesrgan-x4plus-anime` (better tuning)
- Enable **SIMD** (default on) for 2–4× WASM speedup
- Models are cached after first download — subsequent runs are instant

## Benchmarks

> TODO: add real benchmarks once pipelines are implemented.

Preliminary estimates for 512×512 → 2048×2048 (Real-ESRGAN x4):

- WebGPU (RTX 3060): ~1.2s
- WASM SIMD (M2): ~8s
- WASM SIMD (i7-1185G7): ~18s
