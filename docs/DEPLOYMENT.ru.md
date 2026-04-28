# Деплой

> 🇬🇧 [English version](./DEPLOYMENT.md)

## GitHub Pages (автоматически)

Workflow `deploy.yml` автоматически деплоит на GitHub Pages при каждом пуше в `main`.

Включите GitHub Pages в настройках репозитория: **Settings → Pages → Source: GitHub Actions**.

## Ручная сборка

```bash
pnpm install
pnpm build
# Результат в ./dist
```

## Переменные окружения

| Переменная | Описание                      | По умолчанию |
| ---------- | ----------------------------- | ------------ |
| `BASE_URL` | Базовый путь для GitHub Pages | `/`          |

Для GitHub Pages по адресу `https://user.github.io/photorestore-web/` установите `BASE_URL=/photorestore-web/`.

## COOP/COEP в продакшне

На статическом хостинге без настраиваемых заголовков `coi-serviceworker.js` добавляет необходимые заголовки COOP/COEP через Service Worker.

> Примечание: для хостинга с поддержкой пользовательских заголовков (Cloudflare Pages, Netlify) настройте их напрямую и удалите service worker.
