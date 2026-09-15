# 03: 服务端 explanations 表 + /api/sync 接线（含幂等插入）

**What to build:** 让 `/api/sync` 支持 `explanations` 的 push/pull：服务端建 `public.explanations` 表（per-user + RLS）、GET 增量游标与分页、POST 走 LWW upsert，并保证两台设备对同一 4 元组并发首推不报错。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `docker/volumes/db/migrations/023_add_explanations.sql`（目录是 glob 挂载，无需改 `docker/compose.yaml`）：列 `user_id uuid` / `id text` / `book_hash` / `book_title` / `text` / `text_hash` / `source_lang` / `native_lang` / `cfi` / `payload jsonb` / `prompt_version integer` / `created_at` / `updated_at` / `deleted_at timestamptz`；`UNIQUE(user_id, book_hash, text_hash, source_lang, native_lang)`；RLS 四条策略照 `book_notes`（`docker/volumes/db/init/schema.sql:105`）；索引 `(user_id, updated_at)` 与 `(user_id, deleted_at)`。不要引入 `synced_at` 触发器（那是 `books` 专用，`schema.sql:39`）
- [ ] `transformsToDB` 增 `explanations`，`DBSyncTypeMap` 增映射（`apps/readest-app/src/pages/api/sync.ts:256` / `:262`）
- [ ] GET 增该表查询：`updated_at > since OR deleted_at > since`（照 `book_notes`，`pages/api/sync.ts:339`），支持 `limit` + offset 分页（`pages/api/sync.ts:286`），并接入 `type` 过滤分支
- [ ] POST 增 `upsertRecords('explanations', ['book_hash','text_hash','source_lang','native_lang'], ...)`（同 `pages/api/sync.ts:874` 的 book_notes 调用）
- [ ] **幂等插入（必须）**：现有 insert 路径是 `.insert()`（`pages/api/sync.ts:836`），同键并发首推会撞唯一键。给 `upsertRecords` 加一个 opt-in（例如 `onConflictInsert`），只让 `explanations` 的 insert 走带 `onConflict` 的 upsert；**不改变** books / configs / notes 现有 `.insert()` 行为
- [ ] route 测试：GET 增量含 `deleted_at` 行、分页正确；POST 冲突按 `clientDeletedAt > serverDeletedAt || clientUpdatedAt > serverUpdatedAt`（`pages/api/sync.ts:737`）走 LWW；同一 4 元组并发首推不返回错误；未认证返回 403

注：服务端 LWW 语义与 `book_notes` 一致；首插由服务端盖 `updated_at`（`pages/api/sync.ts:726`）。规格见 `../spec.md` 的「迁移与表」「客户端接线」。
