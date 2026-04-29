# Модели

> 🇬🇧 [English version](./MODELS.md)

Этот документ описывает все ML-модели для PhotoRestore Web, их источники и лицензии.

## Реестр моделей

| ID                        | Название                 | Пайплайн        | Лицензия    | Размер | Вход         | Бэкенд          |
| ------------------------- | ------------------------ | --------------- | ----------- | ------ | ------------ | --------------- |
| `realesrgan-x4plus`       | Real-ESRGAN x4plus       | Апскейл         | BSD-3       | 67 МБ  | 1×3×128×128  | WebGPU ✅       |
| `nmkd-superscale`         | NMKD Superscale          | Апскейл         | BSD-3       | 64 МБ  | 1×3×128×128  | WASM (баг JSEP) |
| `nomos8ksc`               | 4xNomos8kSC              | Апскейл         | MIT         | 64 МБ  | 1×3×128×128  | WASM (баг JSEP) |
| `lsdir-dat`               | 4xLSDIR-DAT              | Апскейл         | MIT         | 62 МБ  | 1×3×256×256  | WASM (баг JSEP) |
| `cugan-up4x`              | Real-CUGAN Up×4          | Апскейл         | MIT         | 2 МБ   | 1×3×64×64    | WebGPU ✅       |
| `cugan-up4x-denoise`      | Real-CUGAN Up×4 Denoise  | Апскейл         | MIT         | 2 МБ   | 1×3×64×64    | WebGPU ✅       |
| `scrfd-500m`              | SCRFD-500M               | Скрытие лиц    | MIT         | 2.4 МБ | 1×3×640×640  | WebGPU ✅       |
| `scrfd-10g`               | SCRFD-10G-KPS            | Скрытие лиц    | Apache-2.0  | 15.5 МБ | 1×3×640×640  | WASM (баг JSEP) |
| `yunet-2023`              | YuNet 2023               | Скрытие лиц    | MIT         | 0.2 МБ | 1×3×640×640  | WebGPU ✅       |
| `retinaface-mbn025`       | RetinaFace-MobileNet0.25 | Скрытие лиц    | MIT         | 1.7 МБ | 1×3×640×640  | WebGPU ✅       |
| `blazeface`               | BlazeFace                | Скрытие лиц    | Apache-2.0  | 0.5 МБ | 1×3×128×128  | WebGPU ✅       |
| `gfpgan-v1.4`             | GFPGAN v1.4              | Реставрация лиц | Apache-2.0  | 325 МБ | 1×3×512×512  | —               |
| `codeformer`              | CodeFormer               | Реставрация лиц | S-Lab       | 359 МБ | 1×3×512×512  | —               |
| `lama`                    | LaMa                     | Закраска        | Apache-2.0  | 200 МБ | 1×4×512×512  | —               |
| `drunet`                  | DRUNet                   | Шумоподавление  | Apache-2.0  | 18 МБ  | 1×3×256×256  | —               |
| `drunet-deblock`          | DRUNet Deblock           | Шумоподавление  | Apache-2.0  | 18 МБ  | 1×3×256×256  | —               |

## Примечания

- В production модели загружаются с CDN (`https://www.erudit23.ru/models/`).
- В локальной разработке (`pnpm dev`) модели загружаются из `public/models/`.
- URL-ы моделей настраиваются в `src/ml/modelRegistry.ts`.
- SHA-256 контрольные суммы верифицируются после загрузки.
- Ни одна модель не включена в репозиторий.
- SCUNet удалён — нет готовой ONNX-версии. Заменён на DRUNet.
- **Баг WebGPU JSEP** (ORT issue #27277): NMKD Superscale, 4xNomos8kSC и 4xLSDIR-DAT принудительно используют WASM из-за известной ошибки conv kernel в глубоких RRDBNet-графах. ORT 1.26.0-dev не содержит исправления. Переключим на WebGPU после фикса в ORT.
- **NMKD Superscale** сконвертирован из PyTorch `.pth` → ONNX (opset 17), затем Constant-узлы перенесены в initializers для совместимости с ORT WebGPU.
- **4xNomos8kSC** and **4xLSDIR-DAT** были ONNX от `nesaorg`, но с 0 initializers (все Constant) — переведены в формат на основе initializers.
- Все модели используют 0 Constant-узлов, что соответствует стабильному паттерну ONNX-графа.
