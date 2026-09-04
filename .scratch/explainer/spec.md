# 讲解 (Explainer) — Spec

Status: ready-for-agent

> 本 spec 由 wayfinder 地图（`.scratch/explainer/map.md`，10 张决策票 + 评审修订）坍缩而成；域术语见 CONTEXT.md；v1 提示词与参数见 `prompt-framework.md` §7。

## Problem Statement

讲外语读物的读者（v0：英语书为主）在阅读中频繁碰到不认识的单词、难懂的词组和句子。每次都要停下来查词典或另开翻译，打断阅读；同一个晦涩句子第二次读到时依然看不懂，又得重新查一遍。用户希望：选中看不懂的内容，得到一份**按"目标语言优先"组织、可逐级展开**的讲解——先是简单版重述，再是词句帮助，再是语法要点，最后才是母语译文——并且这份讲解**与内容绑定、永久缓存**（同句第二次选中立即显示，不重复请求 AI），还要有一个地方**浏览和管理**所有生成过的讲解。

## Solution

在 readest 阅读器中新增"讲解 (Explain)"工具：选中文本后在选择菜单点击"讲解"，在独立侧浮面板（与 Notebook 同槽互斥）中弹出四级级联讲解——简单版（默认展开）→ 词句帮助 → 语法要点 → 母语译文，各级由"还不懂？"逐步展开。讲解由 AI 按既定方针一次性生成、结构化输出，按 `(bookHash, 归一化文本哈希, nativeLang)` 缓存到本机 SQLite；同文本再次选中直接命中缓存；可显式"重新生成"覆盖。讲解库页面（库页入口）提供全库浏览与管理：搜索、按书筛选、删除、重新生成、跳转到书中位置。语言（L/M）与思考强度可在面板头部配置；未配置 AI 时给内联引导。v0 仅覆盖新 App Router 阅读器。

## User Stories

1. As a language learner, I want to select a passage in a book and see an "Explain" option in the selection menu, so that I can get help without leaving the reading flow.
2. As a language learner, I want the explained content to open in a side panel next to my reading, so that the context stays visible.
3. As a language learner, I want the simplest help first: the passage restated in plain English (simple tier, expanded by default), so that I try to understand in the target language first.
4. As a language learner, I want to tap "Still not clear?" to reveal word/phrase notes, so that I only see as much help as I need.
5. As a language learner, I want a further tier revealing grammar notes for genuinely tricky structures, so that hard syntax is explained in the target language first.
6. As a language learner, I want the final tier to be the native-language translation of the whole selection, so that complete understanding is always available as fallback.
7. As a language learner, I want each note's explanation in the target language, with the mother-tongue gloss only when the L explanation would be as hard as the term, so that I build direct L→meaning links.
8. As a language learner, I want phrase-level units (phrasal verbs, idioms, collocations) annotated before isolated words, so that I learn chunks.
9. As a language learner, I want to select the same passage twice and get the saved explanation instantly (no new AI request), so that re-encountering a hard sentence doesn't cost again.
10. As a language learner, I want an explicit "Regenerate" action per entry, so that I can refresh an explanation after prompt/model changes.
11. As a language learner, I want per-entry book/book-position context (which book, roughly where), so that I can find my way back.
12. As a language learner, I want the explanation panel to keep a book-scoped history view, so that I can review everything I explained in this book.
13. As a language learner, I want to open the "Explanations" page from the library and search all explanations, so that I can find a past explanation across books.
14. As a language learner, I want to filter the library list to a single book, so that I can manage one book's explanations.
15. As a language learner, I want to delete an entry (with confirmation), so that junk explanations can be removed.
16. As a language learner, I want to tap an entry in the library page to open the book at the passage (when position is known; else just open the book), so that I can re-read in context.
17. As a learner whose app UI language differs from the reading language, I want to configure the source language L and native language M in the panel header, so that explanations target the pair I actually need.
18. As a learner, I want to set the AI thinking strength (off/low/medium/high), so that I can trade latency/quality.
19. As a learner who hasn't configured AI, I want the Explain action to open the panel showing a "not configured — go to settings" state, so that I understand how to enable it.
20. As a learner, I want to see the active provider/model and tuning info read-only in the panel, so that I can understand why an explanation looks the way it does.
21. As a learner, I want the panel to be openable from the reader top bar (toggle), in addition to the selection menu, so that I can browse my explanations without selecting text.
22. As a learner, I want the panel to behave like the Notebook (floating/dockable, mutually exclusive with it), so that it matches the reader's existing idioms.
23. As a learner, I want the panel on mobile to appear as a full-width sheet, so that the same feature works on phones.
24. As a learner who selects over the character limit, I want a clear toast saying only the first part was explained, so that I know the explanation is partial.
25. As a learner, I want empty/whitespace-only selections to not trigger an AI request, showing a "nothing to explain" state, so that spurious actions are ignored.
26. As a learner, I want during generation to see tier skeletons (and disabled expand buttons), so that waiting is legible.
27. As a learner, I want generation failures presented inline with retry/regenerate, so that transient failures are recoverable in place.
28. As a learner, I want the feature in Chinese UI to show translated labels (zh-CN), and other languages to fall back to English, so that the UI is readable in my locale.
29. As a learner, I want the explain action configurable in the annotation toolbar (default on, hideable/reorderable), so that I keep only the tools I use.
30. As a learner reading on an e-ink device, I want the panel to follow the e-ink styling rules, so that it stays legible.
31. As a learner, I want the four tiers visually distinct (tier headers always visible), so that I know what help exists without unfolding everything.
32. As a learner, I want per-session memory of which tiers I expanded (per entry), so that expanding doesn't reset while reading.
33. As a learner, I want the settings (L/M languages, thinking) persisted in app settings, so that they survive restarts.
34. As a learner, I want explanations generation to reuse my existing AI provider config, so that no second provider setup is needed.
35. As a learner, I want unsupported thinking options on my provider to be silently ignored, so that generation never breaks because of a tuning option.

## Implementation Decisions

- **模块**：explainer 服务层（生成/校验/降级/落库门面 `ExplainerService.getOrGenerate` + prompt 模板常量 + 归一化/哈希/上限 + ExplainerDb wrapper）；数据迁移组 `explainer`；api route（Web 路径）；reader 面板组件与 store；注解工具栏工具 `explainer` 与处理器；阅读器顶栏切换按钮；库页入口 + 讲解库页面；`SystemSettings.explainerSettings`（`{sourceLang?, nativeLang?, thinking?}`）。
- **主 seam**：`ExplainerService.getOrGenerate(request)`——请求 = `{text(展示版), cfi?, bookHash, sourceLang, nativeLang, thinking}`；返回 `ExplanationEntry`。行为：归一化哈希定键 → ExplainerDb 命中即回 → 未命中经 AI 端口（`generateText + Output.object`，schema 见下）→ zod 校验/降级阶梯（parsePartialJson 抢救 → text 兜底 → 失败）→ **先写库后回传**；并发同键 `pendingByKey` 共享 promise；超时 120s（thinking=high 240s）；`maxRetries 2`。
- **AI 通路**：复用现有 AI 设置；**Tauri 平台 Ollama 直连** `getAIProvider`；**OpenRouter / AI-Gateway 走 `/api/ai/explain` route**（`createGateway`，apiKey/model 等随 body 传入）。参数单源常量：`temperature 0.2`、`topP 默认`、`maxOutputTokens 4096`、超时档位、门槛错误码表（`ai-not-configured` / `timeout` / `provider-error` / `no-object-salvaged` / `invalid-input`），文案只活在 UI 层。
- **载荷 schema**（决定性类型，来自 02 票+评审修订；zod 表达，permissive）：
  ```ts
  {
    simple: string,                                    // 必填；多段允许 \n
    notes?: { kind: 'word'|'phrase'|'idiom';
              original: string; meaningL: string;
              example?: string; meaningM?: string }[], // 原序；空合法；≤15
    grammar?: { structure: string; noteL: string;
                noteM?: string }[],                    // ≤2；难句法才给；noteM 同 notes 规则
    translationM?: string,                             // prompt 必给；缺失走降级
    metadata: { sourceLang: string; nativeLang: string;
                promptVersion: number; format?: 'json'|'text' },
  }
  ```
  演进规则：只增不改；破坏性变更经 `promptVersion`+统一重新生成。
- **缓存与存储**：键 `(bookHash, normalizedTextHash, nativeLang)`；**text 存展示版（含换行），textHash 存归一化结果**（strip HTML/实体→NFKC→lowercase→标点→空白折叠→sha256）；CJK 段落按字符计数，超 500 单位截断+toast。库：独立 `explainer` schema 迁移组；表 `explanations`：id(uuid)/book_hash/book_title(快照)/text/text_hash/source_lang/native_lang/cfi(可空)/payload(JSON)/prompt_version/created_at(ms)/updated_at(ms)，`UNIQUE(book_hash,text_hash,native_lang)` 即 upsert 覆盖语义；索引 `(book_hash, created_at DESC)`。
- **Prompt**：v1 定稿全文在 `prompt-framework.md` §7（`promptVersion=1`，英文 system；`<INPUT_TEXT>` 分隔 + 注入回避——含字面 `</INPUT_TEXT>` 的输入由服务预检拦截为 invalid-input，不入模型；分节 IDENTITY/TARGET READER/INPUT/TASK(四层)/CONSTRAINTS/OUTPUT FORMAT；仅 TARGET READER 句为水平敏感、可参数化）。**不在本 spec 复述全文，实现以 §7 为准**。
- **面板与交互**：独立 `explainerStore`（镜像 notebookStore 子集）+ 右浮面板；与 Notebook 同槽互斥；视图切换（当前讲解 / 本书历史）；级联四级阶梯（Simple 默认展开，notes/grammar/translation 折叠的"还不懂？"展开；标题常显；defaultExpandedTiers 单点常量预留设置化）；历史行 = 原文首行 + 书/时间/层级徽标；操作（重新生成=覆盖、删除=ask 确认）；顶栏切换按钮 + 菜单入口闭环；移动端全宽 sheet；生成中骨架；跨重启不保留当前条目（store 内存态）。
- **入口与工具栏**：`AnnotationToolType` 增 `explainer`（label "Explain"、LuGraduationCap、quickAction），插入工具栏配置（translate 之后，**默认开启**），同步 ALL/DEFAULT 列表与同步性单测；处理器照 translate 范式（关弹窗+抑制手柄+保留选择）→ openExplainer；未配置 AI → 面板内联空态（无入口 toast）。
- **讲解库页面**：库页头部入口 → 独立页面；时间倒序、分页 20/页 + 加载更多；搜索（text LIKE）+ 仅本书筛选；行展开卡片复用 ExplainerCascade（compact 变体复用 ExplainerItemCard）；空/加载/无结果三态；跳转 `navigateToReader`（cfi 参数，annotation-link 机制）fail-soft。
- **语言判定**：`explainerSettings.sourceLang ?? book 元数据语言(best-effort) ?? 'auto'`（prompt 自动检测记入 metadata）；`nativeLang = explainerSettings.nativeLang ?? 点击时 UI 语言快照`；键仅含 nativeLang。
- **i18n**：仅提交 zh-CN（20 条 key 清单见 09 票；en key 即文案，其余语言回退）；服务层返回错误码，UI 映射。

## Testing Decisions

- **好测试的定义**：只断言外部行为（"给定缓存空+假AI → 返回并落库"、"命中缓存不触发 AI"、"超限截断 toast"），不测实现细节（不 mock 内部函数、不断言 prompt 拼接步骤）。假 AI 端口返回罐头 JSON/抛错/挂起；假 DB 内存 Map 实现同一接口。
- **主 seam**：`ExplainerService` 行为测试（命中/未命中/并发同键/降级阶梯/先存后展示/错误码分类）——内存 FakeDb + FakeAi，无 Tauri/Next 依赖。
- **纯函数**：归一化+哈希（样例表：HTML 实体/全半角/大小写/标点/换行）；单位计数与截断（EN 词、CJK 字符、纯标点弃用）；prompt 模板构建（变量替换+版本常量）。
- **组件/状态**：ExplainerCascade 渲染与折叠（RTL + fixture payload，四级缺一渲染）；explainerStore 状态契约（openExplainer/view/expandedTiers/互斥逻辑）；工具栏工具表更新同步断言（**先例 `src/__tests__/utils/annotationToolbar.test.ts`**）——新增 `explainer` 两项必须同步。
- **先例**：`src/__tests__/ai/*`（providers/retry/constants，AI 边界单测风格）、annotator 组件测试（RTL）、zod/schema 校验直测（validate + salvage 输入表）。
- 端到端（人肉冒烟，不入 CI）：选中→讲解→四级展开→重选命中→重新生成→讲解库搜索/删除/跳书。

## Out of Scope

- legacy pages 阅读器（`src/pages/reader/[ids].tsx`）兼容。
- 跨设备同步。
- Schema 之外的产品级：用户水平模型、SRS/复习闭环、重复阅读建议、渐隐自动化（二次不显示解释）、阅读模式（Pure/Scaffold/Study）、操作级四入口拆分（Explain/Simplify/Translate/Grammar 为单独菜单动作）、单词点击快捷释义（既有词典/WordLens 覆盖）。
- 整书预生成/句子切分管线（v1 按需生成 ≤500 单位）。
- 讲解统计/依赖率指标（不做不记）。
- 多版本留档、上限/水平设置化、FTS5 检索、删除书联动清理、WordLens 词频交叉校验（记于地图 Not yet specified 的后续项）。

## Further Notes

- 实现起点 = `.scratch/explainer/map.md`（决策 provenance）+ `prompt-framework.md` §7（canonical prompt v1）+ `CONTEXT.md`（术语）。
- 环境注意：仓库 pin `ai@6.0.47`——`generateObject` 已弃用，用 `generateText({ output: Output.object(...) })`；route 侧注意 `maxDuration` 与 120/240s 对齐。
- prefactor：AnnotationTools 按钮表与 `ALL_ANNOTATION_TOOL_TYPES` 已有同步单测，新增工具按同一模式扩展即可。
- 面板与 Notebook 互斥需在设计时确认 z-index/布局常量复用（既有 sidebar/notebook 45/20 分层）。
