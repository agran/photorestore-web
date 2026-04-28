# Участие в разработке

> 🇬🇧 [English version](./CONTRIBUTING.md)

## Начало работы

1. Форкните и клонируйте репозиторий
2. Убедитесь, что установлены Node 20 и pnpm 9+
3. Выполните `pnpm install`
4. Запустите `pnpm dev` для сервера разработки

## Рабочий процесс

```bash
pnpm dev          # Сервер разработки
pnpm build        # Продакшн-сборка
pnpm typecheck    # Проверка типов TypeScript
pnpm lint         # ESLint
pnpm test         # Юнит-тесты (Vitest)
pnpm test:e2e     # E2E-тесты (Playwright)
```

## Стиль кода

- TypeScript strict mode — никаких `any` без обоснования
- ESLint + Prettier, применяемые через Husky pre-commit hooks
- Файлы компонентов: PascalCase, утилиты: camelCase
- Тесты рядом с исходниками или в директории `tests/`

## Отправка изменений

1. Создайте ветку: `git checkout -b feature/my-feature`
2. Внесите изменения и добавьте тесты
3. Запустите `pnpm test` и `pnpm build` для проверки
4. Откройте Pull Request в `main`

## Вклад в ML-пайплайны

При добавлении нового пайплайна:

1. Добавьте модель в `src/ml/modelRegistry.ts`
2. Реализуйте пайплайн в `src/ml/pipelines/`
3. Подключите его в `ToolPanel.tsx`
4. Добавьте ключи локализации в `en.json` и `ru.json`
