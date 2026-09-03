# 05: 首条垂直回路：菜单入口 + 面板壳 + 生成闭环

**What to build:** 第一个端到端可用功能——阅读器里选中文字，选择菜单出现"讲解"，点击后在右侧面板即刻得到四级级联；再次选中同段立刻命中缓存不重复请求；未配置 AI 时面板内联引导。这条回路打通工具/面板/服务/存储，后续票是在此之上的增强。

**Blocked by:** 01 存储层：explainer 迁移组 + ExplainerDb，03 服务层：getOrGenerate + AI 通路（直连/route 分流），04 级联组件 + explainerStore（数据契约）

**Status:** ready-for-agent

- [ ] 注解工具栏：新增 `explainer` 工具（label "Explain"、图标、quickAction），插在 translate 之后并默认开启；同步工具全集/默认集数组（编辑器型新增按既有同步单测先例）；构建器接入处理函数
- [ ] 处理函数照 translate 范式：关闭选择弹层、抑制原生手柄、保留选择 → 带 text/cfi/bookHash 打开面板（bookHash 派生于当前书）
- [ ] 面板壳：右侧浮槽与 Notebook 同槽互斥（z 分层/覆盖层/pin/宽度沿用既有面板机制，不新增分层）；顶栏切换按钮（与 Notebook 按钮同排）；移动端全宽 sheet；未配置 AI → 面板内联"去设置"空态（无入口 toast）
- [ ] 生成闭环：选中即生成（骨架 → 级联填充）；重选同段即时命中；生成失败面板内联错误 + 重试/重新生成；空/纯空白选择不发请求；超过 500 单位截断 toast
- [ ] 当前条目操作：重新生成（显式覆盖同一缓存键）、删除（确认）
- [ ] 测试：工具栏同步断言、处理函数与 store 接线、面板渲染（loading/error/not-configured 三态）；本轮以桌面 + 移动端人肉冒烟验证闭环（不入 CI）

