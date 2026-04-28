# Contributing

> 🇷🇺 [Русская версия](./CONTRIBUTING.ru.md)

## Getting Started

1. Fork & clone the repository
2. Ensure Node 20 and pnpm 9+ are installed
3. Run `pnpm install`
4. Run `pnpm dev` for development server

## Development Workflow

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm typecheck    # TypeScript type checking
pnpm lint         # ESLint
pnpm test         # Unit tests (Vitest)
pnpm test:e2e     # E2E tests (Playwright)
```

## Code Style

- TypeScript strict mode — no `any` without justification
- ESLint + Prettier enforced via Husky pre-commit hooks
- Component files: PascalCase, utility files: camelCase
- Tests alongside source or in `tests/` directory

## Submitting Changes

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes and add tests
3. Run `pnpm test` and `pnpm build` to verify
4. Open a Pull Request against `main`

## ML Pipeline Contributions

When adding a new pipeline:

1. Add the model to `src/ml/modelRegistry.ts`
2. Implement the pipeline in `src/ml/pipelines/`
3. Wire it into `ToolPanel.tsx`
4. Add localization keys to `en.json` and `ru.json`
