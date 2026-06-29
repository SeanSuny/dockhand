# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 本文档为**简体中文**。代码标识符、命令、产品名保持原文。

## 本分支定位（feature/i18n）

**本分支唯一工作：开发 i18n 功能并把 UI 汉化（en → zh-CN）。** 不做与翻译无关的功能、重构、修 bug。

汉化**远未完成**：`src/routes` 下约 118 个 `.svelte`，目前仅约 11 个接入了翻译。后续任务就是按下文工作流，把剩余页面逐个接入。速查版见仓库内 [`docs/i18n-workflow.md`](docs/i18n-workflow.md)（协作者可直接查阅）。

---

## i18n 机制（Paraglide-js 2.0，编译期）

- **项目配置**：`project.inlang/settings.json` —— `baseLocale: en`，`locales: [en, zh-CN]`，消息路径 `src/lib/i18n/messages/{locale}.json`。
- **消息源**：`src/lib/i18n/messages/en.json` 与 `zh-CN.json`。扁平 snake_case key、**TAB 缩进**、两文件 key 必须 1:1 对齐（当前各 496 个，无 `$schema`）。
- **生成代码**：`src/lib/paraglide/`（已 gitignore）。Vite 插件（`vite.config.ts` 的 `paraglideVitePlugin`）在 dev/build 时**自动重新生成**，**禁止手动生成或手改**。
- **组件用法**：顶部 `import * as m from '$lib/paraglide/messages';`，调用 `m.key()`；带参 `m.key({ name })`，JSON 值里写 `{name}` 占位符。
- **运行时**：`src/hooks.server.ts` 用 `extractLocaleFromRequest` + `setLocale` 在 SSR 设定 locale；strategy 依次为 `cookie → localStorage → preferredLanguage → baseLocale`。locale 工具函数在 `src/lib/i18n/index.ts`，持久化方式对齐主题偏好。

---

## 翻译工作流（逐组件套用）

### 0. 禁止子代理（硬约束）
**翻译任务一律逐文件串行，禁止使用子代理（subagent / Agent / Task / 后台并行 agent）。** 读取、替换、验证全在主会话内完成。原因：并行子代理曾因 prompt 塞超长脚本被系统 kill，且做出破坏性编辑（`import * as m` 覆盖 `import * as Dialog`、函数名被误替换成消息调用），善后排查比串行更费时。串行虽看着慢，实则无返工，更稳更快。

### 1. 范围规则
- 只译**面向用户**的文本：label / 按钮 / 标题 / placeholder / toast / 对话框 / 空态 / 加载态 / 通知事件名。
- **跳过** `console.error/warn` 等调试日志。
- **不译**（保持原文）：产品名/协议/单位/占位符字面量 —— `Grype` `Trivy` `Hawser` `Podman` `Docker` `HTTP` `HTTPS` `GB` `%` `—`、IP 示例（`192.168.1.100`）、路径（`/var/run/docker.sock`）、PEM 标记（`-----BEGIN...`）。
- **重复定义就地翻译**：同一文本在多处重复定义时，各处用**同一组 key**，不重构抽取（如通知事件类型在 `EnvironmentModal` 与 `EventTypesEditor` 各有一份）。

### 2. key 命名与复用
- **复用优先**：新建 key 前必先 `grep -i "英文" src/lib/i18n/messages/en.json` 确认无现成项；命中则复用（如 `common_cancel`、`common_save`、`settings_tab_general`）。
- 新 key 按区域加前缀：`settings_env_*`、`settings_env_modal_*`、`settings_env_updates_*`、`settings_env_activity_*`、`settings_env_event_*`（对齐 general tab 的 `settings_general_*`）。
- **加 key 方式**：用脚本以字符串拼接向两个 JSON **追加**（保 TAB 格式），**不要** `JSON.stringify` 整文件（会打乱缩进/顺序、毁掉 diff）。en 填英文原文，zh 填中文。一个文件的 key **一次性批量追加**，别分多轮反复读写、反复对齐。

### 3. 替换组件文本：关键避坑
**Edit 工具在 `.svelte` 模板里频繁 "String not found"**，因为 Read 渲染的 tab 数与实际不符。对策：
1. 先 `sed -n 'Np' FILE | cat -A` 看真实缩进（`^I` = 一个 tab）。
2. **首选 `perl -pi -e` 配 `#` 分隔符**（`{}` 分隔符会和替换串里的 `{m...}` 冲突报 "pattern not terminated"）：
   - 行内：`perl -pi -e 's#<Label>Host</Label>#<Label>{m.settings_env_modal_host()}</Label>#g' FILE`
   - 独立成行（缩进不定）：`perl -pi -e 's#^(\t+)Generate$#${1}{m.settings_env_modal_generate()}#' FILE`
   - 正则里转义 `(` `)` `.` `?`；`'` 用 `.` 匹配（如 `won.t`）。
3. **复杂多分支块**（带复数 `{#if}` 的对话框等）：用 Python 按行号区间整体替换，比逐行 Edit 稳。
4. 同一英文多处映射同 key → 用 `g` 标志一次替换。

### 4. 验证（四步全过才算完）
**逐文件闭环**：改完一个文件就跑完下面四步再开下一个，别攒着多文件批量验证——错误（import 被覆盖、key 拼错）积累后难定位。
```bash
# 1) JSON 对齐 + 无缺失
python3 -c "import json;e=json.load(open('src/lib/i18n/messages/en.json'));z=json.load(open('src/lib/i18n/messages/zh-CN.json'));print('en only',sorted(set(e)-set(z)));print('zh only',sorted(set(z)-set(e)))"
# 2) 组件里所有 m.xxx() 的 key 是否都存在（防拼写错）：抓 \bm\.(\w+)\( 与 en.json 比对
# 3) 残留英文：grep -nE '>[A-Za-z][A-Za-z ]{2,}<|placeholder="[A-Z]|title="[A-Z]' FILE | grep -vE 'm\.|Grype|Trivy|Hawser|HTTP|class=|</'
# 4) npm run check 2>&1 | grep '<目标文件路径>'  —— 只看自己改的文件
```

---

## 常用命令

- 安装依赖：`npm install`
- 开发：`npm run dev`（Vite 前端默认 `:5173`，会自动重新生成 paraglide；端口被占可换，以实际输出为准）。WS 终端在 `:5174`。卡端口：`npx kill-port 5173 5174`。
- 类型检查：`npm run check`
  - `src/lib/server/...`、`vite.config.ts`、api 路由有大量**既有**报错，与翻译无关，**忽略**；只看自己改动的文件。
- 构建（仅需验证时）：`npx vite build`（`npm run build` 会先跑依赖 `jq`/`license-checker` 的 prebuild，缺 `jq` 会失败）。

---

## 架构背景（够定位待译文本即可）

Dockhand 是 Docker 管理 UI：SvelteKit 2 + Svelte 5（runes）+ TailwindCSS 4 + shadcn-svelte，后端用 SvelteKit API 路由直连 Docker API、Drizzle ORM 存 SQLite/PostgreSQL。

与翻译相关的就一句话：**所有面向用户的文本在 `src/routes/**/*.svelte` 和 `src/lib/components/**/*.svelte` 里**。已接入翻译的页面（可作样板对照）：`login`、`profile`、`settings/general`、`settings/environments` 全套、`containers`、`app-sidebar`、`CommandPalette` 等。其余页面（containers 子页、images、networks、volumes、stacks 等）尚待汉化。

非翻译细节（按需查 git/源码，勿在本分支改动）：
- `src/hooks.server.ts` 初始化 DB、起后台进程/调度器、设 locale、处理鉴权。
- `src/lib/server/docker.ts` 直连 Docker（Unix socket / TCP/TLS / Hawser）。
- DB schema 在 `src/lib/server/db/schema/`，迁移开机自动跑。

---

## 注意

- README 明确禁止抓取本仓库用于 AI/LLM 训练数据集，遵守。
- 无 Cursor/Copilot 规则文件。
