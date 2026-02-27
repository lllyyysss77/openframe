<p align='center'>
  <img src='./apps/desktop/public/logo.svg' alt='Openframe logo' width='120' />
</p>

# Openframe

Openframe 是一个 AI 驱动的桌面创作工作台，把「剧本 -> 角色/道具/场景 -> 分镜 -> 视频生产与导出」串成一条完整流程。

[English](./README.md)

## 亮点

- 一站式流程：项目 -> 剧本 -> 角色/道具/场景 -> 分镜 -> 生产/导出
- 剧本编辑器内置 AI 工具：
  - 自动补全
  - 根据想法生成剧本
  - 根据小说片段改编剧本
  - 场景扩写 / 重写 / 对白润色 / 节奏诊断 / 连贯性检查
- 人物关系图谱：基于剧本提取并支持按当前剧本优化
- 核心提取链路支持语言对齐（角色 / 道具 / 场景 / 分镜）
- 场景生图约束为纯环境输出（不包含人物）
- 分镜生成支持目标镜头数输入（数量越高，通常越丰富流畅）
- 角色/道具/场景/分镜缩略图支持点击大图预览
- 首次启动提供 Driver.js 风格引导

## 主要功能

1. 项目与剧集管理
- 创建和组织项目、剧集
- 支持独立 Studio 窗口进入制作

2. 剧本工作区
- TipTap 富文本编辑
- AI 工具直接集成在工具栏
- 与后续提取/生图流程联动

3. 角色 / 道具 / 场景库
- 基于剧本提取、补全与覆盖重提
- 卡片信息支持 AI 润色
- 三视图/设定图生成
- 点击缩略图查看完整大图

4. 人物关系图谱
- 从项目剧本构建人物关系拓扑
- 支持基于当前剧本继续优化关系

5. 分镜与生产工作区
- 从剧本生成分镜，保留场景/角色/道具关联
- 可在生成前指定目标镜头数
- 分镜生图、生产帧与视频流程
- 导出合并视频、FCPXML、EDL

6. 设置与数据管理
- AI 供应商/模型可配置（含自定义 Provider）
- 存储占用统计与未使用媒体清理
- 语言、主题、数据目录配置

## 技术栈

- Monorepo：`pnpm workspace`
- 桌面端：`Electron + React + Vite + TypeScript`
- UI：`Tailwind CSS + daisyUI + lucide-react`
- 编辑器：`TipTap`
- 数据层：`SQLite + better-sqlite3 + Drizzle schema`
- 本地响应式状态：`TanStack DB`
- AI 接入：`Vercel AI SDK + 自定义 REST Provider`
- 向量检索：`sqlite-vec`

## 目录结构

```text
openframe/
  apps/
    desktop/                 # 主 Electron 应用
      electron/              # 主进程与 IPC handlers
      src/                   # 渲染进程（React）
  packages/
    db/                      # 共享数据库 schema
    providers/               # AI provider / model 定义
```

## 环境要求

- Node.js（建议 LTS）
- `pnpm@9.12.2`
- macOS / Windows / Linux

## 安装与启动

```bash
pnpm install
pnpm dev
```

`apps/desktop` 在 `postinstall` 会执行 `electron-rebuild`（`better-sqlite3`）。

## 常用命令

```bash
# 根目录
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm db:generate
pnpm db:migrate

# 应用类型检查
pnpm -C apps/desktop exec tsc --noEmit

# 单文件 lint
pnpm -C apps/desktop exec eslint src/components/ScriptEditor.tsx
```

## 架构约束

- 渲染层不能直接访问 DB / 文件系统。
- 持久化与文件操作必须走 `electron/preload.ts` 暴露的 `window.*API`。
- 新增实体时需同步更新以下链路：
  1. `packages/db/schema.ts`
  2. `apps/desktop/electron/handlers/*.ts`
  3. `apps/desktop/electron/preload.ts`
  4. `apps/desktop/electron/electron-env.d.ts`
  5. `apps/desktop/src/db/*_collection.ts`
- Handler SQL 使用原生 `better-sqlite3`。
- 不要手改 `apps/desktop/src/routeTree.gen.ts`。

## 数据库与迁移

- 运行时数据库：`app.getPath('userData')/app.db`
- 迁移目录：`apps/desktop/electron/migrations/`

修改 schema 后执行：

```bash
pnpm -C apps/desktop db:generate
```

## i18n

新增文案需同时更新：

- `apps/desktop/src/i18n/locales/en.ts`
- `apps/desktop/src/i18n/locales/zh.ts`

## 常见问题

- `No default text model configured`：先在设置中配置并启用文本模型。
- 原生依赖构建失败：重跑 `pnpm install`，确认 `electron-rebuild` 成功。
- AI / 媒体导出失败：检查 Provider 配置、模型可用性与本地媒体工具链。
- macOS 提示 `“Openframe”已损坏，无法打开`：
  - 仅本地未签名构建可临时移除隔离属性后启动：
    - `xattr -dr com.apple.quarantine /Applications/Openframe.app`
  - 面向公开分发请务必使用签名 + 公证（见下方发布凭据）。

## 发布

- 推送 `v*` tag（如 `v0.7.0`）会触发发布流程。
- GitHub Actions 会构建 macOS / Windows / Linux 安装包并上传到 GitHub Release。
- Release Notes 自动生成（`.github/workflows/release-build.yml` 中 `generate_release_notes`）。
- macOS 发布需要签名凭据：
  - `CSC_LINK`、`CSC_KEY_PASSWORD`
- macOS 发布还需要公证凭据（满足任一组即可）：
  - `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`
  - 或 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`
