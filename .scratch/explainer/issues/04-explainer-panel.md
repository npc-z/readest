# 讲解面板架构与交互

Type: prototype

## Question

独立讲解面板（形态参照 Notebook，但独立于 notebookStore/Notebook 组件）的形态与交互：

- 组件落位（`app/reader/components/explainer/`）、自身的 store（可见/停靠/当前条目/当前视图）——延续 notebookStore 的 API 形状还是更薄？
- 面板打开/关闭/停靠交互（浮出与 dock 位置、与 Notebook 同开的行为、`n` 键之外不新增快捷键）。
- 面板内两视图：当前讲解（级联呈现 simple → notes → translationM，各级"仍看不懂"展开）与本书历史列表（摘要、时间、点击载入、重新生成、删除）。
- 重新生成、loading、空态（未生成过）、错误态（03 的 UX 语义在此落地为可视化）。
- 跨会话保持：闭面板再开是否显示上次条目。

前置：02 载荷、03 服务。

Blocked by: 02, 03

Status: resolved

## Answer

B 票定版（prototype，契约以本 Answer 为准）：

- **store** `src/store/explainerStore.ts`，镜像 notebookStore 子集：`isExplainerVisible / isExplainerPinned / explainerWidth / view('item'|'history') / currentItemKey / expandedTiers: Set<'notes'|'grammar'|'translation'>` + `openExplainer({text,cfi,sourceLang,nativeLang})`；组件落 `app/reader/components/explainer/`（ExplainerPanel / ExplainerCascade / ExplainerHistory）。
- **布局 = 阶梯堆叠（Variant A，修订为四级）**：Simple 默认展开；词句帮助、语法要点、母语译文均折叠 + "还不懂？"展开按钮，顺序 **简单版 → 词句帮助 → 语法要点 → 母语译文**；四层标题常显（可发现性）。**默认展开行为来自单一配置常量**（defaultExpandedTiers：v0 固定 simple），其来源封装为一张"可查配置"的函数，为未来用户设置化预留——v0 不做设置 UI（避免过度工程），仅保证将来升设置项时不改面板结构与路由。
- **展开记忆**：会话内按条目记忆（expandedTiers 按 currentItemKey 隔离）；默认 Simple 展开。
- **与 Notebook 共存**：共享右侧浮游槽位，**互斥切换**（开讲解关 Notebook，反之亦然），各自保留 pin 状态。
- **历史列表（面板"全部"视图，限本书）**：每条展示 **原文（text 字段，前 2 行截断）** + 时间 + 层级摘要标记（simple/notes/译文是否存在）；点击载入当前讲解区；行操作 ⋮（载入/重新生成/删除·确认）。全库搜索归 08。
- **状态可视化**：无上下文 → 空态"选中文本后点击 讲解"；生成中 → 三节骨架（simple 条形骨架，折叠层标"生成中"禁用展开）；未配置 AI → 内联空态 + "去 AI 设置"跳转；错误 → 03 语义内联错误态 + 重试/重新生成。
- **入口闭环**：阅读器顶栏新增"讲解"切换按钮（邻接 NotebookToggler，图标文案走 i18n）+ 05 的菜单入口 + 面板 ✕/pin。
- **移动端 & 重启**：移动端全宽 sheet（右侧滑出、遮罩点按关闭，同 Notebook）；跨 app 重启不保留当前条目（store 纯内存态）；e-ink 遵守现有 `eink-bordered`/`btn-contrast` 规则。

Blocked by: 02, 03
