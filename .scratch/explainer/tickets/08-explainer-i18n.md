# 08: i18n：zh-CN 文案提交

**What to build:** 中文 UI 下讲解功能全部文案本地化；其他语言回退英文 key（现有实践：en key 即文案，其余语言自动回退）。

**Blocked by:** 05 首条垂直回路：菜单入口 + 面板壳 + 生成闭环，06 面板增强：语言/思考配置 + 只读信息 + 历史视图 + e-ink，07 讲解库管理页 + 库页入口

**Status:** ready-for-agent

- [x] ~20 条 key 登记并提取：Explain/Explanation、四级标题（Simple/Word & Phrase Notes/Grammar/Native Translation）、级联"还不懂？"按钮、历史操作（Regenerate/Delete）、库页标题/空态/未配置引导、错误码映射文案（ai-not-configured/timeout/provider-error/no-object-salvaged/invalid-input 各一）——实际 56 条（讲解功能 UI 较丰富）
- [x] 复用既有 key（Delete/Search/确认类文案）；新增"删除确认"专用 key；非 React 模块经 stub 注册确保提取
- [x] zh-CN 翻译提交并跑通翻译校验；其余语言回退英文；文案与错误码解耦——UI 层映射错误码，服务层无文案

## Comments

- 间接 key 登记在 `src/services/explainer/i18n.ts`（stubTranslation）：错误码 6 条 `EXPLAINER_ERROR_MESSAGE_KEYS`、Thinking 模板 4 条、截断 toast 1 条；React 组件里的 `_('KEY')` 字面量由扫描器直接识别。zh-CN 已补 56 条（无 `__STRING_NOT_TRANSLATED__` 占位符），其余语言回退英文。未跑全库 `i18n:extract`（避免污染其余 30+ locale）；提取器只要扫到即可与手工补的 zh-CN 对齐。

