# 讲解跨设备同步 (Explainer Sync) — Spec

Status: needs-triage

> 本 spec 是一个独立 effort：`.scratch/explainer/map.md` 把"跨设备同步"明确列为 Out of scope。
> 术语沿用 `CONTEXT.md`；本地存储的既有设计见 `.scratch/explainer/issues/06-storage-layer.md` 与 `.scratch/explainer/tickets/01-explainer-storage.md`。
> 底层同步机制（`/api/sync`、`replicas`）的先例在下方 Implementation Decisions 里逐条给了 `path:line`。

## Problem Statement

讲解按 `(bookHash, text_hash, sourceLang, nativeLang)` 缓存在**本机** `explainer.db`（`apps/readest-app/src/services/explainer/ExplainerDb.ts:36`）。同一个晦涩句子在第二台设备上仍要重新请求 AI，讲解库页也看不到另一台设备生成的内容；删除和"重新生成"同样只作用在本机。多设备读同一本书的用户（手机 + 桌面）拿到的是一份"断开的"讲解历史。用户希望登录后讲解自动跨设备出现，同时离线仍然可用。

## Solution

保留 `explainer.db` 作为本地优先的工作库（生成路径完全不变），在其上叠一层同步：新增 `explanations` 同步实体，走现有 `/api/sync` 的 push/pull（与 `book_notes` 同一条通道），服务端新增 `public.explanations` 表（per-user + RLS）。跨设备身份不用本地随机 uuid，而用与本地缓存键一致的 `(book_hash, text_hash, source_lang, native_lang)`：两台设备各自生成的同一条讲解收敛成一行。删除改为本地软删（tombstone）并随 LWW 传播，避免被对端"复活"。

## User Stories

1. As a logged-in reader, I want a passage I explained on my phone to be explained instantly on my laptop (cache hit, no new AI request), so that I never pay twice for the same passage.
2. As a logged-in reader, I want explanations generated on device A to appear in device B's Explanations library page, so that the cross-device list is complete.
3. As a logged-in reader, I want deleting an explanation on one device to remove it everywhere and never be pulled back, so that junk stays gone.
4. As a logged-in reader, I want "Regenerate" on one device to update the entry on the others (one row, newest wins), so that I never see two versions of the same passage.
5. As a reader who explained the same passage on two offline devices, I want sync to merge them into one entry, so that the cache key never shows duplicates.
6. As a reader who is logged out or offline, I want generation and browsing to keep working locally, so that sync is never a blocker.
7. As a reader, I want a separate "Explanations" toggle in Manage Sync, so that I can keep AI content off the wire.
8. As a self-hoster, I want sync to work on the existing `docker/compose.yaml` stack with no extra service, so that deployment stays one compose file.

## Implementation Decisions

### 机制选型：复用 `/api/sync`，不新增 replica kind

- 讲解是"每书很多条小记录"，结构等同 `book_notes`；replica 通道面向的是"每账号少量资产"。
- replica 通道的规模假设是"每账号几十到几百个资产"，不是"每书上千条记录"：单行有服务端强制的 `replicas_fields_size <= 65536`（`docker/volumes/db/migrations/003_add_replicas.sql:68`；客户端同值 `MAX_JSON_BYTES`，`apps/readest-app/src/libs/replicaSchemas.ts:5`），`KindSpec.maxRowsPerUser` 只有 50–500（`replicaSchemas.ts:108` 起，且目前**并未真正强制**），pull 每 kind 每请求上限 1000 行、每 kind 只有一个 HLC 游标（`apps/readest-app/src/pages/api/sync/replicas.ts:56`，`apps/readest-app/src/services/sync/replicaSyncManager.ts:245`）。
- `replicas` 没有 `book_hash`，主键是 `(user_id, kind, replica_id)`（`003_add_replicas.sql:48`）；`manifest` 是整行 LWW，一个 per-book 行里塞多条讲解会互相覆盖，per-passage 合并只能在"一条讲解一个 replica row"下成立——那又直接撞上上面的行数和拉取规模。
- 单个讲解 payload（`simple` + ≤15 notes + ≤2 grammar + `translationM` + metadata，`apps/readest-app/src/services/explainer/schema.ts:11`）在推理档输出预算下（`apps/readest-app/src/services/explainer/constants.ts:26`）有可能逼近 64 KiB，且没有 per-field 限制可以缓解。
- 字段级 LWW + HLC + 加密 envelope 对"整条覆盖"语义也是过度设计。
- `/api/sync` 已经具备 per-book、增量游标、LWW、批量 upsert、分页（`apps/readest-app/src/pages/api/sync.ts:272` GET / `:652` POST），扩展面最小。
- 门控差异：`book`/`progress`/`note` 属于 `PROVIDER_GATED_CATEGORIES`，会随 Readest Cloud 开关走（`apps/readest-app/src/services/sync/syncCategories.ts:118`）。讲解没有 library.json / config.json 文件镜像，因此按 `stats` 那样作为账号级、始终原生的类别处理。

### 跨设备身份：4 元组唯一，本地 `id` 不作权威

- 服务端唯一键 = `(user_id, book_hash, text_hash, source_lang, native_lang)`；本地已有同样的 `UNIQUE`（`apps/readest-app/src/services/database/migrations/index.ts:240`）。pull 回来的行走既有 `ExplainerDb.upsert` 的 `ON CONFLICT ... DO UPDATE` 覆盖语义（`ExplainerDb.ts:132`）。
- `id` 仍随行同步（UI 的删除/重新生成按 id 操作），但**不参与冲突判定**。
- 不用 `(user_id, book_hash, id)` 的原因：两台设备离线各自生成会得到两个随机 uuid（`ExplainerService` 默认 `crypto.randomUUID`，`ExplainerService.ts:59`），永远收敛不到一行。
- `source_lang` 进唯一键是既有决定（`ExplainerDb.ts:140`），因此不同语言设置的两台设备互不覆盖、不丢数据。
- **合并只看 `updatedAt` / `deletedAt`（纯 LWW，墓碑优先）**；`promptVersion` 不参与判定，只随行同步（已定，见 Decisions 2）。

### 删除：本地软删 tombstone

- 本地 `explanations` 增 `deleted_at INTEGER`（epoch ms）；`delete(id)` 与 `deleteByBook(bookHash)` 改为写 `deleted_at`，`getByKey` / `listByBook` / `listAll` / `search` / `listBooks` 全部加 `deleted_at IS NULL` 过滤（`ExplainerDb.ts:115` 起）。
- 服务端 `deleted_at timestamptz`；wire 上是 ISO 字符串。
- 冲突规则直接沿用 POST 的 LWW：`clientDeletedAt > serverDeletedAt || clientUpdatedAt > serverUpdatedAt`（`apps/readest-app/src/pages/api/sync.ts:737`）。墓碑（`deletedAt > 0` 对 `serverDeletedAt = 0`）天然赢过非删除行；**删除实现必须同时 bump `updated_at`**——`useBooksSync` 明确记录过反面教训：删除不 bump `updatedAt` 时，未删除的云端行会赢下 LWW 平局并清掉 `deletedAt`，把刚删掉的行"复活"（`apps/readest-app/src/app/library/hooks/useBooksSync.ts:209`）。
- 本地硬删不可行：删完就没有可 push 的墓碑，对端 pull 也删不掉自己那条。
- 重新生成仍然走 `upsert`：同键写入应把 `deleted_at` 清回 `NULL`（复活），否则"删了再生成"会生成一条永远不显示的记录。

### 迁移与表

- **本地**：`explainer` schema 组新增一条迁移，只加 `deleted_at` 列及必要索引。若确认 `2026090301_explainer` 尚未发布（该 DDL 曾因未发布而原地改过唯一键，见 `.scratch/explainer/issues/06-storage-layer.md` 的修订说明），也可把列并入其 DDL；默认按"新增迁移"处理以覆盖已装上该 schema 的开发机。
- **服务端**：新增 `docker/volumes/db/migrations/023_add_explanations.sql`（迁移目录是 glob 挂载，加文件即可，无需改 `docker/compose.yaml:12-17`）。列：`user_id uuid`、`id text`、`book_hash text`、`book_title text`、`text text`、`text_hash text`、`source_lang text`、`native_lang text`、`cfi text`、`payload jsonb`、`prompt_version integer`、`created_at` / `updated_at` / `deleted_at timestamptz`；`UNIQUE(user_id, book_hash, text_hash, source_lang, native_lang)`；RLS 四条策略照抄 `book_notes`（`docker/volumes/db/init/schema.sql:105`）；索引 `(user_id, updated_at)` 与 `(user_id, deleted_at)`。不引入 `synced_at` 触发器——那是 `books` 专用的服务端游标（`schema.sql:39`），讲解按 `book_notes` 的 `updated_at`/`deleted_at` 客户端时间戳语义即可。
- **游标**：与 `book_notes` 一致，用 `updated_at > since OR deleted_at > since`（`pages/api/sync.ts:339`）。首插由服务端盖 `updated_at`（`pages/api/sync.ts:726`），后续更新用客户端的较新时间戳赢得 LWW。

### 客户端接线

- `SyncType` 增 `'explanations'`，`SyncData` / `SyncResult` 增对应字段（`apps/readest-app/src/libs/sync.ts:8` / `:38` / `:48`）。
- `transformsToDB` 增 `explanations`（`pages/api/sync.ts:256`），新增 `transformExplanationToDB`（照 `transformBookNoteToDB`，`apps/readest-app/src/utils/transform.ts:185`，camelCase → snake_case、时间 → ISO）。
- POST 增 `upsertRecords('explanations', ['book_hash', 'text_hash', 'source_lang', 'native_lang'], ...)`（同 `pages/api/sync.ts:874` 的 book_notes 调用）。
- GET 增该表查询与 wire 映射（`DBSyncTypeMap`，`pages/api/sync.ts:262`），支持 `limit` 分页（`pages/api/sync.ts:286`）。
- **幂等插入硬化（必须）**：现有 insert 路径是 `.insert()`（`pages/api/sync.ts:836`），两台设备对同一 4 元组并发首推会撞唯一键。讲解这条链路改为带 `onConflict` 的 upsert，或捕获唯一键冲突后回退到 update 分支。
- **不改变生成路径**：`ExplainerService` / `ExplainerStore` seam（`src/services/explainer/ExplainerService.ts:24`）保持原样；同步在 store 之外组合（`createExplainerGenerator`，`apps/readest-app/src/app/reader/components/explainer/generator.ts:29`）。
- 新增 `useExplanationsSync`（或并入现有同步周期），按 `lastSyncedAt` 增量 push/pull，模型参照 `useBooksSync`（`apps/readest-app/src/app/library/hooks/useBooksSync.ts:60`）。同步失败不影响本地读写。

### 同步类别与门控

- `SyncCategory` 增 `'explanation'` 并加入 `SYNC_CATEGORIES`（`apps/readest-app/src/types/settings.ts:342` / `:355`），Manage Sync 面板随之出现一行（`apps/readest-app/src/app/user/components/SyncCategoriesSection.tsx:126`）+ zh-CN 文案。
- 默认 **on**（`syncCategories` 缺省即 on，`apps/readest-app/src/services/sync/syncCategories.ts:83`）；不加 `CATEGORY_DEPENDENTS` 依赖；不放进 `PROVIDER_GATED_CATEGORIES`。
- 未登录时 `SyncClient` 抛 `Not authenticated`（`apps/readest-app/src/libs/sync.ts:69`），同步层静默跳过，不清空本地。

### 数据映射

| 概念 | 本地 | wire | 服务端 |
| --- | --- | --- | --- |
| 身份 | `id` uuid + `UNIQUE(book_hash, text_hash, source_lang, native_lang)` | `id` + 4 元组 | `id` + `UNIQUE(user_id, ...4 元组)` |
| 内容 | `payload TEXT` (JSON) | `payload` | `payload jsonb` |
| 时间 | `created_at` / `updated_at` INTEGER ms | ISO 字符串 | `timestamptz` |
| 墓碑 | `deleted_at` INTEGER ms（新增） | `deleted_at` | `deleted_at timestamptz` |
| 游标 | — | `since` (ms) | `updated_at` / `deleted_at` |

### 大小与配额

- 单条 payload 是 KB 级；Postgres `jsonb` 没有 replica 的 64 KiB 行上限，这正是选 `/api/sync` 的主要理由之一。
- 讲解行数可能上千，pull 必须走 `limit` 分页；讲解库页仍然主要读本地库。

## Testing Decisions

- **好测试的定义**：只断言外部行为（给定本地行 + 假 SyncClient，push 出正确 wire 记录；pull 回的行按 4 元组合并且 LWW 正确；删除产生墓碑且拉回不复活），不测实现细节、不 mock 内部函数。
- **主 seam**：一个纯 sync/merge 模块（不依赖 Tauri / Next / fetch），输入本地 entries + 远端 records，输出待 push 集合与合并后的本地 entries。用例：同键不同 id 收敛；`updated_at` 新旧；`deleted_at` 优先于 `updated_at`；4 元组任一不同不合并；语言对隔离（切换 `sourceLang` 不串）；墓碑不被非墓碑覆盖。
- **本地迁移测试**（照 `apps/readest-app/src/__tests__/services/explainer/ExplainerDb.test.ts` 的内存库 + migrate 风格）：`deleted_at` 过滤覆盖所有读路径；软删后同键 `upsert` 复活。
- **服务端 route 测试**（照 `apps/readest-app/src/__tests__/app/api/ai/explain-route.test.ts` 风格）：新 type 的 GET 游标包含 `deleted_at`；POST 冲突走 LWW；同一 4 元组并发首推幂等。
- **端到端**（人肉冒烟，不入 CI）：设备 A 生成 → 设备 B 命中；A 删除 → B 消失；A 重新生成 → B 更新；A/B 离线各生成同段 → 联网后一条。

## Decisions

1. **全量回填（已定）**：首次开启同步全量 pull + 全量 push 本机历史讲解；客户端每次请求最多 50 条。服务端 `upsertRecords` 内部按 `BATCH_SIZE = 100` 分批（`pages/api/sync.ts:661`），50 稳定在其下且单请求体量小（~50 × KB 级）。push 侧走后台、失败可重试；上千条时按 ceil(N/50) 次请求分批推进。不要照抄 `pages/api/sync.ts:416`——那是 books 专用的初始竞态 hotfix（注入一条 dummy 已删书），不是可复用的全量分支。
2. **promptVersion 不参与合并（已定）**：合并只看 `updatedAt` / `deletedAt`，`promptVersion` 只随行同步，供将来做"版本落后"标记与批量重算。不引入"高版本优先"——它需要改服务端通用 LWW，且会破坏时间序收敛（两台设备可能各自坚持自己的版本、反复覆盖）。
3. **类别默认与 UI 反馈（按建议默认，实现前可推翻）**：默认 on；v1 不在讲解库页/面板展示同步状态或失败提示，失败静默重试。
4. **不走文件后端（按建议默认）**：WebDAV/Drive 的 library.json 路线不覆盖讲解，只在原生云通道。

## Out of Scope

- 实时同步 / 在线协作（仍是周期性 push/pull）。
- 冲突 UI 与多版本历史（讲解仍是覆盖式，与 `.scratch/explainer/map.md` 一致）。
- 讲解内容端到端加密（replica 的 credentials envelope 不覆盖这条链路）。
- 跨用户共享讲解。
- 讲解的配额计费与存储上限策略。
- 用 replica kind 承载讲解（选型理由见上）。
- 把 `explainer.db` 换成服务端 Postgres 作为唯一存储（本地优先不变）。

## Further Notes

- 实现票在 `issues/`（本目录没有 wayfinder 地图，按 tracker 约定实现票进 `issues/`）：01 本地墓碑 → 02 wire 模型 + 纯合并 → 03 服务端表 + route → 04 客户端编排 → 06 多设备冒烟；05 同步类别与 UI 可并行。01–05 均已解除开放决策阻塞。
- 最接近的既有先例是 `book_notes`：per-book、多行、LWW、`deleted_at`、`updated_at` 游标（`docker/volumes/db/init/schema.sql:83`，`pages/api/sync.ts:874`）。
- 服务端迁移目录 glob 挂载（`docker/compose.yaml:12-17`），新增迁移文件不需要 compose 改动。
- 本 spec 的软删只针对讲解条目；`.scratch/explainer/issues/06-storage-layer.md` 的"删书不级联"不变。若将来把 `deleteByBook` 接到"删书清理"，它也必须写墓碑才能跨设备生效。
- 相关代码入口：`apps/readest-app/src/services/explainer/`（本地库与服务）、`apps/readest-app/src/libs/sync.ts`（客户端同步客户端）、`apps/readest-app/src/pages/api/sync.ts`（服务端 push/pull）、`docker/volumes/db/migrations/`（服务端 schema）。
