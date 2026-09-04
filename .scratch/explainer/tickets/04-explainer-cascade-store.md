# 04: 级联组件 + explainerStore（数据契约）

**What to build:** 讲解内容的呈现引擎——把一份讲解载荷渲染为四级级联（简单版 → 词句帮助 → 语法要点 → 母语译文），每级标题常显、逐级"还不懂？"展开、简单版默认展开；同步的会话态 store 记录可见性、当前条目、每条目展开层级。此票只消费已有数据（服务/面板接线在 05），完成后即有可独立验证的展示契约。

**Blocked by:** 02 纯函数与常量：归一化/哈希/单位截断 + prompt 与参数单源（载荷 schema 定稿）

**Status:** ready-for-agent

- [x] 级联组件：四级标题常显；Simple 默认展开；notes/grammar/translation 折叠于"还不懂？"按钮后；空 notes/grammar、translationM 缺失时该级不渲染（逐级降级）；notes 按原序（word/phrase/idiom 徽标可区分）、grammar 行展示 structure；示例与 meaningM 缺失时行内自适应——实现为**受控**组件 `ExplainerCascade`（`expanded`/`onToggle` 由消费方注入）；`metadata.format==='text'` 时**以格式为准**仅渲染 Simple 平铺（即使 payload 带有多余 notes）；RTL 用逻辑属性（`text-start`/`ms-2`）、自定义按钮加 `focus-visible:ring-2` 规范；文案用 **key-as-content**（英文即 key，en/translation.json 留空）
- [x] 阶段态：生成骨架（`role=status` 占位）、错误内联（`role=alert`），状态由消费方注入（`status='loading'|'error'|'ready'`）
- [x] store 契约：view('item'|'history')、currentItemKey、`expandedByItem`（会话级、按条目记；`expandedTiers` 由派生 selector `selectExpandedTiers` 读取，单一事实源）、openExplainer(text,cfi,bookHash,bookTitle,sourceLang,nativeLang,thinking?)、可见性/pin/宽度；与 Notebook 同槽互斥且**尊重 pin**（只关浮动的未钉 Notebook；钉着=docked，讲解与其并存；开 Notebook 由订阅关讲解，各自保留 pin/width）；跨重启不保留当前条目（纯内存态；pin/width 持久化属 05/06 设置层，与 notebookStore 同为内存态）
- [x] 默认展开层级行为集中为单点常量 `DEFAULT_EXPANDED_TIERS`（v0 空集；仅 Simple 常显）——预留未来"默认展开设置化"
- [x] 测试：RTL fixture payload（四级齐全/四级缺一/空 notes/空 grammar/纯文本）× 默认展开与折叠交互；store 契约状态转换与**pin-aware** 互斥逻辑；无平台依赖
