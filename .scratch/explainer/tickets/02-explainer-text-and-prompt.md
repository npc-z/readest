# 02: 纯函数与常量：归一化/哈希/单位截断 + prompt 与参数单源

**What to build:** 讲解的文本与提示词地基——一条文本如何归一化为缓存键、如何按语言计量与截断、v1 提示词全文与生成参数从哪出。规则与样例表在此票固定，后续服务层只调用，不重新发明；纯函数、无平台依赖。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 归一化链：strip HTML/实体 → NFKC → lowercase → 标点 → 空白折叠 → sha256；展示版 `text`（含换行）与 `text_hash`（归一化结果）分离存储
- [x] 单位计量：英文按词、CJK 按字符；上限 500 单位，超限截断前 500 并显式标记（供 UI 出 toast）；纯标点/空白 → 判空，不触发生成
- [x] 生成参数常量单源：temperature 0.2、maxOutputTokens 4096、maxRetries 2、默认超时 120s（thinking=high 时 240s）、错误码表、上限常量（预留未来设置化）；Web route 与原生直连共用同一组常量
- [x] prompt 模板：v1 全文以 `.scratch/explainer/prompt-framework.md` §7 为准（promptVersion=1；分节 IDENTITY/TARGET READER/INPUT/TASK/CONSTRAINTS/OUTPUT FORMAT；`{L}`/`{M}` 由服务层替换，仅 TARGET READER 句为水平敏感可参数化；`<INPUT_TEXT>` 分隔，含 `</INPUT_TEXT>` 的输入由服务预检拦截为 invalid-input，不入模型）
- [x] 载荷校验：zod schema 与 §7 输出形状一致（simple 必填、notes≤15 允许空、grammar≤2、translationM 可选、metadata.sourceLang/nativeLang/promptVersion），字段 permissive 便于降级
- [x] 错误码与文案解耦：服务层只产代码（ai-not-configured/timeout/provider-error/no-object-salvaged/invalid-input），文案只活在 UI 层
- [x] 测试样例表：归一化（HTML 实体/全半角/大小写/标点/换行）、计量与截断（EN 词/CJK 字符/纯标点弃用）、prompt 构建（变量替换 + promptVersion 常量注入）、zod 校验与降级输入示例
