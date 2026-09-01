# 自托管管理员与权益模型（初评记录）

> 状态：**初评阶段**——仅记录评估结论、范围与风险点，未出改动方案。
> 后续讨论产出方案后再补充「方案」章节（ADR 风格评审）。
> 相关背景：`docs/notes/local-development.md` §6.3.2（自托管与配额）、
> `src/utils/access.ts`（权益闸门）、`src/libs/payment/`（Stripe/IAP）。

## 目标（用户侧表述）

完全去掉订阅机制，改为：通过环境变量生成一个系统管理员账号（类似 bootstrap），
管理员可管理所有账户，并控制其他账号的可用功能、配额等。

## 现状速览

| 能力 | 当前实现 | 入口 |
|---|---|---|
| 套餐/权益 | JWT claims：`plan`、`storage_purchased_bytes`、`customization_purchased`（托管端 `custom_access_token_hook` 铸造） | `src/utils/access.ts` |
| 高级功能闸门 | `isCustomizationAllowed = isSelfHosted() \|\| customizationPurchased \|\| PREMIUM_PLANS`（SELF_HOSTED 已能整体解锁） | access.ts:139 |
| 云同步/TTS 缓存闸门 | `CLOUD_SYNC_REQUIRES_PREMIUM`、`TTS_CACHE_REQUIRES_PREMIUM` 两个 master 开关 | access.ts:69,97 |
| 配额 | `STORAGE_FIXED_QUOTA` / `TRANSLATION_FIXED_QUOTA` 运行时固定值，否则按 JWT 套餐兜底表（free 500MB / 10K 字符） | access.ts:144-169 |
| 付费 | web/桌面：Stripe（plans/checkout/portal/webhook）；移动：IAP 买断 | `src/libs/payment/`、`src/app/api/stripe/` |
| 本地自托管数据层 | docker 栈 schema 只有 books/files 等，**无 plans/subscriptions 表、无 token hook**——本地用户 JWT plan 恒为 free | `docker/volumes/db/` |

## 影响范围与难度（初评估）

| 层 | 规模 | 复杂度 |
|---|---|---|
| 权益来源（JWT → DB 驱动） | 核心改动；72 文件引用 `UserPlan/quota`，客户端大量同步读 JWT（useQuotaStats、cloudSyncProvider cachedUserPlan、翻译器门控） | 高（思路易、衔接难） |
| 闸门替换（plan 判断 → feature flag/权限解析） | 22 处调用，2 个 master 开关，可并入 SELF_HOSTED 通道 | 低（1-2 天） |
| 移除收费（Stripe 21 文件 + IAP + 6 处 upgrade/Premium UI + 34 个相关测试） | 机械工作量大 | 低-中 |
| 新增管理层（env bootstrap 管理员 + 管理界面 + CRUD API + RLS） | 新面；复用 `createSupabaseAdminClient` 但不能把 service_role 泄给客户端 | 中 |
| 测试/文案/文档清理 | 大量既有用例需同步调整 | 低 |

合计估算约 **2-3 周全职**（熟悉代码者），瓶颈不在编码，在权益模型的取舍
（客户端同步读 plan 的模式决定了不能简单删掉 JWT，需保留轻量 entitlement 快照）。

## 关键风险 / 决策点

1. **"完全去掉" vs "开关化"**：fork 自建场景最省力的路径是保留收费代码但永不初始化
   （现状 `SELF_HOSTED` 已近似）；硬删则与 upstream 长期合并冲突。
2. **移动端 IAP 无法跟随**：App Store 审核 / in-app purchase 规则要求，"完全去掉订阅"
   在 iOS/Android 发行版天然做不到，IAP 代码大概率必须保留。
3. **管理员鉴权边界**：管理动作必须服务端校验（service_role 不可达客户端），RLS 设计是
   安全重点。
4. **迁移兼容**：现有用户 JWT 里的 plan/purchase 字段在新模型下的映射规则需定义。

## 后续待讨论问题

- 管理员能力边界：仅配额，还是含自定义功能/字典/字体等资源配额？
- 是否保留 Stripe/IAP 代码路径（开关化），还是彻底拆除？
- 管理员初始化 env 的格式与轮换机制（如 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 一次性引导）。
- 多管理员/角色分级是否本轮就预留？（避免二次扩展成本）
