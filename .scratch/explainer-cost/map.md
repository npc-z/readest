# Map: 讲解 (Explainer) 的 LLM 成本与 prompt 缓存

## Destination

一份关于"讲解（Explainer）的 LLM 调用是否、以及如何利用 prompt 缓存降低费用"的**决策**——明确允许结论是"不值得做"。若判定值得做，须同时给出：请求形态的改造方案、落到哪个 provider 的哪种缓存机制、以及可验证的省费估算与判定门槛。

> **2026-09-10 修订（两轮证据之后）**：票 01 的机制调研显示 prompt 缓存上限只有总账单的 ~11%，而**真正的杠杆在输出侧与已有的 DB 缓存**；票 02 的 DeepSeek 实测确认了缓存**确实命中且零代码改动**，但只值 **12–19%**，同时发现**真实输出比估算高 40%**、已逼近 thinking-off 的 4,096 上限。终点表述不变（仍是"是否/如何降本"的决策），但评估重心已从"缓存怎么做"转为"缓存值不值得做 + 输出侧该不该做"。

## Notes

- 域：readest (`apps/readest-app`)，仅 explainer 的 AI 调用通路。相关 skill 每次会话按需调用：grilling、domain-modeling、research。
- 消耗前读 `CONTEXT.md`（术语以它为准）。
- 与已有 `explainer` effort 的关系：本图**只做成本决策**，不改功能规格。功能规格见 `.scratch/explainer/map.md`（10 张决策票已全部解析）。
- 语言：与用户用中文讨论；代码/文档英文术语以 `CONTEXT.md` 为准。
- **先读 [`provider-cache-matrix.md`](provider-cache-matrix.md)**——票 01 的产出物，含实测 token 数、provider 机制表、成本结构与杠杆排序。后续每张票都应基于它，不要重复调研。

### 已定前提（charting 时经用户确认，勿重开）

- **终点是决策，不是实现**：允许结论为"不做"。
- **成本归属分权重**：用户 BYOK（OpenRouter 自有 key）与 Readest 托管路径（web 默认走 `/api/ai/explain` + ai-gateway）都要算，但判定标准分开。
- **主方案 = 无状态前缀稳定**，多轮会话仅作为机制之一一并评估，不作为主路线。
- **允许输出侧/参数侧作为对照方案**（`maxOutputTokens`、thinking 等级、prompt 瘦身）。
- **先实测再决策**：不接受纯推算。（票 01 已用真实 BPE 实测 prompt 尺寸；剩余实测见票 02。）
- **"输出质量不回归"是硬门槛**，优先重排而非重写 prompt。
- **接受"突发式命中"**：只追求用户连续划词时命中，不引入显式长 TTL 缓存或自建缓存层。

## Decisions so far

<!-- 闭合的 ticket：一行 name + 一句结论摘要 + 链接 -->

- [Provider 缓存机制矩阵](issues/01-provider-cache-mechanics.md): system prompt 实测 **1,219 tokens**、仅 **1.6%** 随 L/M 变化 → **前缀稳定已成立、零代码改动**，故"把 L/M 挪出 system prompt 扩大跨语言复用"方向作废；**默认配置（gemini-2.5-flash-lite）今天节省 $0**（请求 1,884 < Gemini 隐式门槛 2,048，Flash-Lite 甚至未列入表）；能命中时上限也只有总账单 **~11%**（DeepSeek ~25% 最佳且全自动）；**输出 token 占账单 81%**、thinking≠off 把输出上限从 4,096 抬到 **40,960**（满预算一次 = 典型调用的 16.6 倍）；全仓库无显式缓存控制、且**从不读 `result.usage`**（零可观测性）。
- [实测缓存命中、真实输出用量与 DB 缓存命中率](issues/02-measure-cache-hits.md): DeepSeek 实测 **缓存确实命中且零代码改动**——同 system、换选段时 **1,024/1,884 = 54.4% 输入命中**（对照：换 `nativeLang` 即归零，证明严格按前缀判定）；输入成本降 **51.1%**、等输出口径总成本降 **~16%**；**真实输出 2,294–3,309 tokens（均值 ~2,794），比票 01 估算高 40%**，其中一次已达 thinking-off 上限 4,096 的 **81%**（触顶截断风险 → 转 [输出预算收敛与截断风险治理](../explainer-output-budget/issues/01-output-budget.md)）；实测 `prompt_tokens=1,884` 与票 01 的 BPE 预测**逐 token 吻合**。结论：**缓存是小杠杆（12–19%），不是数量级节省**。未测：DB 缓存命中率、两条通路一致性、官方价目表（沙箱取不到）。
- [降本门槛与优先级](issues/03-cost-bar-and-priority.md): **未独立解析，被最终决策吸收**——缓存部分结论为"不做"，输出侧部分迁往 `../explainer-output-budget/`。保留文件仅为记录该问题曾被提出及消解方式。
- [最终决策：做 / 不做 / 做什么](issues/05-final-decision.md): **决策：prompt 缓存不做，无实现工作。** 初始问题"复用会话能否命中缓存省钱"的答案：**能命中，但不需要"复用会话"，且不值得为它做任何事**。决策在两条分支上都成立——能自动命中的 provider 本就免费命中、无事可做；默认托管模型 gemini-2.5-flash-lite 受 2,048 门槛限制根本不可能命中、代码无解。剩余可选改动（Anthropic `cacheControl`、OpenRouter `prompt_cache_key`）上限同样只有 12–19%，低于合理门槛。重估触发条件：prompt 大幅变长越过门槛，或出现通往需显式标记的 provider 的原生通路。
- 调研附带发现的两个**非成本**问题（2026-09-10 修复，不属于本图任何票）：`prompts.ts` 在 `sourceLang ≠ 'en'` 时硬编码 "adult English-language writing" → 改为语言中立的 "plain and natural adult writing"（`.scratch/explainer/prompt-framework.md` 同步）；讲解缓存键不含 `sourceLang` → `explainerCacheKey` 与 `ExplainerDb` 均改为 `(book_hash, text_hash, source_lang, native_lang)`。该 schema 未发布，故直接把原迁移 `2026090301_explainer` 的唯一键改成四列、不新增迁移（已有 v1 本地库需手动删除）。同批次的输出上限调整（thinking-off 4,096 → 8,192）记在 `../explainer-output-budget/`。

### 状态

**地图完成——终点已达成。** 最初的问题得到带实测数据的回答，且是允许的"不做"结论。输出侧问题不随本图关闭，已迁出为独立地图 `../explainer-output-budget/`。本图无剩余待决内容。

## Not yet specified

<!-- 能看出要来、但还说不成一句精确问题的雾 -->

- 缓存与用量的**可观测性**：`result.usage` 目前完全未读，`inputTokenDetails.cacheRead` / 输出 token 都不可见。是否补上遥测——它是"验证缓存确实命中"、"验证输出侧省费"以及**测出 DB 缓存真实命中率**的共同前提（票 02 已把 DB 命中率列为未测空白，而 03 折算残余流量正需要它）。归属哪张票尚未定。
- 输出侧调参对**四级级联质量**的影响边界：thinking 关闭（已默认）与输出上限收敛是否会让 grammar 级或长段翻译降质，需要一套与票 04 共用的质量验收方式。票 02 实测输出已到 4,096 的 81%，这条从"边界问题"升级为"实际风险"。

## Out of scope

- **多轮追问 / 对话式讲解**作为产品能力（"这句为什么这么写"）。本图只回答成本问题；该能力另开一张地图。
- 其它 AI 调用（chat / Reedy / 翻译）的缓存优化——它们共用 provider 设置，但各开一张地图。
- **prompt 结构重排**（把 L/M 移出 system prompt）：票 01 以实测数据否决——可换取的复用面只有 19 tokens / 1.6% 前缀，在质量硬门槛下不划算。若将来 prompt 大幅变长（如加入词频校验的大词表），此判断需重估。
- **输出侧降本与截断风险**：**不随本图关闭，已迁出**为独立地图 `../explainer-output-budget/`。它承载的是实测暴露的**质量事故风险**（输出曾达 thinking-off 旧上限 4,096 的 81%，截断会掉进 salvage 兜底；上限已于 2026-09-10 抬到 8,192，见该图），不是缓存或本图的成本问题。
