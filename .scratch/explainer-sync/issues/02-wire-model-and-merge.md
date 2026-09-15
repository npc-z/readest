# 02: 同步 wire 模型 + 双向 transform + 纯合并规则

**What to build:** 定义 `explanations` 在 `/api/sync` 上的 wire 形状与 DB ↔ wire 双向 transform，并提供一个不依赖任何平台（无 Tauri / Next / fetch）的纯合并模块，供客户端与服务端共用与单测。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `SyncType` 增 `'explanations'`；`SyncData` / `SyncResult` 增 `explanations` 字段（`apps/readest-app/src/libs/sync.ts:8` / `:38` / `:48`）
- [ ] `types/records.ts` 增 `DBExplanation`（snake_case 服务端行）；wire 类型沿用现有约定：GET 返回 DB 行，由 `transformsFromDB` 转 camelCase（见 `src/hooks/useSync.ts:17`）
- [ ] `transformExplanationToDB`（`apps/readest-app/src/utils/transform.ts`，照 `transformBookNoteToDB:185`）：camelCase → snake_case，`payload` 对象 → JSON 字符串，`createdAt` / `updatedAt` / `deletedAt` → ISO
- [ ] `transformExplanationFromDB`（照 `transformBookNoteFromDB:227`）：反向，`payload` JSON → `ExplainerPayload`
- [ ] 纯合并模块（新文件，例如 `apps/readest-app/src/services/explainer/sync.ts`）：`mergeExplanations(local, remote)` 按 `(bookHash, textHash, sourceLang, nativeLang)` 配对，`latestChangeAt = max(updatedAt, deletedAt)`，平局给墓碑（照 `src/app/reader/hooks/useNotesSync.ts:19` 的 `incomingWins`），输出 `{ toPush, merged }`
- [ ] 测试：同键不同 `id` 收敛为一条；`updatedAt` 新旧判定；`deletedAt` 优先于 `updatedAt`；4 元组任一不同不合并；墓碑不被非墓碑覆盖；`sourceLang` 切换互不覆盖

注：`id` 不参与身份与冲突判定，服务端唯一键是 4 元组。选型理由见 `../spec.md` 的「机制选型」与「跨设备身份」。
