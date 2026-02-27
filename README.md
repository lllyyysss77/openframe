<p align='center'>
  <img src='./apps/desktop/public/logo.svg' alt='Openframe logo' width='120' />
</p>

# Openframe

Openframe is an AI-powered desktop studio for turning scripts into characters, scenes, storyboards, shots, and production-ready videos.

[中文文档](./README.zh.md)

## Highlights

- End-to-end workflow: project -> script -> character/prop/scene -> shots -> production/export
- Script editor with AI toolkit:
  - autocomplete
  - generate script from idea
  - adapt script from novel excerpt
  - scene expand / rewrite / dialogue polish / pacing / continuity check
- Character relation graph with script-driven extraction and optimization
- Language-aware extraction for core entities (character / prop / scene / shot)
- Scene image generation constrained to environment-only output (no people)
- Shot generation supports target shot count input (higher count -> richer, smoother output)
- Thumbnail full-image preview in character / prop / scene / shot panels
- First-launch Driver.js style onboarding tour

## Core Features

1. Project & Episode Management
- Create and organize projects and episodes
- Open dedicated studio window for episode production

2. Script Workspace
- Rich editor powered by TipTap
- AI tools available directly in editor toolbar
- Real-time content save and generation workflow integration

3. Character / Prop / Scene Libraries
- Script-based extraction and regeneration
- AI-assisted enhancement for cards
- Turnaround-style image generation
- Full-image preview by clicking thumbnails

4. Character Relations
- Build relation topology from project scripts
- Optimize relation graph based on current script context

5. Shot Design & Production
- Generate shots from script with scene/character/prop references
- Control target shot count before generation
- Shot image generation and production frames/video workflow
- Export merged video, FCPXML timeline, and EDL

6. Data & Settings
- Configurable AI providers/models (including custom providers)
- Storage usage panel and cleanup for unused media
- Language/theme and local data directory settings

## Tech Stack

- Monorepo: `pnpm workspace`
- Desktop app: `Electron + React + Vite + TypeScript`
- UI: `Tailwind CSS + daisyUI + lucide-react`
- Editor: `TipTap`
- Data layer: `SQLite + better-sqlite3 + Drizzle schema`
- Reactive local state: `TanStack DB`
- AI integration: `Vercel AI SDK + custom REST providers`
- Vector search: `sqlite-vec`

## Repository Layout

```text
openframe/
  apps/
    desktop/                 # main Electron app
      electron/              # main process, IPC handlers
      src/                   # renderer process (React)
  packages/
    db/                      # shared DB schema
    providers/               # AI provider/model definitions
```

## Prerequisites

- Node.js (LTS recommended)
- `pnpm@9.12.2`
- Desktop OS: macOS / Windows / Linux

## Install & Run

```bash
pnpm install
pnpm dev
```

`apps/desktop` runs `electron-rebuild` for `better-sqlite3` during `postinstall`.

## Common Commands

```bash
# root
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm db:generate
pnpm db:migrate

# app type check
pnpm -C apps/desktop exec tsc --noEmit

# single file lint
pnpm -C apps/desktop exec eslint src/components/ScriptEditor.tsx
```

## Architecture Rules

- Renderer must not access DB/filesystem directly.
- Persistence and local file operations must go through `window.*API` from `electron/preload.ts`.
- For any new entity, update this chain together:
  1. `packages/db/schema.ts`
  2. `apps/desktop/electron/handlers/*.ts`
  3. `apps/desktop/electron/preload.ts`
  4. `apps/desktop/electron/electron-env.d.ts`
  5. `apps/desktop/src/db/*_collection.ts`
- Handler SQL uses raw `better-sqlite3`.
- Do not manually edit `apps/desktop/src/routeTree.gen.ts`.

## Database & Migrations

- Runtime DB path: `app.getPath('userData')/app.db`
- Migration folder: `apps/desktop/electron/migrations/`

After schema changes:

```bash
pnpm -C apps/desktop db:generate
```

## i18n

Keep locale files aligned:

- `apps/desktop/src/i18n/locales/en.ts`
- `apps/desktop/src/i18n/locales/zh.ts`

## Troubleshooting

- `No default text model configured`: configure and enable a text model in Settings.
- Native dependency build issues: rerun `pnpm install` and verify `electron-rebuild` success.
- AI or media export issues: verify provider config, model availability, and local media toolchain.
- macOS shows `"<App>" is damaged and can't be opened`:
  - for local unsigned builds only, remove quarantine manually:
    - `xattr -dr com.apple.quarantine /Applications/Openframe.app`
  - for public distribution, ship a signed + notarized app (see release secrets below).

## Release

- Push a tag matching `v*` (for example, `v0.7.0`) to trigger release workflow.
- GitHub Actions builds desktop packages for macOS / Windows / Linux and uploads artifacts to GitHub Release.
- Release notes are auto-generated (`generate_release_notes` in `.github/workflows/release-build.yml`).
- macOS release requires signing secrets:
  - `CSC_LINK`, `CSC_KEY_PASSWORD`
- macOS release also requires notarization credentials (one set is enough):
  - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`
