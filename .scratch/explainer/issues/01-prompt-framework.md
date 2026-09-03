# 讲解 Prompt 方针研究

Type: research

## Question

"讲解"的 AI 生成应为**任意目标语言 L**（v0 英文书优先）产出三级脚手架。为它定版一套 prompt 方针（policy + 结构建议），研究并汇总：

1. **分级简化政策**：简单版重述的约束——高频词优先、保持语义与重要语法关系/时态/逻辑、不儿童化、不加原文不存在的信息、文学文本（隐喻/古雅用法/非常规句序）如何处理。
2. **短语优先政策**：识别学习单位（phrasal verbs、idioms、collocations、fixed expressions）而非孤立单词，识别方法（逐词标注 vs 释义问题）。
3. **释义语言政策**：词句帮助以 L 内释义为主、母语 M 兜底；何时给 example。
4. **难度目标**：无用户水平模型的 v0 下，用一个稳定的"目标中等学习者"措辞；预留参数化入 future（prompt 分节、不改结构）。
5. **输出结构建议**：对 `generateObject` 结构化输出最有利的字段划分（simple 重述 / notes \[{kind, original, meaningL, example?, meaningM?}\] / translationM / 元数据），附 JSON 示例，含失败退化策略（如 JSON 解析失败时的兜底）。

来源：外部知识（语言学习法、简化/分级文献、LLM prompt 工程实践）+ 现有 Reedy/翻译/词典 prompt 风格做对照。产出物落位本 effort 下 `prompt-framework.md`。

Blocked by: 

Status: resolved

## Answer

结论：讲解 prompt 采用"同语言重述 + 短语优先 + L 内释义/母语兜底"方针，用稳定措辞"为 CEFR B1 及 2000–3000 高频词族的成人中等学习者"固定难度靶点（未来仅替换 TARGET READER 短句即可参数化）。

1. 分级简化：高频词优先、保留时态/情态/逻辑关系；不做儿童化（plain language 而非 child-speak）；不得新增原文没有的信息；文学文本保留隐喻、古旧词记为 note、非常规语序归一为 SVO。
2. 短语优先：学习单位 = 多词 chunk（phrasal verb / idiom / collocation / fixed expression）；用"整体意义是否可拆"启发式识别，宁选短语不选单词，过简段落不下注。
3. 释义语言：每注必给 meaningL；仅当 L 内释义过难或系 opaque idiom 时才补 meaningM；phrasal verb/idiom/collocation 必须给单句 example。
4. 难度目标：一短句 + promptVersion，prompt 分节（IDENTITY/TARGET READER/INPUT/TASK/CONSTRAINTS/OUTPUT FORMAT），未来只改 TARGET READER 不改结构。
5. 输出结构：`{simple, notes[{kind: word|phrase|idiom, original, meaningL, example?, meaningM?}], translationM?, metadata{targetLang,nativeLang,promptVersion}}`；readest 的 ai@6.0.47 已弃用 generateObject，改走 `generateText + Output.object()`；JSON 失败降级顺序：parsePartialJson 抢救 → 纯文本 fallback → toast + 重新生成。

详见 findings: `prompt-framework.md`
