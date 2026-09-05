# Map: 讲解 (Explainer)

## Destination

为 readest 交付"讲解 (Explainer)"功能的决策完整规格书：选中文本 → 选择菜单"讲解"→ 独立侧浮面板（简单版重述 → 词句帮助 → 母语译文，级联呈现）→ 按书缓存（内容键、可重新生成）→ 讲解库管理页。复用 Reedy AI 与现有选取菜单，v0 泛化语言（英文书优先），仅覆盖新 App Router 阅读器。

## Notes

- 域：readest (apps/readest-app)，Next.js App Router + Tauri；相关 skill 每次会话按需调用：grilling、domain-modeling、prototype、research。消耗前读 CONTEXT.md（当前不存在则静默，tickets 澄清后由 domain-modeling 按需创建）。
- 语言：用中文与用户讨论；代码/文档英文术语以本图术语为准。

### 已定决策（charting 时经用户确认，勿重开）

- **面板独立于 Notebook**：新建 Notebook 形态的独立组件（右侧浮出/停靠面板），不耦合 notebookStore。
- **管理 = 双形态**：面板内"当前条目/本书历史列表"视图切换 + 独立"讲解库"管理页。
- **缓存键** = `(bookHash, normalizedTextHash, nativeLang)`；CFI 仅作显示锚点；`promptVersion` 字段幂等演进不影响命中；"重新生成"显式覆盖同一键。
- **生成通路**：复用 AI 设置 (`SystemSettings.aiSettings`)，`getAIProvider` + `generateObject` 非流式结构化 JSON；Tauri 直连 provider，Web 走新增 `/api/ai/explain` route（沿用 `/api/ai/chat` 的 createGateway 模式）。
- **菜单入口**：新增 `AnnotationToolType 'explainer'` 进注解工具栏配置（默认开启）；用户未配置 AI 时由面板内联空态引导（入口 toast 已取消，见 05）。
- **上限**：默认 500 词（常量集中、结构预留"未来升为设置项"）。
- **语言判定**：源/母语语言优先用户设置（`explainerSettings`，面板头部下拉），为空时兜底 book 元数据语言/`auto`（sourceLang）与 UI 语言快照（nativeLang）。
- **功能规范名 = `explainer` 根**（用户选定）：UI 显示"讲解/Explain"；"脚手架（language scaffold）"只作方法概念词保留在 prompt 方针与 glossary 中，不作功能名。路由照旧 `/api/ai/explain`。
- **生成参数**：v1 提示词与参数表见 `prompt-framework.md` §7（promptVersion=1；temperature 0.2 / maxOutputTokens 4096 / maxRetries 2 / 超时 120s，thinking=high 240s）；`explainerSettings.thinking` 默认 off，用户可配；provider/model、temperature、maxTokens 只读展示。
- **级联=四级**（idea.md 对照评审修订 · 2026-09-02）：简单版 → 词句帮助 → 语法要点（grammar 可选、≤2、noteL 必填/noteM 同 notes 规则）→ 母语译文；一动作（讲解）承载四层，动作级区分（Explain/Simplify/Translate/Grammar 四入口）不在 v1 保真目标内。
- **重新生成=覆盖**：不保留多版本。
- v0 不新增键盘快捷键。

## Decisions so far

<!-- 闭合的 ticket：一行 name + 一句结论摘要 + 链接 -->

- [讲解 Prompt 方针研究](issues/01-prompt-framework.md): 定版分节式 prompt 方针——同语言高频重述（保留时态/逻辑、不儿童化、不加信息）+ 短语优先 + L 内释义/母语兜底 + 固定 "CEFR B1（2000–3000 高频词族）" 靶点措辞（未来仅换 TARGET READER 句参数化）；输出走 `generateText + Output.object()`（ai@6.0.47 已弃用 generateObject），字段 `{simple, notes[{kind|original|meaningL|example?|meaningM?}], translationM?, metadata}`，JSON 失败降级 parsePartialJson → 纯文本 → toast 重新生成。
- [讲解载荷 Schema 与分级语义](issues/02-payload-schema.md): 句/段共用同一 schema；`simple` 必填、`notes?`（word|phrase|idiom、meaningL 必填、example?/meaningM?、按原序、空合法、≤15）、`grammar?`（≤2：structure/noteL 必填/noteM 同 notes 规则 · 评审修订）、`translationM?`（prompt 必给）、`metadata{sourceLang,nativeLang,promptVersion,format?}`；渲染依赖冻结，演进只增不改，破坏性变更走 promptVersion；simple 缺失=整条目无效，其余各级缺失逐个降级；collocation/fixed 归 phrase。
- [生成服务与错误/并发语义](issues/03-generation-service.md): Ollama Tauri 直连 + OpenRouter/AI-Gateway 走 `/api/ai/explain` route；`generateText + Output.object()` 非流式、超时 120s、maxRetries 2；prompt 单点 `prompts.ts`（共享防注入层 + 分节），promptVersion 同文件；面板内联错误态+重试/重新生成，JSON 失败走 parsePartialJson→纯文本兜底；并发 `pendingByKey` 共享 promise、先存 DB 后回传；输入 {归一化 text, bookHash, cfi, sourceLang, nativeLang}。
- [讲解面板架构与交互](issues/04-explainer-panel.md): 独立 explainerStore（镜像 notebookStore 子集，含 view/currentItemKey/expandedTiers(含 grammar)/openExplainer）；阶梯堆叠四级布局（Simple 默认展开+三级折叠可发现，默认展开行为常量集中、预留用户设置化）；与 Notebook 同槽互斥；历史列表限本书、展示原文 text 而非 simple；三节骨架/错误内联态；顶栏切换按钮+菜单入口闭环；移动端全宽 sheet，store 纯内存。
- [菜单入口集成](issues/05-menu-entry.md): 新工具 `explainer`（Explain、LuGraduationCap、quickAction），插于 translate 后并默认开启，同步 ALL/DEFAULT 与单测；handleExplainer 照 translate 范式开面板并携带 text+cfi；语言来源用户可设（SystemSettings.explainerSettings {sourceLang?,nativeLang?}，面板头部下拉），缺省兜底 book 元数据/‘auto’（sourceLang）与 UI 语言快照（nativeLang），缓存键不变；取消入口"未配置 toast"，由面板内联空态承担。
- [存储层落地](issues/06-storage-layer.md): 独立 explainer.db + schema 'explainer' 迁移组，无 Tauri gate；表 `explanations` DDL（text 原文必存、UNIQUE(book_hash,text_hash,native_lang)=缓存键、idx 按书+时间）；ExplainerDb 懒开 + getByKey/upsert/delete/deleteByBook/listByBook/listAll、LIKE 搜索，无写队列；列表返回整行 payload；删书不级联。
- [上限与归一化规则](issues/07-limits-normalization.md): 上限 500 单位（词/字 CJK 退化），超限截断前 500 + toast；归一化链 strip→NFKC→lowercase→标点→空白折叠 → sha256，`text`（展示原样）与 `text_hash`（归一化）分离；跨段整体生成一条，归一化空则不调 AI；常量集中 `explainer/constants.ts`（预留设置化）。
- [讲解库管理页](issues/08-library-page.md): 全页路由 `/library/explainer` + LibraryHeader 图标入口；时间倒序分页 20/页，搜索 LIKE + 仅本书筛选；行=原文首行+书标题/时间/层级徽标，展开卡片复用 ExplainerCascade；操作=重新生成(覆盖,错误 toast+行内重试)/删除(ask 确认)；cfi 有则 navigateToReader 定位（annotation-link 机制），空则仅打开书，fail-soft；共面 ExplainerDb + ExplainerItemCard（面板 compact/页面 expanded）。
- [本地化与文案](issues/09-i18n.md): v0 仅提交 zh-CN，其余回退英文 key（现有实践）；20 条 key 清单登记（Explain/Explanation/三级标题+Grammar/级联按钮/历史操作/库页标题/空态/错误码表映射文案）；服务层只返回错误码，文案只在 UI 层；复用 Delete/Search 等既有 key，删除确认用新 key。
- [生成提示词成文与模型参数](issues/10-model-parameters.md): v1 提示词全文定稿（prompt-framework.md §7，promptVersion=1，英文 system + INPUT_TEXT 分隔 + 注入处理 + 分节 + JSON 示例）；参数 temperature 0.2 / maxOutputTokens 4096 / maxRetries 2，超时 120s（thinking=high 时 240s）；thinking 用户可配（explainerSettings，默认 off，Off/OpenRouter→reasoningEffort/Ollama→think 布尔，不支持静默忽略）；暴露面=语言+thinking 可配，provider/model/params 只读。

### 状态

**全部 10 张决策票已解析**，地图完成——前路已清，无待决问题，可进入实现阶段。实现输入 = 本 map 的 Decisions-so-far + `prompt-framework.md`（§7 含 v1 提示词与参数）+ `CONTEXT.md` 术语。

## Not yet specified

- [讲解 AI 路由敏感参数治理（open）](tickets/10-explainer-ai-route-security.md): `/api/ai/explain` 当前把 `apiKey/provider/baseURL/model` 作为请求体输入（客户端 BYOK，任意端点 + 未登录可访问）；讨论后确认 key 在 body 本身非漏洞、服务端无用户 AI 配置存储（`aiSettings.*` 不在 settings 同步白名单），且 `sourceLang/nativeLang/thinking` 为读取上下文数据须留请求体。待定主路径 A（hosted 单一 key）/ B（服务端按用户配置）/ 仅先做"必须登录"，及收敛范围（只 explain 还是连 chat/embed）。延后处理。
- 多版本留档与对比（覆盖式重新生成之外，将来可给"改前版本"留历史）。
- 上限与目标水平（如 B1）用户可配置化。
- 讲解与现有词典/翻译弹窗的联动跳转（如在词句帮助中点击跳 DictionaryPopup）。
- notes 与原文的位置映射（条目在原文中的偏移/高亮定位——当前 note.original 为表面形式，未来可加 location 引用）。
- 讲解层级（simple/notes/译文）默认展开行为的用户设置化（v0 单点常量，面板结构已预留）。
- 删除书籍时清理对应讲解条目（跨 library 删除路径挂接）。
- 讲解库全文检索（FTS5，替代 v0 的 text LIKE 搜索）。
- WordLens 词频/词典交叉校验（idea.md §32.C 第四板斧）：生成后用词频秩检查 meaningL/noteL 是否"用难词解释难词"（v1 已定案 prompt-only，校验留待后续）。

## Out of scope

- legacy pages 阅读器（`src/pages/reader/[ids].tsx`）兼容。
- 跨设备同步。
