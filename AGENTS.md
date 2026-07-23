# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the Vue 3 + TypeScript app code, with `components/`, `composables/`, `services/`, `state/`, `types/`, and `utils/` split by concern.
- `src/assets/` and `public/` contain static assets used by the UI and PWA.
- `e2e/` contains Playwright end-to-end specs.
- `scripts/` includes helper scripts (e.g., `copyOpenIM.ts`).
- `build/` and `dev-dist/` are build outputs; don’t edit manually.
- `doc/` stores architecture notes and ADRs.

## Build, Test, and Development Commands
Use Bun as the package manager.
- `bun install` installs dependencies.
- `bun run start:dev` starts the Vite dev server.
- `bun run start` previews the production build locally.
- `bun run build` runs type-checking and builds the app.
- `bun run build:lib` builds the library bundle for publishing.
- `bun run lint` runs `vue-tsc` and ESLint.
- `bun run format` runs Prettier over `src/` and `scripts/`.
- `bun run test:e2e` runs Playwright tests; `bun run test:e2e:ui` opens the UI runner.

## Coding Style & Naming Conventions
- Indentation: 2 spaces, no tabs. Strings use single quotes where applicable.
- Vue components use PascalCase filenames (e.g., `ChatContainer.ce.vue`).
- Functions/variables use camelCase. Non-component files prefer kebab-case.
- Use BEM-like CSS class naming when adding complex styles.
- `data-testid` attributes follow `${props.dataTestid}-Element-Modifier`.
- Format with Prettier and keep comments minimal, focused on “why.”
- Do not translate existing Russian comments, logs, or user-facing/error messages to English. New comments, logs, and errors that belong to existing Russian-facing flows should stay in Russian.

## Testing Guidelines
- E2E tests are written with Playwright in `e2e/` and named `*.spec.ts`.
- Prefer adding tests for user-critical flows and regressions.
- Run `bun run test:e2e` before opening a PR that changes UI behavior.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (e.g., `feat: add chat toolbar`).
- Commits should explain why the change was made and what’s new.
- Keep commits scoped to the files you changed.
- PRs should include a clear summary, steps to test, and screenshots/GIFs for UI changes.

## Configuration Tips
- Build output is controlled by Vite (`vite.config.ts`) and PWA assets by `pwa-assets.config.ts`.
- `lefthook.toml` installs Git hooks; run `bun run prepare` if hooks are missing.
