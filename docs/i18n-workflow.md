# i18n 翻译工作流

> 汉化 Dockhand UI（en → zh-CN）的固定流程。接手翻译任务前先读本文，照做即可，无需重新探索仓库。
> 机制与命令的完整说明见根目录 [`CLAUDE.md`](../CLAUDE.md)，本文是可独立查阅的速查版。

## 机制速记（Paraglide-js 2.0，编译期）

- 项目配置 `project.inlang/settings.json`：`baseLocale: en`，`locales: [en, zh-CN]`。
- 消息源：`src/lib/i18n/messages/en.json` 与 `zh-CN.json`。扁平 snake_case key、**TAB 缩进**、两文件 key 必须 1:1 对齐（无 `$schema`）。
- 生成代码在 `src/lib/paraglide/`（gitignore），dev/build 时 Vite 插件自动重新生成，**不要手动生成或手改**。
- 组件用法：顶部 `import * as m from '$lib/paraglide/messages';`，调用 `m.key()`；带参 `m.key({ name })`，JSON 值里写 `{name}` 占位符。

## 1. 范围规则

- 只译**面向用户**的文本：label / 按钮 / 标题 / placeholder / toast / 对话框 / 空态 / 加载态 / 通知事件名。
- **跳过** `console.error/warn` 等调试日志。
- **不译**（保持原文）：产品名/协议/单位/占位符字面量 —— `Grype` `Trivy` `Hawser` `Podman` `Docker` `HTTP` `HTTPS` `GB` `%` `—`、IP 示例（`192.168.1.100`）、路径（`/var/run/docker.sock`）、PEM 标记（`-----BEGIN...`）。
- **重复定义就地翻译**：同一文本在多处重复定义时各处用**同一组 key**，不重构抽取（如通知事件类型在 `EnvironmentModal` 与 `EventTypesEditor` 各有一份）。

## 2. key 命名与复用

- **复用优先**：新建 key 前必先 `grep -i "英文" src/lib/i18n/messages/en.json` 确认无现成项；命中则复用（如 `common_cancel`、`common_save`、`settings_tab_general`）。
- 新 key 按区域加前缀：`settings_env_*`、`settings_env_modal_*`、`settings_env_updates_*`、`settings_env_activity_*`、`settings_env_event_*`（对齐 general tab 的 `settings_general_*`）。
- **加 key 方式**：用脚本以字符串拼接向两个 JSON **追加**（保 TAB 格式），**不要** `JSON.stringify` 整文件（会打乱缩进/顺序、毁掉 diff）。en 填英文原文，zh 填中文。

## 3. 替换组件文本：关键避坑

`.svelte` 模板里直接逐行手改易因 tab 数错位失败。对策：

1. 先 `sed -n 'Np' FILE | cat -A` 看真实缩进（`^I` = 一个 tab）。
2. **首选 `perl -pi -e` 配 `#` 分隔符**（`{}` 分隔符会和替换串里的 `{m...}` 冲突报 "pattern not terminated"）：
   - 行内：`perl -pi -e 's#<Label>Host</Label>#<Label>{m.settings_env_modal_host()}</Label>#g' FILE`
   - 独立成行（缩进不定）：`perl -pi -e 's#^(\t+)Generate$#${1}{m.settings_env_modal_generate()}#' FILE`
   - 正则里转义 `(` `)` `.` `?`；`'` 用 `.` 匹配（如 `won.t`）。
3. **复杂多分支块**（带复数 `{#if}` 的对话框等）：用 Python 按行号区间整体替换，比逐行手改稳。
4. 同一英文多处映射同 key → 用 `g` 标志一次替换。

## 4. 验证（四步全过才算完）

```bash
# 1) JSON 对齐 + 无缺失
python3 -c "import json;e=json.load(open('src/lib/i18n/messages/en.json'));z=json.load(open('src/lib/i18n/messages/zh-CN.json'));print('en only',sorted(set(e)-set(z)));print('zh only',sorted(set(z)-set(e)))"
# 2) 组件里所有 m.xxx() 的 key 是否都存在（防拼写错）：抓 \bm\.(\w+)\( 与 en.json 比对
# 3) 残留英文：grep -nE '>[A-Za-z][A-Za-z ]{2,}<|placeholder="[A-Z]|title="[A-Z]' FILE | grep -vE 'm\.|Grype|Trivy|Hawser|HTTP|class=|</'
# 4) npm run check 2>&1 | grep '<目标文件路径>'  —— 只看自己改的文件，server/api 既有报错忽略
```

## 进度

`src/routes` 下约 118 个 `.svelte`，目前仅约 11 个已接入翻译。已译页面可作样板对照：`login`、`profile`、`settings/general`、`settings/environments` 全套、`containers`、`app-sidebar`、`CommandPalette`。其余（containers 子页、images、networks、volumes、stacks 等）尚待汉化。
