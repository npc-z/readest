# 05: 同步类别 explanation + Manage Sync UI + i18n

**What to build:** 新增用户可控的"讲解"同步类别并接入门控：默认 on、不进 `PROVIDER_GATED_CATEGORIES`（讲解没有 library.json / config.json 文件镜像），在 Manage Sync 面板出现一行，带 zh-CN 文案。

**Blocked by:** None (can start immediately；在 04 落地前该开关无实际作用)

**Status:** ready-for-agent

- [ ] `SyncCategory` 增 `'explanation'` 并加入 `SYNC_CATEGORIES`（`apps/readest-app/src/types/settings.ts:342` / `:355`）
- [ ] `syncCategories.ts` 的 `toCategory` / `isSyncCategoryEnabled` 能识别 `explanations`（`apps/readest-app/src/services/sync/syncCategories.ts:71` / `:124`）；默认 on（缺省即 on 的现有语义，`syncCategories.ts:83`）；不新增 `CATEGORY_DEPENDENTS` 依赖；不加入 `PROVIDER_GATED_CATEGORIES`（`syncCategories.ts:118`）
- [ ] Manage Sync 面板新增一行 + 说明文案（`apps/readest-app/src/app/user/components/SyncCategoriesSection.tsx:126`）
- [ ] zh-CN 文案按现有 i18n 流程提交，其他语言回退英文
- [ ] 测试：`isSyncCategoryEnabled('explanations')` 随开关变化；缺省为 on；不受 `credentials` 默认 off 影响

注：门控语义与规格 `../spec.md` 的「同步类别与门控」一致。
