# 生成服务与错误/并发语义

Type: grilling

## Question

讲解的 AI 生成服务（如 `src/services/explainer/llm.ts`）如何构成：

- 调用面：`getAIProvider(settings)` + `generateObject`；Tauri 直连、Web 走 `/api/ai/explain`（createGateway + generateObject，密钥/模型由 body 携带，沿用 `/api/ai/chat` 模式）——确认非流式与超时行为。
- prompt 模板组织（方针在 01，这里定结构与 patch 点）、`promptVersion` 递增时机。
- 错误分类与 UX 语义：provider 未配置 / 超时 / 网络失败 / JSON 解析失败 / 载荷校验失败分别如何呈现（toast 文案、内联态、是否重试）。
- 并发去重：同一键生成进行中再触发（同 promise 复用）、缓存命中即返回、生成成功后落库时序（先存后展示 or 先展示后存，含崩溃恢复）。
- 非流式等待期间 PC/移动端 loading 表现（骨架/按钮态）。

Blocked by: 01, 02

Status: resolved

## Answer

B 票定版：

- **架构**：镜像 chat 现状——Ollama（本地）在 Tauri 平台走 `getAIProvider` 直连；OpenRouter / AI-Gateway 走新增 `/api/ai/explain` route（`createGateway` + `generateText`，apiKey/model 从 body 携带，沿 `/api/ai/chat` 惯例）。客户端与路由共用同一 prompt 常量与 zod schema。
- **调用面**：`generateText({ output: Output.object() })`（ai@6.0.47 已弃用 `generateObject`）；一次性非流式；沿用 SDK 默认 `maxRetries: 2`；硬超时 120s（客户端 AbortController + 路由对齐，常量）。
- **prompt 落点**：`src/services/explainer/prompts.ts` 单点定义——共享防注入层（`<INPUT_TEXT>` 分隔符、never-invent、注入回避，仿 reedy PolicyLayer）+ 本 effort 分节（TARGET READER / INPUT / TASK / CONSTRAINTS / OUTPUT FORMAT）；`promptVersion` 同文件常量，策略句一变即 +1 并写入 metadata。
- **错误语义**（面板内一律内联，无"仅 toast"路径）：未配置 provider → 内联空态 + 跳设置；超时/网络/provider 错误 → 内联错误态 + **重试按钮**；JSON 失败 → 01 降级阶梯：`parsePartialJson` + zod 保留有效字段 → 纯文本兜底（`format: 'text'`）→ 全败则内联错误态 + **重新生成**按钮。
- **并发与时序**：`pendingByKey: Map<key, Promise>` 去重（同键共享 promise）；命中缓存直接返回；完成后**先写 DB 再回传 UI**（先存后展示），写失败视为本次生成失败可重试。
- **loading**：骨架梯次占位（simple→notes→译文）；生成中允许关闭面板，完成即落库，重开命中缓存。
- **输入面**：`{ text（已归一化，07 规则）, bookHash, cfi, sourceLang, nativeLang }`——key 在服务层算，存储 CRUD 归 06，服务只调度。

Blocked by: 01
