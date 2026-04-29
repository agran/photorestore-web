# PhotoRestore Web

> 🇷🇺 [Русская версия](./README.ru.md)

AI-powered photo restoration running entirely in your browser — no backend, no data uploaded.

**Live Demo:** [agran.github.io/photorestore-web](https://agran.github.io/photorestore-web/)

[![CI](https://github.com/agran/photorestore-web/actions/workflows/ci.yml/badge.svg)](https://github.com/agran/photorestore-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## Features

- **4× Super Resolution** — Real-ESRGAN, Real-CUGAN, NMKD Superscale, 4xNomos8kSC, 4xLSDIR-DAT
- **Hide Faces** — Blur, pixelate, solid fill, emoji overlay with interactive face editing
- **Face Restoration** — GFPGAN / CodeFormer (coming soon)
- **AI Inpainting** — LaMa (coming soon)
- **Smart Denoising** — DRUNet (coming soon)
- **100% Private** — everything runs locally in WebGPU/WASM
- **Bilingual UI** — English & Russian
- **Mobile-friendly** — responsive layout, touch support

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Tech Stack

Vite 5 · React 18 · TypeScript 5 · Tailwind CSS 3 · shadcn/ui · Zustand 4 · ONNX Runtime Web · react-i18next · Comlink

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Models & Licenses](./docs/MODELS.md)
- [Performance & Tiling](./docs/PERFORMANCE.md)
- [Security & Privacy](./docs/SECURITY.md)
- [Roadmap](./docs/ROADMAP.md)
- [Contributing](./docs/CONTRIBUTING.md)
- [Deployment](./docs/DEPLOYMENT.md)

## License

MIT — see [LICENSE](./LICENSE).
