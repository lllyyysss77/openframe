# Openframe 中文文档

Openframe 是一个面向短剧/影视创作的桌面应用，覆盖从剧本、角色、场景、分镜到视频生成与导出的完整流程。  
项目使用 Electron + React + TypeScript，数据持久化基于 SQLite，AI 能力通过可配置的多供应商模型接入。

[English](./README.en.md)

## 1. 项目简介

Openframe 是一个面向短剧/影视创作的桌面应用，覆盖从剧本、角色、场景、分镜到视频生成与导出的完整流程。  
项目使用 Electron + React + TypeScript，数据持久化基于 SQLite，AI 能力通过可配置的多供应商模型接入。

## 2. 主要功能

- 项目与剧集管理
- 剧本编辑器（AI 场景扩写、重写、对白润色、节奏/连贯性检查、自动补全）
- 剧本编辑器工具栏支持：
  - 根据想法生成剧本
  - 根据小说片段生成剧本
- 角色库 / 场景库 / 分镜管理（支持 AI 辅助生成图片）
- 视频面板（镜头视频生成、合并导出）
- 导出时间线文件（FCPXML、EDL）
- 数据面板展示存储占用并支持清理未使用媒体文件
- AI Provider 配置（含自定义 Provider）

## 3. 技术栈

- Monorepo: `pnpm workspace`
- Desktop: `Electron + Vite + React + TypeScript`
- UI: `Tailwind CSS + daisyUI + lucide-react`
- Editor: `TipTap`
- Data: `SQLite + better-sqlite3 + Drizzle schema`
- Local reactive state: `TanStack DB`
- AI: `Vercel AI SDK + 自定义 REST Provider`
- Vector search: `sqlite-vec`

## 4. 目录结构

```text
openframe/
  apps/
    desktop/                 # Electron 应用
      electron/              # 主进程与 IPC handlers
      src/                   # 渲染进程（React）
  packages/
    db/                      # 共享数据库 schema
    providers/               # AI provider 定义与模型工厂
```

## 5. 环境要求

- Node.js（建议 LTS）
- `pnpm@9.12.2`（见根 `package.json`）
- macOS / Windows / Linux（Electron 桌面环境）

## 6. 安装与启动

在仓库根目录执行：

```bash
pnpm install
pnpm dev
```

`apps/desktop` 在 `postinstall` 阶段会自动执行 `electron-rebuild`（`better-sqlite3`）。

## 7. 常用命令

```bash
# 根目录
pnpm dev
pnpm build
pnpm lint
pnpm db:generate
pnpm db:migrate

# 类型检查（当前推荐验证方式）
pnpm -C apps/desktop exec tsc --noEmit

# 单文件 lint
pnpm -C apps/desktop exec eslint src/components/ScriptEditor.tsx
```

## 8. 数据与架构约束（开发必读）

- 渲染层不能直接访问数据库/文件系统，必须通过 `window.*API`（`preload.ts` 暴露）访问。
- 新增实体时请按链路更新：
  1. `packages/db/schema.ts`
  2. `apps/desktop/electron/handlers/*.ts`
  3. `apps/desktop/electron/preload.ts`
  4. `apps/desktop/electron/electron-env.d.ts`
  5. `apps/desktop/src/db/*_collection.ts`
- Handler 内数据库读写使用 `better-sqlite3` 原生 SQL。
- 不要手改 `apps/desktop/src/routeTree.gen.ts`（自动生成）。

## 9. 数据库与迁移

- 运行时数据库：`app.getPath('userData')/app.db`
- 迁移目录：`apps/desktop/electron/migrations/`
- 修改 `packages/db/schema.ts` 后需要生成并提交迁移文件：

```bash
pnpm -C apps/desktop db:generate
```

## 10. i18n 规范

- 文案位于：
  - `apps/desktop/src/i18n/locales/en.ts`
  - `apps/desktop/src/i18n/locales/zh.ts`
- 新增 key 时，必须中英文同步。

## 11. 常见问题

- `No default text model configured`：在设置页先配置并启用文本模型。
- 原生依赖构建失败：重新执行 `pnpm install`，确认 `electron-rebuild` 成功。
- AI 或媒体导出失败：优先检查 Provider 配置、模型可用性、以及本地 FFmpeg/媒体处理依赖状态。
