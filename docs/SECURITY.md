# Security

> 🇷🇺 [Русская версия](./SECURITY.ru.md)

## Privacy Guarantee

**PhotoRestore Web processes all images 100% locally in your browser.**

- No images are uploaded to any server.
- No telemetry or analytics are collected.
- No user accounts or authentication are required.
- No third-party tracking scripts are included.

## COOP / COEP Headers

To enable `SharedArrayBuffer` for WASM multi-threading, the application sets:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These headers are set in:

1. `vite.config.ts` (development server)
2. `public/coi-serviceworker.js` (production, injects headers via Service Worker)

## Model Downloads

Models are downloaded from HuggingFace and verified with SHA-256 checksums before use. Downloaded models are stored in the browser's Cache API and never leave the device.

## Reporting Vulnerabilities

Please report security issues via GitHub Issues with the `security` label, or email the maintainers directly.
