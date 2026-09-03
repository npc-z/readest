# 讲解载荷 Schema 与分级语义

Type: grilling

## Question

定版讲解载荷（payload）的 JSON schema 与各级内容的语义：

- 字段划分：simple（Simple L 重述）、notes（词/短语/习语帮助列表）、translationM（母语译文）、元数据（promptVersion、sourceLang、nativeLang、字数等）。
- `notes[]` 的语义：`kind`（word/phrase/idiom 如何划分）、`original` 原文片段、`meaningL` 是否必填、`example`、`meaningM` 何时有值。
- 级联呈现依赖的字段不可变规则（渲染端依赖哪些字段、哪些允许将来演进）。
- payload 非法/残缺时的展示降级（缺某节就只渲染该节）。
- 一句话讲解 vs 段落讲解的结构差异（notes 列表为空是否合法）。

前置：01 的方针结论。B 票只定 schema 不变式，具体 prompt 措辞归 03。

Blocked by: 01

Status: resolved

## Answer

B 票定版（型别用 TS 表示；AI SDK 侧以 zod 表达，permissive 原则）：

```
{
  simple: string,                       // 必填；多段选中时允许段间 \n；句/段共用同一 schema
  notes?: {                             // 按原文出现顺序；空数组合法（≤15 条，超限服务层截断并列入 Answer）
    kind: 'word' | 'phrase' | 'idiom',  // collocation / fixed expression 归 phrase
    original: string,                   // 原文表面形式
    meaningL: string,                   // 必填：L 内释义，用比词条更简单的话
    example?: string,                   // phrase|idiom 由 prompt 必给；缺失时 UI 隐藏该行
    meaningM?: string,                  // 仅 opaque idiom 或 L 内释义过难时给
  }[],
  grammar?: {                           // 可选：只挑真正难的句法结构，≤2 条；句法平庸就省略
    structure: string,                  // 原文里难段的表面形式
    noteL: string,                      // 必填：用简单 L 解释该结构
    noteM?: string,                     // 仅当 noteL 对目标学习者仍难懂时给（与 notes.meaningM 同规则）
  }[],
  translationM?: string,                // prompt 必填要求（一次调用成本同）；schema 保持 optional，缺失走降级
  metadata: {
    sourceLang: string,                 // L，ISO 639-1（命名固定：不用 targetLang，避撞 translator 语义）
    nativeLang: string,                 // M，ISO 639-1（生成时 UI 语言快照）
    promptVersion: number,
    format?: 'json' | 'text',           // 默认 'json'；降级阶梯纯文本兜底时写 'text'
  },
}
```

> 修订（idea.md 对照评审，2026-09-02）：级联纳入 **第四级 Grammar（grammar? 字段）**——可选数组、≤2 条、`noteL 必填 / noteM 仅难懂时给`；因其为新增可选字段 + v1 尚未发布，直接并入 v1，`promptVersion` 仍为 1；02 的"只增不改"演进规则不受影响。级联顺序：简单版 → 词句帮助 → 语法要点 → 母语译文。

不变式：

- **渲染依赖**：simple、notes[].{kind,original,meaningL,example?,meaningM?}、grammar[]?.{structure,noteL,noteM?}、translationM、metadata.{sourceLang,nativeLang,promptVersion,format}。
- **演进规则**：schema 只增不删不改（新增一律 optional）；破坏性变更 → promptVersion 递增 + 03 的统一重新生成策略，渲染层永久按旧版兼容解释。
- **残缺降级（展示层）**：simple 缺失/空 → 整条目无效（展示强错误态 + 重新生成，无效判定在 03 校验）；notes 缺失 → simple（+grammar）+ translationM；grammar 缺失 → 前两级 + 译文照常；translationM 缺失 → simple + notes + grammar；单条注缺 meaningL 但有 meaningM → 显示 meaningM；仅有 original → 以原文样式显示该行；无释义且无意义的条目 → 03 校验阶段剔除。
- 知识点：上限 15 条、空 notes 合法——均服务于"句子完全理解也允许讲解"。

Blocked by: 01
