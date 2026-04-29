# PhotoRestore Web — Архитектура

> 🇬🇧 [English version](./ARCHITECTURE.md)

## Обзор

PhotoRestore Web — полностью клиентское приложение AI-реставрации фотографий:

- **Vite 5 + React 18 + TypeScript 5 (strict)** — UI-фреймворк
- **ONNX Runtime Web (WebGPU + WASM)** — движок ML-инференса
- **Zustand 4** — управление состоянием
- **React Router 6** — маршрутизация
- **Tailwind CSS 3 + shadcn/ui** — стилизация
- **react-i18next** — локализация (EN + RU)
- **Comlink + Web Workers** — инференс вне главного потока
- **Cache API + idb** — хранение моделей и данных

## Ключевые принципы

1. **Без бэкенда** — вся обработка в браузере.
2. **Приватность** — ни изображения, ни данные никогда не покидают устройство.
3. **Прогрессивное улучшение** — WebGPU с fallback на WASM.
4. **Модульные пайплайны** — каждый тип реставрации — независимый пайплайн.

## Структура директорий

```
src/
├── ml/           # ML-инфраструктура (runtime, loader, pipelines, utils)
├── workers/      # Web Workers для инференса вне главного потока
├── store/        # Zustand-стейты
├── routes/       # Страничные компоненты (Home, Editor, About)
├── components/   # UI-компоненты
├── hooks/        # Пользовательские хуки React
├── lib/          # Утилиты (download, heic, imageFile, format)
├── i18n/         # Локализация
└── styles/       # Глобальный CSS
```

### `src/lib/imageFile.ts` — общий входной конвейер изображений

Унифицирует валидацию и конвертацию для Dropzone и кнопки «Открыть другое фото» в редакторе и мастере:

- `readImageFile(file)` — проверка размера (32 МБ max), авто-конвертация HEIC→JPEG через `heicToJpeg()`, финальная проверка MIME-типа
- `PHOTO_ACCEPT_ATTR` — атрибут `accept` для `<input type="file">` (image/png, image/jpeg, image/webp, image/heic, image/heif, .heic, .heif)
- Типизированный результат `{ ok: true, file } | { ok: false, messageKey, description }` — позволяет вызывающим компонентам оставаться UI-независимыми (ключи для toast берутся из i18n)

## Поток данных

### Основной поток загрузки и обработки

```
Пользователь сбрасывает изображение
    ↓
Dropzone (blob URL) → imageFile.readImageFile() → EditorStore.loadNewImage()
    ↓
Клик по инструменту
    ↓
ToolPanel → задание → inference.worker (Comlink)
    ↓
Worker: loadModel (Cache API) → createSession (ORT) → run()
    ↓
EditorStore.pushHistory() ← URL результата
    ↓
ImageCompare (слайдер до/после)
```

### Замороженный источник в мастере анонимизации

Мастер анонимизации всегда работает на **замороженном снимке** исходного фото
(`AnonymizeStore.sourceImageUrl`), а не на живом `EditorStore.currentImageUrl`:

```
Открытие мастера (handleOpenWizard) / «Открыть другое фото»
    ↓
AnonymizeStore.setSourceImageUrl(currentImageUrl)  ← заморозка исходника
    ↓
Все операции (detect, apply, preview) читают sourceImageUrl
    ↓
Повторное Apply с новыми настройками → перерендер с чистого исходника
(без наложения эффектов друг на друга)
```

Это решает проблему «накладывания эффектов друг на друга» (stacking): без
заморозки `Apply → изменить настройки → Apply снова` давало бы двойное
размытие/пикселизацию, так как `currentImageUrl` к тому моменту уже результат
предыдущего Apply.

При закрытии мастера или смене фото `resetForNewImage()` сбрасывает faces/step,
но сохраняет настройки эффектов (blurRadius, padding, modelId и т.д.) —
пользователю не нужно перенастраивать слайдеры.

### Смена фото в редакторе

Кнопка «Открыть другое фото» в редакторе вызывает `EditorStore.loadNewImage(url)`,
которая заменяет **и** `currentImageUrl`, **и** `originalImageUrl`. В отличие от
`setImage()` (сохраняет самую первую загрузку как original), `loadNewImage`
трактует новое фото как «начинаем с чистого листа» — корректное сравнение
до/после и кнопка «Вернуть оригинал» работают относительно актуальной фотографии.

Кнопка «Вернуть оригинал» отображается только когда `currentImageUrl !== originalImageUrl`
(т.е. после обработки, а не сразу после загрузки).

## WebGPU-оптимизации (ORT 1.25.x)

### NCHW-лейаут для ESRGAN-моделей

ONNX Runtime Web 1.25.x ломает кодогенерацию NHWC Conv-ядер для ESRGAN-стиля
моделей (финальный 3-канальный Conv после PixelShuffle-фьюжена). Решение —
NCHW-лейаут через `executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }, 'wasm']`
и `graphOptimizationLevel: 'basic'` (вместо `'all'`). Активируется флагом `preferNchw: true`
в `ModelMeta` для моделей: NMKD Superscale, 4xNomos8kSC, 4xLSDIR-DAT.

Дополнительно эти модели сконвертированы в fp16 (`scripts/convert_fp16.py`) —
внутренние веса/активации float16, вход/выход остаются float32 (keep_io_types=True).

### SCRFD-10G ceil_mode патч

ORT 1.25.1 WebGPU EP не поддерживает Pool-операции с `ceil_mode=1`. В SCRFD-10G
три ResNet-блока даунсемплинга используют `AveragePool`/`MaxPool` с ceil_mode=1.
Патч (`scripts/patch_scrfd_ceil.py` через `onnx`) заменяет ceil_mode на 0 —
для входа 640×640 все промежуточные размеры чётные, поэтому patch математически
эквивалентен оригиналу. Модель загружается как `scrfd_10g_gnkps-nochceil.onnx`.

### Удаление BlazeFace

BlazeFace удалён из реестра, пайплайна детекции и i18n — модель не конвертируется
в WebGPU и не поддерживается ORT 1.25.x (конфликт Concat в JSEP). Оставлены
4 детектора: SCRFD-10G, SCRFD-500M, YuNet 2023, RetinaFace-MobileNet0.25.

### Классы скорости (`speedClass`)

Модели размечены относительной скоростью инференса по результатам
внутрибраузерных бенчмарков (`src/dev/benchmark.ts`):

| Класс | Иконка | Модели |
|-------|--------|--------|
| `fast` | ⚡⚡⚡ | Real-CUGAN (оба), RetinaFace-MBN025 |
| `medium` | ⚡⚡ | Real-ESRGAN x4plus, SCRFD-10G, SCRFD-500M, YuNet 2023 |
| `slow` | ⚡ | NMKD Superscale, 4xNomos8kSC |
| `very-slow` | 🐢 | 4xLSDIR-DAT |

Иконки отображаются в выпадающих списках моделей вместо обобщённой `⚡ GPU`.

### Бенчмарк-инструмент (`src/dev/benchmark.ts`)

В dev-режиме (`import.meta.env.DEV`) загружается бенчмарк, доступный через
`window.bench`:

- `bench.upscale()` — бенчмарк всех upscale-моделей на загруженном фото
- `bench.face()` — бенчмарк всех face-detect моделей на фото или видео
- `bench.upscale({ runs: 5 })` — больше семплов (по умолчанию 2 + 1 warmup)

Между моделями воркер пересоздаётся (`terminateInferenceWorker`) — множественные
WebGPU-сессии в одном ORT-инстансе разделяют состояние устройства и могут
интерферировать друг с другом. Результаты выводятся в консоль в формате Markdown-таблиц.

По умолчанию апскейл теперь запускается на `nomos8ksc`, анонимизация — на `scrfd-10g`.
Upscale всегда читает исходник из `originalImageUrl` (не из `currentImageUrl`), чтобы
избежать наложения цепочек апскейлеров друг на друга (stacking artifacts).
