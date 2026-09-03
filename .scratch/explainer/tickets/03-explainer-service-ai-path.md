# 03: 服务层：getOrGenerate + AI 通路（直连/route 分流）

**What to build:** 讲解的核心数据面——选中文本后经 `ExplainerService.getOrGenerate` 得到一份结构化讲解：缓存命中立即返回（不调 AI），未命中走 AI 生成、校验降级、先写库再返回；同文本并发请求共享一次生成。Web 与原生走不同 AI 通路，但服务层对平台无感知。

**Blocked by:** 01 存储层：explainer 迁移组 + ExplainerDb，02 纯函数与常量：归一化/哈希/单位截断 + prompt 与参数单源

**Status:** ready-for-agent

- [ ] getOrGenerate 契约：输入 {text 展示版、归一化 textHash、cfi?、bookHash、sourceLang、nativeLang、thinking}；返回 ExplanationEntry；超过上限截断后显式标记（供 toast）
- [ ] 缓存命中：直接返回、不调用 AI；未命中：生成 → zod 校验 → 降级阶梯（parsePartialJson 抢救 → generateText 纯文本兜底并标记 format 供面板平铺渲染 → 失败）
- [ ] 并发：同键 pendingByKey 共享 promise，不重复请求；先写库后返回（回传前崩溃也不丢已生成内容）
- [ ] 错误码分类：ai-not-configured / timeout（120s，thinking=high 240s）/ provider-error / no-object-salvaged / invalid-input（空白输入）；重试上限 2
- [ ] AI 通路：原生平台直连现有 provider 结构（Ollama 传 think 布尔）；Web 走新增路由（body 带 apiKey/model/文本与参数，system prompt 服务端构建——讲解输出需版本化，不能像 chat 那样由客户端传 system；错误映射为错误码；导出执行时长上限覆盖 240s）；thinking 的 low/medium/high 映射为 provider 支持形态，不支持则静默忽略（zero 仍正常生成）
- [ ] 复用现有 AI 设置；未配置 AI（未启用/缺 key）落到 ai-not-configured
- [ ] 测试：内存 FakeDb + FakeAi——命中不调 AI、先存后回、并发同键只生成一次、降级三阶梯、错误码分类、超时/重试；路由最小测试（参数校验、错误映射）；无 Tauri/Next 依赖的服务层测试

