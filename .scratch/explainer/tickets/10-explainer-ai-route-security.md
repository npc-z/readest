# 10: `/api/ai/explain` 敏感参数治理（密码配置化 / 认证收口）

**What to build:** 把讲解的 Web AI 通路（`/api/ai/explain`）从"客户端把 `apiKey/provider/baseURL/model` 作为请求体输入"收紧为更安全、更符合"请求只带选中文本"的形态。**本票为开放问题（open），仅记录当前已查清的事实与待定决策，暂不动手**——用户已决定先记录、后续再继续完善。

**Blocked by:** 无（独立于 01–09；不阻塞其它票）。

**Status:** open · 2026-09 讨论，延后处理

---

## 问题背景 / 目标

用户主张：`/api/ai/explain` 的请求参数应"从配置里读取"，而不是由 API 显式传递，因为当前会把 API key 带进请求体、疑似泄露。理想形态是请求体**只带被选中文本**。讨论中发现这是一个多维问题，不能简单归为"请求只传文本"，且与 chat/embed 的差异关键在架构，故记录结论与分歧，留待定案。

## 已查清的事实（代码依据，勿重查）

### 1. 当前请求体与路由行为（`src/services/explainer/gateway.ts` + `src/app/api/ai/explain/route.ts`）

- Web 端 `WebExplainerAiGateway.generate()` 组装请求体：
  `{ text, sourceLang, nativeLang, thinking, apiKey, model, provider, baseURL }`，POST 到 `/api/ai/explain`。
- 路由按 body 读取：`apiKey` 无则回落到 `process.env.AI_GATEWAY_API_KEY`；`model/provider/baseURL` 也全来自 body（缺失才用服务器默认值）。
- 路由把 `provider`/`baseURL`/`model`/`apiKey` 当作**不可信客户端输入**处理，故带：`isSafeExternalBaseURL` SSRF 守卫（注释自认 DNS-rebinding 未关死）+ BYOK 按 IP 进程内限流。

### 2. 设置存储真相：Web 端 AI 配置只存浏览器，**从不落库**

- Web 端所有设置（含 `aiSettings`）经 `indexedDBFileSystem`（`src/services/webAppService.ts`）写入浏览器 IndexedDB（`AppFileSystem` 库）的 `settings.json`，不出本机、不上服务器。
- 登录后触发的设置同步管道（`replicaSettingsSync.ts` → `SETTINGS_WHITELIST`）**不包含 `aiSettings.*`**：`SETTINGS_WHITELIST`、`SETTINGS_DICTIONARY_FIELDS`、`SETTINGS_ENCRYPTED_FIELDS` 都未列 AI 的两个 key（`aiGatewayApiKey`/`openrouterApiKey`）。`backupService.ts` 引用它们只是导出 zip 时**剥离凭证**（本机到本机），非服务器落库。
- 结论：**服务端当前没有任何用户 AI 配置存储**。服务器要拿到用户 key，唯一渠道就是客户端把它放进请求体（BYOK）。

### 3. 三个 AI 路由的差异（这才是安全评估的骨架）

| | explain | chat | embed |
|---|---|---|---|
| 未登录可访问 | ✅（BYOK 分支跳过会话校验，仅靠内存按 IP 限流） | ❌（先 `validateUserAndToken`，未认证 403） | ❌（同上） |
| 客户端可传 `apiKey` | 是 | 是 | 是 |
| 客户端可传任意 `baseURL` | **是**（openrouter 分支，有 SSRF 守卫，best-effort） | 否 | 否 |
| 客户端可传任意 `model` | 是 | 是 | 否（用 env） |

- **唯一"未登录也能进"的路由是 explain**；且它允许任意 baseURL，等同一个**无需登录的、可指向任意公网 HTTPS 端点的免费代理**，防线仅进程内按 IP 限流（serverless 多副本近乎摆设）。
- chat/embed 结构安全：`createGateway` 固定走 Vercel AI Gateway（`@ai-sdk/gateway` 默认 `https://ai-gateway.vercel.sh/v3/ai`，库内置常量，客户端碰不到 baseURL），路由无任意端点面，故不需要 baseURL 参数，也无需 SSRF 守卫。

### 4. key 在 body 本身不是漏洞（重要校准）

- 传输层 HTTPS 加密，中间人读不到。
- key 本就存在于浏览器 IndexedDB，DevTools/XSS 均可取，与"是否在 body"无关。
- BYOK 本质：key *必然*到达调用 provider 的一方（服务器，或改为客户端直连）；"从 body 拿走"不消除"服务器看到用户 key"，除非走 hosted 单一 key 或服务端存储。

## 真正的目标与遗留面

用户最初目标（"请求只带选中文本，key 从配置读"）能落地的只有 credential/endpoint 那组，`sourceLang/nativeLang/thinking` 是读取上下文数据，服务器推不出来，**必须留在请求体**（形态 `{text, sourceLang, nativeLang, thinking}`）。三者对照：

| 方案 | 关掉未认证滥用 | key 不上服务器 | 禁止任意 baseURL | 改动量 |
|---|---|---|---|---|
| 仅"必须登录"（BYOK 分支也校验会话） | ✅ | ❌ | ❌ | 小 |
| **A. hosted 单一 key**（服务器从 `AI_GATEWAY_API_KEY` 读，掐掉 BYOK/任意端点） | ✅ | ✅ | ✅ | 中 |
| **B. 服务端按用户 AI 配置**（新增受认证保护存储 + 自加密） | ✅ | ✅ | ✅ | 大 |

- **A/B 是"落到目标"的路径**，但要求服务端有凭据来源；A 需确认生产部署是否真设了 `AI_GATEWAY_API_KEY`（`.env.web` 目前为空，`.env.web.example` 有占位）。
- **"必须登录"只能关掉"未登录免费代理"，不能消除 key 上传与任意 baseURL**——登录解决"谁能用"，配置化解决"key 是否上服务器 + 客户端可否指定端点"，是不同维度。
- 若保留 web 端 BYOK（用户带自己的 OpenRouter/DeepSeek key 与自定义端点），则必须走 B；若 web 就是 Readest 自供 AI，则 A 最干净。
- explain 与 chat/embed 共用同一份 `aiSettings` 与同一套 provider 单例；chat/embed 调用方（`AIGatewayProvider`/`TauriChatAdapter`/`ProxiedGatewayEmbedding`）多为 Tauri 服务。收敛范围（只动 explain vs 三个一起）是另一个待定项。

## 待定决策（后续讨论时定案）

- **Q1 主路径**：explain 走 **A（hosted 单一 key）** 还是 **B（服务端按用户配置）**？还是仅先做"必须登录"（方案①）作为过渡？
- **Q2 收敛范围**：只改 `explain`，还是连同 `chat/embed` 一起（三者共用 `aiSettings` 与 provider 单例）？
- **Q3 前置事实核查**：生产部署层是否确实配置了 `AI_GATEWAY_API_KEY`（决定 A 可行性）。此点需派子代理查 `.env*`、docker、CI、Supabase secrets、部署文档。
- **Q4**：`sourceLang/nativeLang/thinking` 这三个读取信号字段仍留在请求体，确认不纳入"只传文本"。

## Notes

- 本票结论仅记录讨论事实与分歧，**不改变现有实现**；`src/app/api/ai/explain/route.ts`、`gateway.ts`、`constants.ts`、`schema.ts` 当前行为不变。
- 涉及文件：`gateway.ts`、`route.ts`、`constants.ts`、`schema.ts`、`settings.ts`(sync adapter)、`webAppService.ts`、`replicaSettingsSync.ts`、`AIGatewayProvider.ts`、`TauriChatAdapter.ts`、`ProxiedGatewayEmbedding.ts`、`access.ts`、`fetch.ts`。
- 相关既有票：`03-explainer-service-ai-path.md`（route 的 apiKey/model 随 body、system prompt 服务端构建即是本票讨论对象）。
