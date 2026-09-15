# Map: 讲解 (Explainer) 的输出预算与截断风险

## Destination

一份关于"是否、以及如何收敛讲解的输出预算"的**决策**：既降低输出 token 成本（实测占账单 68–85%），也消除 thinking-off 上限被触顶截断的风险（旧上限 4,096 已于 2026-09-10 抬到 8,192，见 Decisions）。允许结论是"维持现状，不做改动"。

## Notes

- **来源**：本图是从 `.scratch/explainer-cost/` 拆出的独立后续。那张地图已就"prompt 缓存"作出**"不做"**的决策并关闭（终点已达成）；但实测暴露的输出侧问题不是缓存问题——它既是大头成本、又是**质量事故风险**——故单独成图，不随原图一起关闭。
- **先读，不要重复调研**：
  - `../explainer-cost/provider-cache-matrix.md` —— 成本结构、provider 机制、token 实测（BPE）。
  - `../explainer-cost/issues/02-measure-cache-hits.md` 的 `## Answer` —— DeepSeek 实测输出 token 分布与缓存数字。
- 域：readest (`apps/readest-app`)，`src/services/explainer/`。相关 skill：grilling、prototype、research。
- 语言：与用户用中文讨论；代码/文档英文术语以 `CONTEXT.md` 为准。

### 已定前提

- **"输出质量不回归"是硬门槛**：任何调参若使四级级联（simple → notes → grammar → translationM）降质，即为不可接受，无论省多少。
- 本图**只做决策，不实现**。
- 不重算已有基线，直接引用上面两份产出物。

### 已查明的事实（来自原图，勿重复测量）

- 实测输出：**2,294 / 2,699 / 2,874 / 3,309 tokens，均值 ≈ 2,794**（4 次真实调用，500 词选段）。
- `explainerMaxOutputTokens`：thinking **off → 8,192**（2026-09-10 从 4,096 上调）；low/medium/high → **40,960**（`constants.ts:29,36`）。
- **其中一次输出 3,309 = 旧上限 4,096 的 81%** → 触顶截断风险真实存在，不是理论担忧（上限抬到 8,192 后余量充足）。
- 截断会打断 JSON → 落到 salvage 兜底路径 → 用户看到的是**讲解质量变差**，而非账单变化。
- 输出占账单 **68.2%**（DeepSeek 价格比 1.5×）；同 token 数在 4× 价格比的 provider（Gemini 2.5 Flash-Lite / OpenAI）上约 **85%**。
- system prompt 1,219 tokens；其中 **TASK 段 710（58%）、OUTPUT FORMAT 235**。
- 实测 `prompt_tokens = 1,884` 与 BPE 预测逐 token 吻合，故上述 token 数字可信。

## Decisions so far

<!-- 闭合的 ticket：一行 name + 一句结论摘要 + 链接 -->

- **上限抬升（2026-09-10 实现，票 01 的"防事故"分支）**：thinking-off 输出上限 **4,096 → 8,192**（`constants.ts` 的 `maxOutputTokensOff`，web 路由 / Tauri 直连 / 面板共用同一取值）；thinking ≠ off 维持 40,960。依据：实测均值 ≈ 2,794、峰值 3,309 已占旧上限 81%，余量不足会触发 JSON 截断 → salvage 兜底。票 01 的其余问题（thinking 档位敞口、prompt 瘦身、质量验收、优先级）仍待决。

## Not yet specified

- 输出上限与 thinking 档位应做成**用户可见的设置**，还是维持集中常量（`constants.ts` 已预留"未来升为设置项"）。
- 截断真正发生时的**用户可见行为**：salvage 兜底目前是否足够？是否需要显式提示"讲解被截断/不完整"并引导重新生成？

## Out of scope

- **prompt 缓存**——`../explainer-cost/` 已决策：不做（能命中的 provider 本来就自动命中、零代码；默认托管模型 gemini-2.5-flash-lite 受 2,048 门槛限制根本不可能命中，且上限仅占账单 ~11–19%）。
- **多轮追问 / 对话式讲解**作为产品能力。
- 其它 AI 调用（chat / Reedy / 翻译）的输出预算。
