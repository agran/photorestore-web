# Models

> 🇷🇺 [Русская версия](./MODELS.ru.md)

This document describes all ML models planned for PhotoRestore Web, their sources and licenses.

## Model Registry

| ID                        | Name                     | Pipeline     | License      | Size   | Input       | Source                                         |
| ------------------------- | ------------------------ | ------------ | ------------ | ------ | ----------- | ---------------------------------------------- |
| `realesrgan-x4plus`       | Real-ESRGAN x4plus       | Upscale      | BSD-3-Clause | 67 MB  | 1×3×128×128 | `bukuroo/RealESRGAN-ONNX` (HF)                 |
| `cugan-up4x`              | Real-CUGAN Up×4          | Upscale      | MIT          | 2 MB   | 1×3×64×64   | `AmusementClub/vs-mlrt` (GitHub)               |
| `cugan-up4x-denoise`      | Real-CUGAN Up×4 Denoise  | Upscale      | MIT          | 2 MB   | 1×3×64×64   | `AmusementClub/vs-mlrt` (GitHub)               |
| `gfpgan-v1.4`             | GFPGAN v1.4              | Face Restore | Apache-2.0   | 325 MB | 1×3×512×512 | `neurobytemind/GFPGANv1.4.onnx` (HF)          |
| `codeformer`              | CodeFormer               | Face Restore | S-Lab        | 359 MB | 1×3×512×512 | `bluefoxcreation/Codeformer-ONNX` (HF)         |
| `lama`                    | LaMa                     | Inpaint      | Apache-2.0   | 200 MB | 1×4×512×512 | `Carve/LaMa-ONNX` (HF)                         |
| `drunet`                  | DRUNet                   | Denoise      | Apache-2.0   | 18 MB  | 1×3×256×256 | `AmusementClub/vs-mlrt` (GitHub)               |
| `drunet-deblock`          | DRUNet Deblock           | Denoise      | Apache-2.0   | 18 MB  | 1×3×256×256 | `AmusementClub/vs-mlrt` (GitHub)               |

## Notes

- All models are served as ONNX format.
- Models are placed in `public/models/` and loaded from the same origin.
- Model URLs are configurable in `src/ml/modelRegistry.ts`.
- SHA-256 checksums are verified after download (when provided).
- No model data is included in the repository.
- SCUNet was removed — not available as ONNX. Replaced by DRUNet.
