# 08: i18n：zh-CN 文案提交

**What to build:** 中文 UI 下讲解功能全部文案本地化；其他语言回退英文 key（现有实践：en key 即文案，其余语言自动回退）。

**Blocked by:** 05 首条垂直回路：菜单入口 + 面板壳 + 生成闭环，06 面板增强：语言/思考配置 + 只读信息 + 历史视图 + e-ink，07 讲解库管理页 + 库页入口

**Status:** ready-for-agent

- [ ] ~20 条 key 登记并提取：Explain/Explanation、四级标题（Simple/Word & Phrase Notes/Grammar/Native Translation）、级联"还不懂？"按钮、历史操作（Regenerate/Delete）、库页标题/空态/未配置引导、错误码映射文案（ai-not-configured/timeout/provider-error/no-object-salvaged/invalid-input 各一）
- [ ] 复用既有 key（Delete/Search/确认类文案）；新增"删除确认"专用 key；非 React 模块经 stub 注册确保提取
- [ ] zh-CN 翻译提交并跑通翻译校验；其余语言回退英文；文案与错误码解耦——UI 层映射错误码，服务层无文案

