# 04: 级联组件 + explainerStore（数据契约）

**What to build:** 讲解内容的呈现引擎——把一份讲解载荷渲染为四级级联（简单版 → 词句帮助 → 语法要点 → 母语译文），每级标题常显、逐级"还不懂？"展开、简单版默认展开；同步的会话态 store 记录可见性、当前条目、每条目展开层级。此票只消费已有数据（服务/面板接线在 05），完成后即有可独立验证的展示契约。

**Blocked by:** 02 纯函数与常量：归一化/哈希/单位截断 + prompt 与参数单源（载荷 schema 定稿）

**Status:** ready-for-agent

- [ ] 级联组件：四级标题常显；Simple 默认展开；notes/grammar/translation 折叠于"还不懂？"按钮后；空 notes/grammar、translationM 缺失时该级不渲染（逐级降级）；notes 按原序（word/phrase/idiom 徽标可区分）、grammar 行展示 structure；示例与 meaningM 缺失时行内自适应
- [ ] 阶段态：生成骨架（可替换占位）、错误内联（占位），状态由消费方注入（store 契约）
- [ ] store 契约：view('item'|'history')、currentItemKey、expandedTiers(会话级、按条目记)、openExplainer(text, cfi, bookHash, ...)、可见性/pin/宽度；与 Notebook 同槽互斥语义（开讲解关 Notebook，反之亦然，各自保留 pin 状态）；跨重启不保留当前条目（纯内存态）
- [ ] 默认展开层级行为集中为单点常量（预留未来"默认展开设置化"）
- [ ] 测试：RTL fixture payload（四级齐全/四级缺一/空 notes）× 默认展开与折叠交互；store 契约状态转换与互斥逻辑；无平台依赖

