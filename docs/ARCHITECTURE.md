# PhotoRestore Web — Architecture

> 🇷🇺 [Русская версия](./ARCHITECTURE.ru.md)

## Overview

PhotoRestore Web is a fully client-side AI photo restoration application built with:

- **Vite 5 + React 18 + TypeScript 5 (strict)** — UI framework
- **ONNX Runtime Web (WebGPU + WASM)** — ML inference engine
- **Zustand 4** — state management
- **React Router 6** — routing
- **Tailwind CSS 3 + shadcn/ui** — styling
- **react-i18next** — i18n (EN + RU)
- **Comlink + Web Workers** — off-main-thread inference
- **Cache API + idb** — model and data persistence

## Key Principles

1. **No Backend** — All processing happens in the browser.
2. **Privacy-First** — No images or data ever leave the user's device.
3. **Progressive Enhancement** — WebGPU with WASM fallback.
4. **Modular Pipelines** — Each restoration type is an independent pipeline.

## Directory Structure

```
src/
├── ml/           # ML infrastructure (runtime, loader, pipelines, utils)
├── workers/      # Web Workers for off-main-thread inference
├── store/        # Zustand stores
├── routes/       # Page components (Home, Editor, About)
├── components/   # UI components
├── hooks/        # Custom React hooks
├── lib/          # Utility functions
├── i18n/         # Localization
└── styles/       # Global CSS
```

## Data Flow

```
User drops image
    ↓
Dropzone (blob URL) → EditorStore.setImage()
    ↓
User clicks pipeline tool
    ↓
ToolPanel → dispatch job → inference.worker (Comlink)
    ↓
Worker: loadModel (Cache API) → createSession (ORT) → run()
    ↓
EditorStore.pushHistory() ← result canvas URL
    ↓
ImageCompare (before/after slider)
```

## ML Pipeline Architecture

Each pipeline in `src/ml/pipelines/` follows the same interface:

- Takes `HTMLCanvasElement` + options
- Returns `Promise<{ canvas: HTMLCanvasElement, ... }>`
- Internally uses `tiling.ts` for large images and `tensor.ts` for conversions

## Backend Detection

```
detectBackend() →
  navigator.gpu.requestAdapter() → "webgpu"
  fallback →  "wasm"
```
