# Models

> 🇷🇺 [Русская версия](./MODELS.ru.md)

This document describes all ML models planned for PhotoRestore Web, their sources and licenses.

## Model Registry

| ID                        | Name                     | Pipeline     | License      | Size   | Input        | Backend         |
| ------------------------- | ------------------------ | ------------ | ------------ | ------ | ------------ | --------------- |
| `realesrgan-x4plus`       | Real-ESRGAN x4plus       | Upscale      | BSD-3-Clause | 67 MB  | 1×3×128×128  | WebGPU ✅       |
| `nmkd-superscale`         | NMKD Superscale          | Upscale      | BSD-3-Clause | 64 MB  | 1×3×128×128  | WASM (JSEP bug) |
| `nomos8ksc`               | 4xNomos8kSC              | Upscale      | MIT          | 64 MB  | 1×3×128×128  | WASM (JSEP bug) |
| `lsdir-dat`               | 4xLSDIR-DAT              | Upscale      | MIT          | 62 MB  | 1×3×256×256  | WASM (JSEP bug) |
| `cugan-up4x`              | Real-CUGAN Up×4          | Upscale      | MIT          | 2 MB   | 1×3×64×64    | WebGPU ✅       |
| `cugan-up4x-denoise`      | Real-CUGAN Up×4 Denoise  | Upscale      | MIT          | 2 MB   | 1×3×64×64    | WebGPU ✅       |
| `scrfd-500m`              | SCRFD-500M               | Face Detection | MIT        | 2.4 MB | 1×3×640×640  | WebGPU ✅       |
| `scrfd-10g`               | SCRFD-10G-KPS            | Face Detection | Apache-2.0 | 15.5 MB | 1×3×640×640  | WASM (JSEP bug) |
| `yunet-2023`              | YuNet 2023               | Face Detection | MIT        | 0.2 MB | 1×3×640×640  | WebGPU ✅       |
| `retinaface-mbn025`       | RetinaFace-MBN025        | Face Detection | MIT        | 1.7 MB | 1×3×640×640  | WebGPU ✅       |
| `blazeface`               | BlazeFace                 | Face Detection | Apache-2.0 | 0.5 MB | 1×3×128×128  | WebGPU ✅       |
| `gfpgan-v1.4`             | GFPGAN v1.4              | Face Restore | Apache-2.0   | 325 MB | 1×3×512×512  | —               |
| `codeformer`              | CodeFormer               | Face Restore | S-Lab        | 359 MB | 1×3×512×512  | —               |
| `lama`                    | LaMa                     | Inpaint      | Apache-2.0   | 200 MB | 1×4×512×512  | —               |
| `drunet`                  | DRUNet                   | Denoise      | Apache-2.0   | 18 MB  | 1×3×256×256  | —               |
| `drunet-deblock`          | DRUNet Deblock           | Denoise      | Apache-2.0   | 18 MB  | 1×3×256×256  | —               |

## Notes

- All models are served from CDN (`https://www.erudit23.ru/models/`) in production.
- In local dev (`pnpm dev`), models are loaded from `public/models/`.
- Model URLs are configurable in `src/ml/modelRegistry.ts`.
- SHA-256 checksums are verified after download (when provided).
- No model data is included in the repository.
- SCUNet was removed — not available as ONNX. Replaced by DRUNet.
- **WebGPU JSEP bug** (ORT issue #27277): NMKD Superscale, 4xNomos8kSC, and 4xLSDIR-DAT are forced to WASM backend due to known ONNX Runtime WebGPU conv kernel failure on deep RRDBNet graphs. ORT 1.26.0-dev does not include a fix. Will switch to WebGPU when ORT resolves this.
- **NMKD Superscale** was converted from PyTorch `.pth` → ONNX with opset 17, then Constant nodes were moved to initializers to match the working `bukuroo` model structure.
- **4xNomos8kSC** and **4xLSDIR-DAT** were already ONNX from `nesaorg` but had 0 initializers (all Constant) — converted to initializer-based format.
- All models use 0 Constant nodes, matching the stable ONNX graph pattern.
