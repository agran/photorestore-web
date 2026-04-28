# Deployment

> 🇷🇺 [Русская версия](./DEPLOYMENT.ru.md)

## GitHub Pages (Automatic)

The `deploy.yml` workflow automatically deploys to GitHub Pages on every push to `main`.

Enable GitHub Pages in your repository settings: **Settings → Pages → Source: GitHub Actions**.

## Manual Build

```bash
pnpm install
pnpm build
# Output in ./dist
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Base path for GitHub Pages deployment | `/` |

For GitHub Pages at `https://user.github.io/photorestore-web/`, set `BASE_URL=/photorestore-web/`.

## COOP/COEP in Production

On static hosting without custom headers, the `coi-serviceworker.js` injects the required COOP/COEP headers. It is automatically registered in `index.html`.

> Note: For hosting that supports custom headers (Cloudflare Pages, Netlify), configure them directly and remove the service worker.
