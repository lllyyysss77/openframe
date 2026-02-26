# Openframe English Documentation

Openframe is a desktop app for AI-assisted short-film production, covering script writing, character/scene/shot planning, and final media export.

[中文](./README.zh.md)

## 1. Overview

Openframe is a desktop app for AI-assisted short-film production, covering script writing, character/scene/shot planning, and final media export.

## 2. Key Features

- Project and episode management
- Script editor with AI tools:
  - scene expand / rewrite / dialogue polish
  - pacing and continuity checks
  - autocomplete
  - generate script from an idea
  - generate script from a novel excerpt
- Character library and scene library with AI image generation
- Shot planning and production workspace
- Video export (merged video) and timeline export (FCPXML/EDL)
- Data panel with media size stats and cleanup for unused files
- Configurable AI providers, including custom providers

## 3. Stack

- Monorepo: `pnpm workspaces`
- App: `Electron + React + Vite + TypeScript`
- DB: `SQLite + better-sqlite3` with shared Drizzle schema
- Editor: `TipTap`
- AI: `Vercel AI SDK` + custom REST providers
- Vector search: `sqlite-vec`

## 4. Repository Layout

```text
openframe/
  apps/desktop/              # main Electron app
  packages/db/               # shared DB schema
  packages/providers/        # AI provider definitions
```

## 5. Prerequisites

- Node.js (LTS recommended)
- `pnpm@9.12.2`
- Desktop OS: macOS / Windows / Linux

## 6. Install & Run

```bash
pnpm install
pnpm dev
```

`apps/desktop` runs `electron-rebuild` for `better-sqlite3` in `postinstall`.

## 7. Common Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm db:generate
pnpm db:migrate

pnpm -C apps/desktop exec tsc --noEmit
pnpm -C apps/desktop exec eslint src/components/ScriptEditor.tsx
```

## 8. Architecture Rules

- Renderer must not access DB/filesystem directly.
- All persistence/file operations go through `window.*API` from `electron/preload.ts`.
- For any new entity, update schema, handlers, preload bridge, type declarations, and renderer collections together.
- Handler SQL uses raw `better-sqlite3`.
- Do not edit `apps/desktop/src/routeTree.gen.ts` manually.

## 9. Database & Migrations

- Runtime DB path: `app.getPath('userData')/app.db`
- Migration folder: `apps/desktop/electron/migrations/`
- After schema changes:

```bash
pnpm -C apps/desktop db:generate
```

## 10. i18n

Keep locale files in sync:

- `apps/desktop/src/i18n/locales/en.ts`
- `apps/desktop/src/i18n/locales/zh.ts`

## 11. Troubleshooting

- `No default text model configured`: configure and enable a text model in Settings.
- Native dependency issues: re-run `pnpm install` and ensure `electron-rebuild` succeeds.
- AI/export failures: check provider config, model availability, and local media toolchain health.
