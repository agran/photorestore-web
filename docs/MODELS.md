# Models

> 🇷🇺 [Русская версия](./MODELS.ru.md)

This document describes all ML models planned for PhotoRestore Web, their sources and licenses.

## Model Registry

| ID | Name | Pipeline | License | Size | Source |
|----|------|----------|---------|------|--------|
| `realesrgan-x4plus` | Real-ESRGAN x4plus | Upscale | BSD-3-Clause | ~64 MB | [GitHub](https://github.com/xinntao/Real-ESRGAN) |
| `realesrgan-x4plus-anime` | Real-ESRGAN x4plus Anime | Upscale | BSD-3-Clause | ~64 MB | [GitHub](https://github.com/xinntao/Real-ESRGAN) |
| `gfpgan-v1.4` | GFPGAN v1.4 | Face Restore | Apache-2.0 | ~332 MB | [GitHub](https://github.com/TencentARC/GFPGAN) |
| `codeformer` | CodeFormer | Face Restore | S-Lab License 1.0 | ~357 MB | [GitHub](https://github.com/sczhou/CodeFormer) |
| `lama` | LaMa | Inpaint | Apache-2.0 | ~200 MB | [GitHub](https://github.com/advimman/lama) |
| `scunet` | SCUNet | Denoise | Apache-2.0 | ~143 MB | [GitHub](https://github.com/cszn/SCUNet) |

## Notes

- All models are served as ONNX format.
- Models are downloaded on demand and cached in the browser's Cache API.
- SHA-256 checksums are verified after download.
- No model data is included in the repository.
