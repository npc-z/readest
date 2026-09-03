# 存储层落地

Type: grilling

## Question

讲解条目的持久化落地：

- 独立 sqlite 库（如 `explainer.db`，`AppService.openDatabase('explainer', ...)`）还是并入既有库；表 DDL 草案：`explanations(id, bookHash, bookTitleSnapshot, text, textHash, sourceLang, nativeLang, cfi, payload JSON, promptVersion, createdAt, updatedAt)`——需确认普通索引（bookHash、textHash）。**`text`（选中原文的展示版本）必须入库**：面板历史列表（04）与讲解库页（08）都以原文而非 simple 作为条目标题展示；`textHash` 由归一化后文本生成（07），`text` 存展示所需形态（保持可读，允许带段落换行）。
- `ExplainerDb` wrapper API 面：getByKey、upsert（覆盖语义）、delete、deleteByBook、listByBook（分页/摘要字段）、listAll/search（讲解库页用）。
- 跨平台一致性：Native/Web turso wasm 三个 DatabaseService 下同一 code path（参考 `ReedyDb` 的写法但**不**继承其 Tauri gate 理由——讲解在 Web 也要工作）。
- 迁移入口（`src/services/database/migrations/index.ts` 新 schema key + `YYYYMMDDNN_` 命名）。

Blocked by: 02

Status: resolved

## Answer

B 票定版：

- **库与 key**：独立 `explainer.db` + schema key `'explainer'`（`AppService.openDatabase('explainer','explainer.db','Data')`），迁移组 `scaffold` 改为 `explainer: [{'2026XXXXNN_explainer_init', ...}]`；**不加 Tauri gate**（区别于 Reedy——讲解在 Web 同样可用）。
- **DDL**：
```sql
CREATE TABLE IF NOT EXISTS explanations (
  id             TEXT PRIMARY KEY,             -- uuid
  book_hash      TEXT NOT NULL,
  book_title     TEXT,                         -- 生成时快照，书删后列表仍可读
  text           TEXT NOT NULL,                -- 选中原文（展示版，可含换行）
  text_hash      TEXT NOT NULL,                -- 归一化后哈希（07 定算法）
  source_lang    TEXT NOT NULL,                -- L（'EN' 规范化或 'auto'）
  native_lang    TEXT NOT NULL,                -- M
  cfi            TEXT,                         -- 锚点，可空
  payload        TEXT NOT NULL,                -- 完整 JSON（含 metadata.format）
  prompt_version INTEGER NOT NULL,             -- 顶层冗余供查询/排序，与 payload 同源
  created_at     INTEGER NOT NULL,             -- ms
  updated_at     INTEGER NOT NULL,
  UNIQUE (book_hash, text_hash, native_lang)   -- 缓存键=唯一键，upsert 覆盖
);
CREATE INDEX IF NOT EXISTS idx_explainer_book_created
  ON explanations (book_hash, created_at DESC);
```
- **封装**：`src/services/explainer/db/ExplainerDb.ts`——懒开 connection（promise，同 ReedyBackend）；API：`getByKey / upsert / delete(id) / deleteByBook(bookHash) / listByBook(bookHash,{limit,offset}) / listAll({search?, bookHash?, limit, offset})`；单行 UPSERT/查询走 `db.execute`/`db.select` 参数绑定，**无需 ReedyDb 写队列**（无 batch）；`search` 用 `LIKE '%q%'` 作用于 `text`（FTS5 留作后续）。
- **查询返回**：列表/管理页返回整行含 payload（条目 ≤ 数 KB），摘要（simple 首行）由 UI 解析；分页 `LIMIT/OFFSET`。
- **删书联动**：v0 不做自动级联删除；"删书时清理讲解数据"记入 Not yet specified。
- **生命周期**：条目创建即完整（生成成功→先写后展示，03 承诺）；`created_at/updated_at` 写入端填；单条语句无需事务；不做强制 checkpoint（写入频率低）。

Blocked by: 02
