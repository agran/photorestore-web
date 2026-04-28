# Модели

> 🇬🇧 [English version](./MODELS.md)

Этот документ описывает все ML-модели для PhotoRestore Web, их источники и лицензии.

## Реестр моделей

| ID                        | Название                 | Пайплайн        | Лицензия    | Размер | Вход       | Источник                                     |
| ------------------------- | ------------------------ | --------------- | ----------- | ------ | ---------- | -------------------------------------------- |
| `realesrgan-x4plus`       | Real-ESRGAN x4plus       | Апскейл         | BSD-3       | 85 МБ  | 1×3×64×64 | `imgdesignart/realesrgan-x4-onnx` (HF)       |
| `realesrgan-x4plus-anime` | Real-ESRGAN x4plus Anime | Апскейл         | BSD-3       | 85 МБ  | 1×3×64×64 | `imgdesignart/realesrgan-x4-onnx` (HF)       |
| `cugan-up4x`              | Real-CUGAN Up×4          | Апскейл         | MIT         | 2 МБ   | 1×3×64×64 | `AmusementClub/vs-mlrt` (GitHub)             |
| `cugan-up4x-denoise`      | Real-CUGAN Up×4 Denoise  | Апскейл         | MIT         | 2 МБ   | 1×3×64×64 | `AmusementClub/vs-mlrt` (GitHub)             |
| `gfpgan-v1.4`             | GFPGAN v1.4              | Реставрация лиц | Apache-2.0  | 325 МБ | 1×3×512×512 | `neurobytemind/GFPGANv1.4.onnx` (HF)        |
| `codeformer`              | CodeFormer               | Реставрация лиц | S-Lab       | 359 МБ | 1×3×512×512 | `bluefoxcreation/Codeformer-ONNX` (HF)       |
| `lama`                    | LaMa                     | Закраска        | Apache-2.0  | 200 МБ | 1×4×512×512 | `Carve/LaMa-ONNX` (HF)                       |
| `drunet`                  | DRUNet                   | Шумоподавление  | Apache-2.0  | 18 МБ  | 1×3×256×256 | `AmusementClub/vs-mlrt` (GitHub)             |
| `drunet-deblock`          | DRUNet Deblock           | Шумоподавление  | Apache-2.0  | 18 МБ  | 1×3×256×256 | `AmusementClub/vs-mlrt` (GitHub)             |

## Примечания

- Все модели используются в формате ONNX.
- Модели размещаются в `public/models/` и загружаются с того же источника.
- URL-ы моделей настраиваются в `src/ml/modelRegistry.ts`.
- SHA-256 контрольные суммы верифицируются после загрузки.
- Ни одна модель не включена в репозиторий.
- SCUNet удалён — нет готовой ONNX-версии. Заменён на DRUNet.
