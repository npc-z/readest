# 06: 面板增强：语言/思考配置 + 只读信息 + 历史视图 + e-ink

**What to build:** 把面板从"可用"做到"够用"——学习者在面板头部配置源语言 L / 母语 M / 思考强度（off|low|medium|high），设置持久化跨重启；面板同时提供本书历史视图，在"当前条目/本书历史"间切换并管理；面板在 e-ink 设备遵守既有样式规则。

**Blocked by:** 04 级联组件 + explainerStore（数据契约），05 首条垂直回路：菜单入口 + 面板壳 + 生成闭环

**Status:** ready-for-agent

- [x] 设置持久化：explainerSettings {sourceLang?, nativeLang?, thinking?} 进入系统设置（类型 + 默认值合并 backfill + 保存路径沿用现有设置层）；reading 端与设置面板可读；不引入云同步
- [x] 语言解析：sourceLang = 设置 ?? book 元数据语言(best-effort) ?? 'auto'（auto 时模型检测并记入 metadata）；nativeLang = 设置 ?? 点击时 UI 语言快照；缓存键仍只含 nativeLang；解析结果在面板头部展示
- [x] 思考映射：off/low/medium/high → 各 provider 支持形态（OpenAI 兼容传递 reasoningEffort、Ollama think 布尔），不支持静默忽略，生成照常 —— OpenAI-compatible reasoningEffort done；Ollama `think` 经核实 top-level `think:true` 对非推理模型 400，v1 静默忽略，参见 `thinking.ts`/`OllamaProvider.getModel` 注记
- [x] 只读信息：当前 provider/model、temperature、maxTokens 只读展示（说明弹层）；这些 tune 项永不可编辑
- [x] 历史视图：本书历史（行 = 原文首行 + 书/时间/层级徽标）；行为重新生成（覆盖）/删除（确认）；与"当前条目"互切；视图/展开态仍在会话 store
- [x] e-ink：面板遵守既有 e-ink 样式规则（与 Notebook 一致处理）
- [x] 测试：设置保存与 backfill、语言解析优先级表、思考映射（含不支持静默）、历史视图切换与行操作

## Comments

- 思考映射：`buildProviderOptions` 已封送 OpenAI-compatible 的 reasoningEffort；Ollama 的 `think` 作为模型构造选项，v1 经核实（top-level `think:true` 被非推理模型 400 拒绝）未发送、静默忽略，生成照常。provider 级映射测试在 `gateway.test.ts#buildProviderOptions`（含不支持静默）；本票另补服务层测试（`ExplainerService.test.ts`）证 `getOrGenerate` 把 `request.thinking` 透传给 AI 网关、省略时回退 `off`。
- 评审修订：头部配置改动后重新生成/重试用当前设置而非打开时快照（`withCurrentSettings`，缓存键随 nativeLang）；`requestFromEntry` 走规范化 `activeThinking`；L/M 下拉绑定到"配置值 + 哨兵"（Auto 可选），另以只读行展示"解析结果"；`{limit,offset}` 统一为 `ListOptions`；`bookHash` 推导抽 `resolveBookHash` 供 Annotator/面板共用。

