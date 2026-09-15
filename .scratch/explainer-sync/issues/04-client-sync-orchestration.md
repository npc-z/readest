# 04: 客户端同步编排（useExplanationsSync）

**What to build:** 登录且"讲解"类别开启时，把本地 `explainer.db` 与云端增量同步：push 本地变更（含墓碑）、pull 远端并按纯合并规则写回本地；离线 / 未登录 / 失败都静默跳过，不阻塞生成与阅读。

**Blocked by:** 02, 03, 05

**Status:** ready-for-agent

- [ ] `lastSyncedAtExplanations` 加入 `SystemSettings` 默认值与备份字段清单（参照 `apps/readest-app/src/services/constants.ts:259`、`src/services/backupService.ts:50`）
- [ ] 新增 `useExplanationsSync`（参照 `src/app/reader/hooks/useNotesSync.ts` 与 `src/app/library/hooks/useBooksSync.ts`）：装配 `ExplainerDb`，复用 `SyncClient.pullChanges` / `pushChanges`（`src/libs/sync.ts:61` / `:95`）
- [ ] push：读本地 `updatedAt > lastPushedAt` 的条目（含墓碑）→ `pushChanges({ explanations })` → 成功后推进 lastPushedAt
- [ ] pull：`pullChanges(since, 'explanations')` → `transformsFromDB` → `mergeExplanations` → `ExplainerDb.upsert`（墓碑行也写回，落成 `deleted_at`）
- [ ] 触发点对齐 notes 模式：登录/启动、前台聚焦、定时节流；未登录（`SyncClient` 抛 `Not authenticated`，`src/libs/sync.ts:69`）与网络失败静默、可重试
- [ ] 首次回填（已定）：cursor 为 0 时 pull 全量、并把本机历史讲解全量 push，客户端每次请求最多 50 条，后台分批推进、失败可重试
- [ ] 合并规则为纯 LWW（已定）：只看 `updatedAt` / `deletedAt`，不比较 `promptVersion`；`promptVersion` 仅随行写入
- [ ] 测试（假 SyncClient + 内存 ExplainerDb）：首次全量、增量、删除传播、同键冲突合并、未登录/失败不影响本地

注：讲解库页与面板继续只读本地库，本票不引入同步状态 UI（见 `../spec.md` 的 Out of Scope 与 Decisions 3）。
