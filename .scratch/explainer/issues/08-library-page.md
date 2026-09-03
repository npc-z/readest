# 讲解库管理页

Type: prototype

## Question

独立的"讲解库"管理页：

- 路由落位（`src/app/library/explainer/page.tsx` 或其他更佳挂点）与库页入口（LibraryHeader 工具栏图标/菜单项，参照现有下拉菜单）。
- 内容：全库讲解列表（按书分组或按时间）、搜索文本、删除、重新生成、摘要（simple 前 N 字 + 时间 + promptVersion）、点击跳转（打开对应书并定位 CFI，或仅展示原文上下文）。
- 空态、加载态、删除确认。
- 与面板内历史列表（04）的关系：同一查询 API（06）不同渲染。

Blocked by: 02, 06

Status: resolved

## Answer

B 票定版：

- **路由与入口**：全页 `src/app/library/explainer/page.tsx`（库页风格；top 说明 + 返回库）；LibraryHeader 新增图标入口（LuGraduationCap → `router.push('/library/explainer')`）。
- **列表形态**：时间倒序全库平铺，分页 20/页 + "加载更多"；工具条 = 搜索框（`text` LIKE）+ "仅本书"筛选下拉（listByBook）+ 计数；行 = 原文首行 + 副行（书标题 · 相对时间 · 层级徽标）；行点击展开内嵌卡片（复用 04 ExplainerCascade 渲染三级 + 操作行）。
- **操作**：卡片操作行 = 展开/收起、重新生成（同键覆盖；页内错误 toast + 行内重试态）、删除（`ask()` 确认）；无编辑。
- **跳转**：条目含 `cfi` → `navigateToReader([bookId], cfi 参数)`（参照 annotation link 机制）；`cfi` 空 → 仅打开书；定位失败静默降级为打开书。
- **与面板关系**：共用 ExplainerDb 查询 + **共用组件 `ExplainerItemCard`**（面板历史=compact 变体，页面=expanded 卡片）；页面 = listAll + 可选 listByBook 过滤。
- **空/加载**：空库引导态（使用方法说明 + 返回阅读器按钮）；加载骨架行；搜索无结果态。

Blocked by: 02, 06
