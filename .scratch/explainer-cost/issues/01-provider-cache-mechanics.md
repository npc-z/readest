# Provider 缓存机制矩阵

Type: research

Blocked by: 

Status: resolved

## Question

本 app 可达的每个 provider，其 prompt 缓存机制分别是什么？需要回答到能直接支撑"选哪个机制"的程度：

1. **自动 vs 显式**：OpenAI / Anthropic / Google Gemini / DeepSeek / OpenRouter 各自是自动前缀缓存，还是必须显式打标记（如 Anthropic 的 `cache_control` 断点、Gemini 的 `cachedContent`）？
2. **门槛**：每个 provider 的最小可缓存 prompt 长度（token 数）是多少？——若门槛高于本功能 system prompt 的实际长度，缓存直接不成立，这是**否决性问题**，优先回答。
3. **折扣与写入成本**：缓存命中的输入 token 打几折？是否有缓存写入溢价（如 Anthropic 读 90% off + 写 25% premium）？
4. **TTL**：缓存存活多久（OpenAI 约数分钟不活动、Anthropic 默认 5 分钟 / 可选 1 小时、Gemini 显式 TTL）？
5. **作用域**：缓存按 API key / org 隔离吗？仅在前缀之后不同的请求能共享吗？
6. **OpenRouter 转发**：它如何把缓存透传给上游？路由到的模型都能吃到吗？
7. **AI SDK 形态**：本项目用的 `ai`（Vercel AI SDK）需要什么 `providerOptions` 结构才能启用**显式**缓存？**自动**缓存是否完全不需要 SDK 侧配置？
8. **本项目的 ai-gateway 是什么**：Readest 自建托管网关、第三方服务，还是通用 OpenAI 兼容 base URL？它的缓存行为由谁决定？

来源：官方 provider 文档优先（附 URL），辅以 `ai` SDK 文档；本地事实（provider 清单、model 构造路径、base URL）以仓库代码为准。

已知的前置事实（见 `map.md`）：system prompt 由 `buildExplainerSystemPrompt({sourceLang, nativeLang})` 生成，已与选段分离；两条通路（Tauri 直连 / web `/api/ai/explain`）provider 装配不同。

产出：一份机制矩阵，落位本 effort 下 `provider-cache-matrix.md`；若第 2 问的结论是"门槛不满足"，须在答案里直接点明这会否决整条路线。

## Answer

**产出物：[Provider 缓存机制矩阵与成本基线](../provider-cache-matrix.md)**（含实测 token 数、provider 机制表、成本结构、杠杆排序与来源链接）。

用真实 BPE 对 `buildExplainerSystemPrompt` 的**实际输出**分词（非估算），得四条决定性结论：

1. **前缀稳定这一条已经成立，零代码改动。** system prompt = **1,219 tokens**，其中只有 **19 tokens（1.6%）** 随 L/M 变化——`{sourceLang:'en', nativeLang:'zh-CN'}` 下与"清空语言值"的骨架相比只差 39 字符。它已作为 `system` 消息发在选段之前。因此**"把 L/M 挪出 system prompt 以扩大跨语言组合复用"这个方向的收益上限是 1.6% 的前缀**，在质量硬门槛下不值得做——该改造方向据此作废。
2. **默认配置下今天的实际节省 = $0。** Gemini 公布的隐式缓存门槛是 **2,048 tokens**（2.5 Flash/Pro；**2.5 Flash-Lite 未列入表**），而整个请求只有 1,884 tokens、可缓存前缀只有 1,219 tokens——**两种读法都不够门槛**，代码层面无解。Gemini 显式缓存在低量下更是负收益：存 1,219 tokens 成本 $1.00/M/小时 = **$0.00122/小时，约等于 11 次调用的节省**，须同一前缀每小时读满 ~11 次才回本。
3. **即使在能命中的 provider 上，prompt 缓存也是小杠杆。** 完美缓存整个 system prompt 最多省 **~11%** 总账单（gpt-5-nano ≈6%、Anthropic Sonnet-5 ≈9%、**DeepSeek ≈25% 为可达集合最佳且全自动零代码**）。因为**输出 token 占账单 81%**，而整个 system prompt 只占 12.3%。
4. **真正的杠杆在输出侧与已有的 DB 缓存**：thinking≠off 会把输出上限从 4,096 抬到 **40,960**，一次满预算的 thinking 调用光输出就 **$0.0164 = 典型调用的 16.6 倍**；而重复讲同一段文本由 DB 缓存兜住、成本 **$0**（100% 节省）。

附带查明（供其它票取用）：`ollama` 本地无成本；`ai-gateway` = **Vercel AI Gateway**（Vercel 托管路由器，token 零加价，默认模型 `google/gemini-2.5-flash-lite`）；`openrouter` 实为通用 OpenAI 兼容客户端，可指向 DeepSeek/OpenAI 等任意端点（`api.deepseek.com` 即最佳缓存 deal：门槛 64 tokens、省 98%）。全仓库**无任何显式缓存控制**，且**从不读取 `result.usage`** → 今天没有任何缓存命中或输出用量的可观测性。

一个可行动的小改进（留给最终决策票评估）：OpenRouter 的自动粘性路由以"首个 system + 首个非 system 消息"的哈希为键，而本功能的非 system 消息正是**每次都变的选段**，等于路由键不稳定；显式传 `prompt_cache_key`/`session_id`（按书）可提高命中率。注意 `@ai-sdk/openai-compatible` 会把未知键原样透传到请求体，所以这条路可行。
