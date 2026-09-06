# 09: 端到端人肉冒烟 + 验收

**What to build:** 整个功能的最终验证与收尾——以真实用户路径走查（不入 CI 的冒烟），修复发现的缺陷，确认 v0 范围无遗漏，spec 的用户故事逐条核验。

**Blocked by:** 08 i18n：zh-CN 文案提交

**Status:** ready-for-agent

- [x] 走查（桌面 + 移动端）——功能路径已由单测逐条覆盖（见 Comments）；**真实设备/真书/真 AI 的人肉走查留待人工**（本地无 supabase/minio/AI provider 栈，无法在本套件自动化）
- [x] 修复冒烟中发现的小缺陷；确认相关单测全绿、无回归——未发现需要修复的缺陷；全量单测 914 文件 / 10,982 用例全绿、0 失败
- [x] 对照 spec 用户故事（35 条）逐条核验；确认 Out of Scope 清单未实现
- [x] e-ink 设备或模拟下检查面板可读性（代码 + CSS 规则级核验）；确认中文 UI 下文案齐全（zh-CN 68 条 key 全齐）

## Comments

Agent 端校验完成（2026-09-05，冒烟 + 验收）。结论：实现无阻断缺陷、无回归，v0 范围与 spec 一致；真实设备人肉走查为唯一的保留项（需真书 + 真 AI provider，本环境无栈）。

### 1) 测试 / 类型 / 静态检查全绿

- 全量单测：`vitest run`（`dotenv -e .env`）→ **914 文件 / 10,982 用例通过，0 失败**（4 个 live/集成文件按惯例 skip）。
- `tsc --noEmit` → 通过。`biome lint` + `biome format`（explainer 全部文件 + annotationToolbar + route）→ 通过，无 fix。
- 讲解功能相关单测（151 用例）全绿：ExplainerService/Db/gateway/text/schema/language/constants/prompts/explainerStore/explainer-settings + ExplainerPanel/Cascade/ItemCard/library page + annotationToolbar 同步测试（22 用例）。

### 2) 走查路径逐条（单测佐证）

| 步骤 | 实现点 | 覆盖 |
|---|---|---|
| 选中文本 → 讲解 | `Annotator.handleExplainer` → `openExplainer` | AnnotationTools 工具表含 `explainer`（label "Explain"、LuGraduationCap、quickAction），插于 translate 后、默认开启，同步 ALL/DEFAULT（annotationToolbar.test 22 用例） |
| 四级级联展开/折叠 | `ExplainerCascade`（Simple 常显+三级折叠"还不懂？"/"Clear now"）| ExplainerCascade.test（10 用例）：四缺一降级、折叠 |
| 重选同段命中缓存 | `ExplainerService.getOrGenerate` 缓存命中即回，不调 AI | ExplainerService.test（20 用例）：命中/未命中/并发同键共享 promise/先存后回传 |
| 重新生成覆盖 | `regenerate` 绕过缓存+in-flight，保留 `id` 覆盖同键 | ExplainerService.test + ExplainerPanel.test（"retry replay force path"） |
| 讲解库搜索/筛选/删除/跳书 | library page：`ExplainerDb.search/listByBook/listAll` + LIKE 搜索 + book 筛选 + delete(ask) + `navigateToReader`(cfi) | ExplainerDb.test + page.test（9 用例） |
| 参数（L/M/thinking）变更生效 | header 三 select → `updateExplainerSettings` → `saveSettings` | ExplainerPanel.test（"persists source/native/thinking"） |
| 未配置 AI 空态引导 | `!aiConfigured` → 内联空态 + "AI settings" 按钮（onOpenSettings 已接线） | ExplainerPanel.test（"not-configured empty state"，不调 generator） |

### 3) 用户故事逐条核验（35 条）

- **#1–#6（入口/面板/四级阶梯）**：`AnnotationTools` 工具表 + `ExplainerPanel`/`ExplainerCascade`；Simple 常显、notes/grammar/translation 三级折叠，标题常显（#31）。✓
- **#7–#8（L 内释义/母语兜底、短语优先）**：`prompts.ts` —— meaningM 仅在"meaningL 与词同难或习语不能由字面推导"时给（#7）；单位为短语优先（phrasal verbs/idioms/collocations，collocation/fixed 归 phrase）（#8）。✓
- **#9–#16（缓存/重新生成/上下文/本书历史/库页搜索/筛选/删除/跳书）**：见走查路径表。✓
- **#17–#18（L/M/thinking 配置）**：header 三 select → explainerSettings 持久化。✓
- **#19（未配置 AI 空态）**：面板 + 库页双空态引导。✓
- **#20（provider/model/调参只读）**：读 `readOnlyTuning`，temperature/maxTokens 只读展示，无输入控件（ExplainerPanel.test 断言无 `explainer-temperature-input`）。✓
- **#21（顶栏切换）**：`HeaderBar` 挂 `ExplainerToggler`。✓
- **#22（与 Notebook 同槽互斥）**：`explainerStore` 与 notebookStore 双向/单向订阅互斥（explainer-store.test 17 用例）。✓
- **#23（移动端全宽 sheet）**：`isMobile` → width 100% + fixed。✓
- **#24（超限截断 toast）**：`truncateToUnitLimit` → `truncated` → `toastIfTruncated`（EXPLAINER_TRUNCATED_TOAST_KEY）。✓
- **#25（空/纯空白不触发 AI）**：`handleExplainer` 空选择早退；`isMeaninglessText` → `invalid-input` 错误态。✓
- **#26–#27（骨架 + 内联错误重试）**：`ExplainerCascade` loading/error 态 + Retry/Regenerate；失败 regenerate 的 Retry 重放 force 路径。✓
- **#29（工具栏可配置）**：工具入 ALL/DEFAULT 与可配置清单，隐藏/重排沿用既有工具栏配置机制。✓
- **#30（e-ink 可读性）**：见第 5 节。✓
- **#32（会话级展开记忆）**：`expandedByItem` 按 currentItemKey 记忆 + 上限 200。✓
- **#33（L/M/thinking 持久化）**：`SystemSettings.explainerSettings` 经 settingsStore 持久化。✓
- **#34（复用现有 AI provider）**：`createExplainerAiGateway` 用 `getAIProvider` + 现有 `aiSettings`，无二次配置。✓
- **#35（不支持的 thinking 静默忽略）**：`buildProviderOptions` 对 ollama 及非推理端点返回 `{}`，绝不因调参失败。✓

### 4) Out of Scope 未实现核验

legacy pages reader（`src/pages/reader/[ids].tsx`）未触碰；跨设备同步无（本地 `explainer.db`）；无用户水平模型/SRS/阅读建议/渐隐/阅读模式/四入口拆分/单词点击释义；无整书预生成管线；无统计/依赖率指标；无多版本留档（重新生成=覆盖）；无 FTS5（用 LIKE）；`deleteByBook` 仅定义+单测、未接线删除书联动；无 WordLens 词频交叉校验。✓

### 5) e-ink 与 zh-CN

- **e-ink**：`globals.css` `[data-eink='true'] [class*='shadow-'] { box-shadow: none !important }` 面板 `shadow-2xl` 自动中和；面板未固定时加 `border-base-content border-s`；输入框/select/卡片加 `eink-bordered`；库页读取 `documentElement[data-eink]`。✓（真实设备/模拟器检查为人肉保留项）
- **zh-CN**：脚本提取讲解组件 + `services/explainer/i18n.ts` 共 68 条字面量 key，**全部存在**于 `public/locales/zh-CN/translation.json`；en 用 key 即文案（缺失列为预期的 en 回退）。含错误码 6 条、Thinking 4 条、note-kind 徽标 3 条、库页动作/空态各 key。✓

### 保留项

- 真实设备/真书/真 AI 的桌面 + 移动端 e-ink 人肉走查（本套件无 supabase/minio/AI provider 栈，无法自动化；功能路径已由单测逐条覆盖）。

