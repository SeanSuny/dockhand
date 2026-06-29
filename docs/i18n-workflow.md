# i18n 翻译工作流

> 汉化 Dockhand UI（en → zh-CN）的固定流程。接手翻译任务前先读本文，照做即可，无需重新探索仓库。
> 机制与命令的完整说明见根目录 [`CLAUDE.md`](../CLAUDE.md)，本文是可独立查阅的速查版。

> ⛔ **禁止使用子代理（subagent / Agent / Task / 后台并行 agent）。** 翻译任务一律**逐文件串行**，从读取、替换到验证全部在主会话内完成。
> 原因：并行子代理曾因 prompt 塞超长脚本被系统 kill，且做出破坏性编辑——`import * as m` 覆盖了 `import * as Dialog`、函数名 `loadLocations` 被误替换成消息调用——这些破坏的排查与修复，比一开始就老实串行做更费时。串行虽看着慢，实则无返工，更稳更快。

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

- **复用优先**：新建 key 前必先 `grep -i "英文" src/lib/i18n/messages/en.json` 确认无现成项；命中则复用（如 `common_cancel`、`common_save`、`settings_tab_general`）。**不要只看 `common_*`**——`grep` 全前缀，跨域 key 同样能复用。
- **value 全量去重（收尾必做）**：一个文件的 key 加完后，按 **value 分组**扫一遍 en.json，凡同一英文落在多个 key 上的，逐组判断能否合并：
  ```bash
  python3 -c "import json;from collections import defaultdict;e=json.load(open('src/lib/i18n/messages/en.json'));d=defaultdict(list);[d[v].append(k) for k,v in e.items()];[print(repr(v),ks) for v,ks in d.items() if len(ks)>1]"
  ```
  判断标准看 **`zh-CN.json` 的中文是否同译**：同译则删掉新建的重复 key、把引用指向已有 key（如 `images_prune`→`containers_prune`、`images_copied`→`container_inspect_copied`）；**同形不同义则保留**（如列头 `Created=创建时间` vs 容器状态 `Created=已创建`、动词 `Tag=标记` vs 名词 `Tag=标签`）。改引用后重跑 4 步验证。
- 新 key 按区域加前缀：`settings_env_*`、`settings_env_modal_*`、`settings_env_updates_*`、`settings_env_activity_*`、`settings_env_event_*`（对齐 general tab 的 `settings_general_*`）。
- **加 key 方式**：用脚本以字符串拼接向两个 JSON **追加**（保 TAB 格式），**不要** `JSON.stringify` 整文件（会打乱缩进/顺序、毁掉 diff）。en 填英文原文，zh 填中文。一个文件的 key **一次性批量追加**，别分多轮反复读写、反复对齐。

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

**逐文件闭环**：改完一个文件就跑完下面四步再开下一个，别攒着多文件批量验证——错误（import 被覆盖、key 拼错）积累后难定位。

```bash
# 1) JSON 对齐 + 无缺失
python3 -c "import json;e=json.load(open('src/lib/i18n/messages/en.json'));z=json.load(open('src/lib/i18n/messages/zh-CN.json'));print('en only',sorted(set(e)-set(z)));print('zh only',sorted(set(z)-set(e)))"
# 2) 组件里所有 m.xxx() 的 key 是否都存在（防拼写错）：抓 \bm\.(\w+)\( 与 en.json 比对
# 3) 残留英文：grep -nE '>[A-Za-z][A-Za-z ]{2,}<|placeholder="[A-Z]|title="[A-Z]' FILE | grep -vE 'm\.|Grype|Trivy|Hawser|HTTP|class=|</'
# 4) npm run check 2>&1 | grep '<目标文件路径>'  —— 只看自己改的文件，server/api 既有报错忽略
```

## 5. 提速：每文件闭环（少来回、少重试、少跑全量 check）

慢不在磁盘，在「重试多 + 多步绕路 + check 慢」。按下面三步走，把十几个 Bash 来回压到 3 步：

1. **一个 Python 脚本做完写操作**：追加 key（两 JSON）→ 改组件引用 → value 分组去重，全在一个脚本里跑完，不要 Bash 来回 `cat`/`sed`/`grep`/逐行 Edit。
2. **替换用「批量 + assert 计数」**：脚本里列 `(old, new, count)`，先全部 `s.count()` 校验数量、任一不符就整体 abort 不写，再统一 `replace`。裸文本 pattern 加 `\n` 前缀锚定行首（否则少 tab 的 pattern 会匹配深缩进行的尾部 tab，误伤）。这能根除 svelte tab 错位导致的 "String not found" 重试。
3. **验证 1-3 拼成一条命令**（对齐 / key 存在 / 残留英文，全是毫秒级），最后**整文件收尾才跑一次** `npm run check`（全项目扫十几秒，别中途试探性地跑）。

**翻译期停掉 `npm run dev`**：它的 watcher + 同 pts 输出是之前终端串字符、Edit 失败的元凶。汉化不需要热更新，`npx kill-port 5173 5174` 停掉，要预览再起。

## 进度

`src/routes` 下约 118 个 `.svelte`，目前仅约 11 个已接入翻译。已译页面可作样板对照：`login`、`profile`、`settings/general`、`settings/environments` 全套、`containers`、`app-sidebar`、`CommandPalette`。其余（containers 子页、images、networks、volumes、stacks 等）尚待汉化。
