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
├── lib/          # Утилиты
├── i18n/         # Локализация
└── styles/       # Глобальный CSS
```

## Поток данных

```
Пользователь сбрасывает изображение
    ↓
Dropzone (blob URL) → EditorStore.setImage()
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
