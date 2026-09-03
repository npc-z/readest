# 菜单入口集成

Type: grilling

## Question

"讲解"如何进入选择菜单并联同上下文打开面板：

- `AnnotationToolType` 增 `explainer` 的完整改动面：`AnnotationTools.tsx` 按钮表（图标选型、label/tooltip 文案）、`Annotator.tsx` 的 `buildToolButton` 分支、`utils/annotationToolbar.ts` 的 `ALL_ANNOTATION_TOOL_TYPES`/`DEFAULT_ANNOTATION_TOOL_ITEMS`（默认开启、可关闭）。
- 点击后的行为：携带选择文本 + CFI → 打开讲解面板（04）传入；面板未就绪时（如组件尚未实现）如何降级。
- 未配置 AI 时的 toast 引导（跳 AI 设置）。
- 移动端兼容：选择菜单/工具栏在触控与长按下的表现，Android 系统菜单抑制的影响。
- 与现有弹出物（Dictionary/Translation popup）同时打开的空间冲突处理。

Blocked by: 

Status: resolved

## Answer

B 票定版：

- **工具定义**：`annotationToolButtons` 新增 `{type:'explainer', label:_('Explain'), tooltip:_('Explain text after selection'), Icon:LuGraduationCap, quickAction:true}`；`AnnotationToolType` union 加 `'explainer'`；`ALL_ANNOTATION_TOOL_TYPES` 与 `DEFAULT_ANNOTATION_TOOLBAR_ITEMS` 插于 `translate` 之后（**默认开启**，可经 Customize Toolbar 隐藏/排序）；同步更新"按钮表↔ALL 同步"单测。
- **点击行为**：`buildToolButton` 新分支 → `handleExplainer`（照 `handleTranslation` 范式：关注解弹窗 + `suppressNativeSelectionHandles()` + 保留选择）→ `explainerStore.openExplainer({text, cfi})`。
- **语言来源（Q3 修订）**：新增用户设置 `SystemSettings.explainerSettings { sourceLang?, nativeLang? }`，配置入口在讲解面板头部（两个语言下拉，持久化经 settingsStore，仿 aiSettings）；`openExplainer` 传入时：`sourceLang` = 设置 ?? book 元数据语言(带 ISO 归一，best-effort) ?? 'auto'（prompt 自动检测并记入 metadata）；`nativeLang` = 设置 ?? 点击时 UI i18n 语言快照。**缓存键仍为 (bookHash, textHash, nativeLang)**——nativeLang 取设置或 UI 语言的实际值。
- **未配置 AI（Q2 修订）**：取消入口 toast——点击即开面板，03/04 的内联"未配置 AI → 去设置"空态为唯一信号（替换第 2 轮"点击 toast 引导"决定）。
- **移动端**：与 translate/dictionary 同渲染路径，无专门工作；面板按 04 走全宽 sheet。
- **文案/测试**：label/tooltip 走 key-as-content（en 为 key，zh 归 09）；同步性单测必须更新。

Blocked by: 
