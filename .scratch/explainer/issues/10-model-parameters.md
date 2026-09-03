# 生成提示词成文与模型参数

Type: grilling

## Question

讲解生成的最终 system/completion prompt 文本与模型调用参数：

1. **提示词成文**：01 方针 + 03 分节结构，合成一份可用的 v1 模板（英文 system + 分隔符内输入 + JSON 输出要求 + 防注入），定版后写入 `prompt-framework.md` §7 作为 canonical v1（`promptVersion = 1`）。
2. **模型参数**：temperature / topP / maxOutputTokens 等取值（结构化输出取向、事实重写类任务、500 单位输入上界）；与已定 maxRetries 2 / 120s 超时兼容。
3. **参数传播**：Tauri 直连 provider 与 `/api/ai/explain` route（参数随 body 由客户端传递）两条路径传参一致性。
4. 其他：输入分隔符转义规则、语言回退（system 英文，正文 L/M 无关）等。

前置：01（方针）、03（结构/调用面）。

Blocked by: 01, 03

Status: resolved

## Answer

B 票定版：

- **v1 提示词成文**：已写入 `prompt-framework.md` §7（`promptVersion = 1`，英文 system + `<INPUT_TEXT>` 分隔符 + INVALID_INPUT 注入处理 + IDENTITY/TARGET READER/INPUT/TASK/CONSTRAINTS/OUTPUT FORMAT + JSON 形状示例；仅 TARGET READER 句为水平敏感句）。
- **模型参数**（`explainer/constants.ts` 单源，Tauri 直连 + route 共用）：`temperature 0.2`、`topP 默认`、`maxOutputTokens 4096`、`maxRetries 2`（沿用）；超时档位：`thinking='high'` → 240s，其余 → 120s。
- **thinking 开放**：`explainerSettings.thinking: 'off'|'low'|'medium'|'high'`（默认 `'off'`），面板头部下拉（与语言下拉同位）；映射 best-effort：OpenRouter/AI-Gateway → `reasoningEffort`，Ollama → `think: boolean`，不支持的 provider 静默忽略。
- **暴露面**：可配置 = 源/母语语言 + 思考强度；**只读查看** = 当前 provider/model、temperature、maxTokens（面板头部 popover）；temperature/topP/maxOutputTokens 不对用户可编。

Blocked by: 01, 03
