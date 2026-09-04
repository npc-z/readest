# 05: 首条垂直回路：菜单入口 + 面板壳 + 生成闭环

**What to build:** 第一个端到端可用功能——阅读器里选中文字，选择菜单出现"讲解"，点击后在右侧面板即刻得到四级级联；再次选中同段立刻命中缓存不重复请求；未配置 AI 时面板内联引导。这条回路打通工具/面板/服务/存储，后续票是在此之上的增强。

**Blocked by:** 01 存储层：explainer 迁移组 + ExplainerDb，03 服务层：getOrGenerate + AI 通路（直连/route 分流），04 级联组件 + explainerStore（数据契约）

**Status:** ready-for-agent

- [x] 注解工具栏：新增 `explainer` 工具（label "Explain"、`LuGraduationCap`、quickAction），插在 translate 之后并默认开启；`AnnotationToolType`/`ALL`/`DEFAULT` 全同步；构建器接入 `handleExplainer`
- [x] 处理函数照 translate 范式：关选择弹层 + `suppressNativeSelectionHandles()` + 保留选择 → `explainerStore.openExplainer({text, cfi, bookHash, bookTitle, sourceLang(书语言||'auto'), nativeLang(UI 快照)})`（bookHash 派生自当前书）
- [x] 面板壳：`ExplainerPanel` 右侧浮槽，与 Notebook 同槽互斥（复用 `Overlay` + `z-[45]/z-20` + pin/关闭）；`ExplainerToggler` 顶栏（与 Notebook 同排）；移动端全宽；未配置 AI → 内联"去设置"空态（`onOpenSettings` 打开 AI 设置，无入口 toast）
- [x] 生成闭环：选中即生成（骨架 → 级联填充）；重选同段即时命中（服务缓存）；失败内联错误 + 重试/重新生成；空白选择由服务 invalid-input 拦截（不调 AI）；超过 500 单位由 `entry.truncated` → `eventDispatcher('toast')`
- [x] 当前条目操作：重新生成（`service.regenerate` 强制越过缓存、覆盖同键）、删除（确认，`deleteExplanation`）
- [x] 测试：工具栏同步断言（order/label/quickAction）、store 接线（`openExplainer`→panel→generator）、面板渲染（loading/error/not-configured 三态 + regenerate/delete）；桌面+移动端人肉冒烟（不入 CI）
