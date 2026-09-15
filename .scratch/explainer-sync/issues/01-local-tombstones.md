# 01: 本地软删与墓碑（explainer.db）

**What to build:** 让讲解条目的删除可被同步——`explainer` 迁移组新增 `deleted_at`，`ExplainerDb` 改为墓碑删除 + 全读路径过滤，同键 `upsert` 把墓碑复活。这是同步能表达"删除"的地基；没有墓碑，删完就无法 push，对端也删不掉自己那条。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `explainer` schema 组新增迁移，加 `deleted_at INTEGER`（epoch ms，可空）；`getMigrations('explainer')` 回归测试（幂等可重跑、旧库升级）
- [ ] `ExplanationEntry` 增 `deletedAt: number | null`；行 ↔ entry 双向映射同步更新（`apps/readest-app/src/services/explainer/ExplainerDb.ts`）
- [ ] `delete(id)` 与 `deleteByBook(bookHash)` 改为 `UPDATE ... SET deleted_at = ?, updated_at = ?`（同一时刻 bump `updated_at`——`useBooksSync` 记过反面教训：删除不 bump `updatedAt` 会让未删除的云端行赢下 LWW 平局并"复活"该行，见 `src/app/library/hooks/useBooksSync.ts:209`）
- [ ] `getByKey` / `listByBook` / `listAll` / `search` / `listBooks` 全部加 `deleted_at IS NULL`
- [ ] `upsert` 冲突分支把 `deleted_at` 置回 `NULL`（复活）并刷新 `updated_at`；返回落库后的 `ExplanationEntry`（读到真实 `id`/`created_at`），`ExplainerService.generateAndStore` 以返回值为准——否则"删了再生成"会拿到一个与库里不一致的新 uuid，后续按该 id 删除会失效
- [ ] 测试（内存库 + migrate，照 `src/__tests__/services/explainer/ExplainerDb.test.ts`）：软删后所有读路径不可见；同键 upsert 复活且 `deleted_at` 归 NULL；`deleteByBook` 只墓碑目标书的行；`upsert` 返回的 id 与库内一致

注：`ExplainerService` 的对外行为不变（`deleteExplanation` 仍按 id、`regenerate` 仍覆盖同键）；本票只改存储语义。规格见 `../spec.md` 的「删除：本地软删 tombstone」。
