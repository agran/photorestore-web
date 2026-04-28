# Модели

> 🇬🇧 [English version](./MODELS.md)

Этот документ описывает все ML-модели, запланированные для PhotoRestore Web, их источники и лицензии.

## Реестр моделей

| ID | Название | Пайплайн | Лицензия | Размер | Источник |
|----|----------|----------|---------|--------|---------|
| `realesrgan-x4plus` | Real-ESRGAN x4plus | Апскейл | BSD-3-Clause | ~64 МБ | [GitHub](https://github.com/xinntao/Real-ESRGAN) |
| `realesrgan-x4plus-anime` | Real-ESRGAN x4plus Anime | Апскейл | BSD-3-Clause | ~64 МБ | [GitHub](https://github.com/xinntao/Real-ESRGAN) |
| `gfpgan-v1.4` | GFPGAN v1.4 | Реставрация лиц | Apache-2.0 | ~332 МБ | [GitHub](https://github.com/TencentARC/GFPGAN) |
| `codeformer` | CodeFormer | Реставрация лиц | S-Lab License 1.0 | ~357 МБ | [GitHub](https://github.com/sczhou/CodeFormer) |
| `lama` | LaMa | Закраска | Apache-2.0 | ~200 МБ | [GitHub](https://github.com/advimman/lama) |
| `scunet` | SCUNet | Шумоподавление | Apache-2.0 | ~143 МБ | [GitHub](https://github.com/cszn/SCUNet) |

## Примечания

- Все модели используются в формате ONNX.
- Модели загружаются по требованию и кэшируются в Cache API браузера.
- SHA-256 контрольные суммы верифицируются после загрузки.
- Ни одна модель не включена в репозиторий.
