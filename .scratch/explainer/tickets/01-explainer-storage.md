# 01: 存储层：explainer 迁移组 + ExplainerDb

**What to build:** 讲解条目在本机的持久化——新增 `explainer` 数据库迁移组与轻量访问层，使讲解记录按 `(bookHash, 归一化文本哈希, nativeLang)` 唯一命中、按书与全部遍历、可 LIKE 搜索、可删除、可重新生成覆盖。这是后续所有"缓存命中/讲解库"行为的地基。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 迁移组 `explainer` 注册进现有迁移机制（命名随现有约定，幂等可重跑）
- [x] 表 `explanations`：id(uuid)、book_hash、book_title(快照, 删除书后仍可显示)、text(展示版, 含换行)、text_hash(归一化结果)、source_lang、native_lang、cfi(可空)、payload(JSON)、prompt_version、created_at/updated_at(毫秒)；`UNIQUE(book_hash, text_hash, native_lang)` 实现 upsert 覆盖语义；索引 `(book_hash, created_at DESC)`
  - 注：id uuid 由生成方（服务层）提供；"重新生成"覆盖=内容替换（payload/prompt_version/cfi/updated_at 更新），行的 id 与首次 created_at 保持不动
- [x] 访问层接口：getByKey(bookHash, textHash, nativeLang)、upsert(冲突即覆盖)、delete、deleteByBook、listByBook(时间倒序)、listAll(时间倒序)、文本 LIKE 搜索(转义 % _ 等特殊字符)
- [x] 懒打开 + 可关闭；Web/原生/测试三平台共用同一打开路径，无平台分支；列表返回整行 payload（close 始终关闭当前打开的库；注入库生命周期由测试自管）
- [x] 测试：内存迁移跑测（迁移幂等、UNIQUE 冲突走覆盖语义、LIKE 转义、分页与排序）；访问层构造可注入已迁移数据库
- [x] 记录列表语义：不因书被删而级联清理（v0 明确）

