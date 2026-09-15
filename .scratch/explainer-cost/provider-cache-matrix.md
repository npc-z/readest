# Provider 缓存机制矩阵与成本基线

> 产出物：[Provider 缓存机制矩阵](issues/01-provider-cache-mechanics.md) 的调研结果。
> 方法：用真实 BPE（`gpt-tokenizer@3`，o200k_base + cl100k_base）对 `buildExplainerSystemPrompt` / `buildExplainerInputPrompt` 的**实际输出字符串**分词；选段用真实 500 词英文小说切片与 500 字中文维基片段。provider 机制取自官方文档（链接见文末），抓取于 2026-09-10。

## 1. 本功能的 token 实测

| 项 | 数值 |
| --- | --- |
| system prompt（en→zh-CN） | 5,401 字符 / 73 行 = **1,219 tokens**（o200k），1,216（cl100k） |
| 其中随 L/M 变化的部分 | **仅 39 字符 / 19 tokens（1.6%）**——`${sourceLang}` 出现在 7 处（`prompts.ts` 41,47,51,63,64,65,70），`${nativeLang}` 5 处（47,65,66,71,99） |
| 500 词英文选段 | **656 tokens**（含 `<INPUT_TEXT>` 包裹 665） |
| 单次请求输入 | system 1,219（**64.7%**）+ 选段 665（35.3%）= **1,884 tokens** |
| 输出上限 | thinking **off → 8,192**（2026-09-10 从 4,096 上调）；low/medium/high → **40,960**（`constants.ts:29,36`） |
| 其它参数 | temperature 0.2；maxRetries 2；超时 120s（thinking=high 240s） |

**结论：system prompt 对同一语言组合已 98.4% 逐字节稳定**，且作为 `system` 消息发在选段之前。前缀稳定这一条**已经成立，零代码改动**。

## 2. 可达的 provider（`src/services/ai/types.ts:3`）

| provider | 性质 | 默认模型 | 说明 |
| --- | --- | --- | --- |
| `ollama` | 本地，无 key | — | 仅 Tauri 直连；web 网关拒绝（`gateway.ts:161-168`） |
| `ai-gateway` | **Vercel AI Gateway**（Vercel 托管路由器） | `google/gemini-2.5-flash-lite` | `createGateway()` → `@ai-sdk/gateway@3`，`https://ai-gateway.vercel.sh/v3/ai`；token 零加价；BYOK 或服务端 `AI_GATEWAY_API_KEY`（`route.ts:156`，需登录） |
| `openrouter` | BYOK，通用 OpenAI 兼容客户端 | — | `createOpenAICompatible`（`OpenRouterProvider.ts:45-59`）；可指向任意 OpenAI 兼容端点（DeepSeek/OpenAI/Groq/vLLM 等） |

**App 内没有直连 Anthropic / OpenAI / Google 的原生 SDK。**

## 3. 各 provider 的缓存机制

| provider | 自动/显式 | 最小可缓存 | 命中价 | 写价 | TTL |
| --- | --- | --- | --- | --- | --- |
| OpenAI | **自动** | **1,024** | 0.1× | 1.25× | 30 分钟（新模型），否则 5–10 分钟不活动 |
| Anthropic | **必须显式** `cache_control`（≤4 断点） | **1,024**（Sonnet 5/Opus 4.8 等），部分模型 512/2,048/4,096 | 0.1× | 1.25×（5m）/ 2×（1h） | 默认 5 分钟，可选 1 小时 |
| Gemini | 隐式自动 | **2,048**（2.5 Flash/Pro；**2.5 Flash-Lite 未列入**） | 0.1× | — | — |
| DeepSeek | **自动** | **64** | ≈0.02–0.033×（省 98%） | 免费 | 数小时–数天 |
| OpenRouter | 透传 | 取决于上游 | 透传无加价 | — | 自动粘性路由，10 分钟空闲失效 |
| Vercel AI Gateway | 默认透传 | 取决于上游 | 零加价 | — | `providerOptions.gateway.caching:'auto'` 仅 Anthropic/MiniMax/Alibaba，且**未在已安装的 v6 类型中**（未验证） |

AI SDK v6 形态：`providerOptions:{<namespace>:{...}}`，namespace = `model.provider` 首个点分段。**自动缓存无需任何 SDK 选项。**

## 4. 已实现的缓存（不要归错功）

- DB 缓存 `explanations`，键 `(book_hash, text_hash, native_lang)`：**同一段文本重复讲解零网络请求**（`ExplainerService.ts:91`）。
- `pendingByKey` 并发去重 → 并发重复只发一次（`ExplainerService.ts:78,95-107`）。
- `regenerate()` 显式绕过两者（116-123）。
- `textHash` = NFKC/小写/去标点后 sha256（`text.ts:66-89`），格式变体共享条目。
- **全仓库无任何显式缓存控制**（`cacheControl`/`promptCacheKey`/`cachedContent`/`cachePoint` 零命中）。
- **App 从不读取 `result.usage`** → 今天没有任何缓存命中可观测性。

## 5. 成本结构（决定性）

以仓库自己的默认模型价格（`gemini-2.5-flash-lite`，$0.10/M 输入、$0.40/M 输出）折算一次典型调用：

| 项 | tokens | 成本 | 占比 |
| --- | --- | --- | --- |
| 输入（system + 选段） | 1,884 | $0.000188 | 19% |
| 输出 | ~2,000 | $0.0008 | **81%** |
| **其中 system prompt** | 1,219 | $0.000122 | 12.3% |

- **完美缓存整个 system prompt（省 90%）最多省 $0.000110/次 ≈ 11% 总账单。**
- 换 gpt-5-nano 价格 ≈ 6%；DeepSeek（省 98%）≈ 25%；Anthropic/Sonnet-5 ≈ 9%。
- **默认模型（gemini-2.5-flash-lite）今天的实际节省 = $0**：Gemini 公布的隐式缓存门槛是 2,048 tokens，而整个请求只有 1,884 tokens——**两种读法（只看前缀 / 看全 prompt）都不够门槛**。
- Gemini 显式缓存在低量下是负收益：存 1,219 tokens 成本 $1.00/M/小时 = **$0.00122/小时 ≈ 11 次调用的节省/小时**（同一前缀每小时读满 ~11 次才回本）。

## 6. 杠杆排序（真正的结论）

1. **输出侧最大**：开启 thinking 会把上限从 off 档的 8,192 抬到 **40,960**；一次最坏情况的 thinking 调用 = $0.0164 输出 = **典型调用的 16 倍**。
2. **已实现的 DB + 并发缓存**：重复选段 = $0，100% 节省。
3. **prompt 缓存排最后**，且只在门槛满足的通路上有效：OpenAI ≥1,024 ✓（1,219 刚过）、Anthropic ≥1,024 ✓、**DeepSeek ≥64 ✓ 且自动、零代码**。可达集合里 DeepSeek 缓存表现最好。

## 7. 来源

- OpenAI: https://developers.openai.com/api/docs/guides/prompt-caching
- Anthropic: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Gemini: https://ai.google.dev/gemini-api/docs/caching · https://ai.google.dev/gemini-api/docs/pricing
- DeepSeek: https://api-docs.deepseek.com/guides/kv_cache
- OpenRouter: https://openrouter.ai/docs/guides/best-practices/prompt-caching
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway/models-and-providers/automatic-caching
