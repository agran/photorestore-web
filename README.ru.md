# PhotoRestore Web

> 🇬🇧 [English version](./README.md)

AI-реставрация фотографий прямо в браузере — без бэкенда, без загрузки данных.

[![CI](https://github.com/agran/photorestore-web/actions/workflows/ci.yml/badge.svg)](https://github.com/agran/photorestore-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## Возможности

- **Увеличение разрешения ×4** — Real-ESRGAN, Real-CUGAN, NMKD Superscale, 4xNomos8kSC, 4xLSDIR-DAT
- **Скрытие лиц** — Размытие, пикселизация, заливка, эмодзи с интерактивным редактированием
- **Восстановление лиц** — GFPGAN / CodeFormer (скоро)
- **ИИ-закраска** — LaMa (скоро)
- **Шумоподавление** — DRUNet (скоро)
- **100% конфиденциально** — всё работает локально в WebGPU/WASM
- **Двуязычный интерфейс** — английский и русский
- **Мобильная версия** — адаптивная вёрстка, поддержка касаний

## Быстрый старт

```bash
pnpm install
pnpm dev
```

Откройте [http://localhost:5173](http://localhost:5173).

## Технологический стек

Vite 5 · React 18 · TypeScript 5 · Tailwind CSS 3 · shadcn/ui · Zustand 4 · ONNX Runtime Web · react-i18next · Comlink

## Документация

- [Архитектура](./docs/ARCHITECTURE.ru.md)
- [Модели и лицензии](./docs/MODELS.ru.md)
- [Производительность и тайлинг](./docs/PERFORMANCE.ru.md)
- [Безопасность и конфиденциальность](./docs/SECURITY.ru.md)
- [Дорожная карта](./docs/ROADMAP.ru.md)
- [Участие в разработке](./docs/CONTRIBUTING.ru.md)
- [Деплой](./docs/DEPLOYMENT.ru.md)

## Лицензия

MIT — см. [LICENSE](./LICENSE).
