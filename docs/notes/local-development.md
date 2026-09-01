# Readest 本地开发指南

> 对象：以 **Web 方式**（`pnpm dev-web`）做本地开发/调试，Linux + Nix 环境。
> 覆盖：环境准备 → 启动 → 数据位置 → 登录 → 本地 Supabase 自托管 → 常用命令。

## 1. 环境依赖

| 工具 | 要求 | 说明 |
|---|---|---|
| Node.js | v24（`nvm install v24`） | 与仓库 `packageManager` 匹配 |
| pnpm | 11.1.1（锁在 package.json） | 全局安装或由 flake 提供 |
| Nix（可选） | `nix develop` | 一把梭：node/pnpm/Rust 工具链（fenix）+ Tauri 系统依赖（webkitgtk、gstreamer 等）+ Playwright 浏览器 + Cachix 缓存，flake.nix:100-136 |
| Docker（仅本地 Supabase 需要） | compose v2.17+（推荐，支持 `--wait`） | 见 §6 |

`nix develop`（default devShell `readest-dev`）**已自动完成**：

- `nodejs_24` + `pnpm` 进 PATH
- Rust 工具链（cargo/rustc/rustfmt/clippy/rust-src/rust-analyzer）
- Tauri 编译所需系统库与 `LD_LIBRARY_PATH`、`GDK_BACKEND=x11`
- Playwright 浏览器（`PLAYWRIGHT_BROWSERS_PATH` 已设、跳过下载）
- **shellHook 每次进入时自动跑** `git submodule update --init --recursive` 和 `pnpm install`

## 2. 前置命令（仓库根目录）

```bash
# ① 依赖安装（nix 下由 shellHook 代劳；手动执行亦无妨）
git submodule update --init --recursive
pnpm install

# ② 复制供应商静态资源（必须，一次即可；上游 dist 更新后需重跑）
pnpm --filter @readest/readest-app setup-vendors
# 拷贝 pdfjs / simplecc-wasm / jieba 到 apps/readest-app/public/vendor/
```

> 不需要 Rust 工具链在 web 开发中；`pnpm dev-web` 不编译 Tauri。

## 3. 环境变量体系（apps/readest-app/）

| 文件 | 加载方式 | 用途 |
|---|---|---|
| `.env` | 仓库自带、`dev-web` 不显式加载但 Next 会读 | 工具链默认值：PDFJS 路径、PostHog/Supabase/Stripe 的**生产默认值（base64）** |
| `.env.web` | `dev-web` 命令 `dotenv -e .env.web -- next dev` | `NEXT_PUBLIC_APP_PLATFORM=web` |
| `.env.tauri` | `pnpm dev` / `tauri` 系列 | `NEXT_PUBLIC_APP_PLATFORM=tauri` |
| `.env.local` | Next.js 自动加载（最高优先级） | **本地覆盖**（本地 Supabase、自建 API 等，见 §6.3）；参考 `.env.local.example` |

配置优先级（`src/utils/supabase.ts`、`src/services/runtimeConfig.ts`）：

```
进程环境变量 (dotenv/=env) > runtimeConfig (/runtime-config.js，容器运行时注入) >
NEXT_PUBLIC_* 环境变量 > .env 中 base64 默认值
```

### 3.1 Supabase 配置来源（src/utils/supabase.ts:4-13）

```ts
supabaseUrl = runtimeConfig?.supabaseUrl
            || process.env['SUPABASE_URL']
            || process.env['NEXT_PUBLIC_SUPABASE_URL']
            || atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']!)
```

默认值指向仓库内嵌的**生产 Supabase**（`https://readest.supabase.co`）。

> ⚠️ **语义："未显式配置 = 连生产"是设计行为**（线上的公开 anon key，属产品设计而非泄露）。
> 因此一旦发现请求发往 `readest.supabase.co`，而你又接了本地实例，说明这条链走穿了：
>
> 1. `runtime-config.js` 返回 `{}`（env 未生效）——见 §6.3 判据
> 2. 中间两级是 `SUPABASE_URL`（服务端专用，**不会**内联进浏览器 bundle）和未设置的 `NEXT_PUBLIC_SUPABASE_URL`——浏览器里皆为 undefined
> 3. 最终命中 base64 默认值 → 生产实例
>
> 排查：`curl -s http://localhost:3000/runtime-config.js` 看返回内容即可定位走到了哪一级。

## 4. 启动

```bash
pnpm dev-web                     # 仓库根目录；http://localhost:3000，HMR
pnpm --filter @readest/readest-app build-web   # 生产构建
pnpm lint                        # tsc --noEmit + biome lint
pnpm test                        # vitest 单元测试
pnpm test:browser                # Playwright 浏览器测试 (chromium，nix 已带)
```

## 5. 本地数据存在哪里（web）

全部在浏览器端，按 origin（`http://localhost:3000`）隔离；DevTools → Application 查看/清理。

| 存储 | 用途 |
|---|---|
| **IndexedDB** `AppFileSystem` (store `files`, key=路径) | web 虚拟文件系统：`Readest/settings.json`、`Readest/Books/<hash>/…`、`Fonts`/`Images`/`Dictionaries`（`src/services/webAppService.ts:39-56`） |
| **OPFS** `navigator.storage.getDirectory()` | Turso WASM SQLite：主库、每本书 `search.db`、词典插件库、TTS 音频包缓存（webAppService.ts:407-448） |
| **localStorage** | 登录会话 `token`/`refresh_token`/`user`（AuthContext.tsx:48）；`keepLogin` 在 settings.json 中 |
| **Cache Storage** | Serwist（PWA）离线缓存，非业务数据 |

> 注意：清 localStorage 只是登出，Supabase 里的账号仍存在；清 IndexedDB+OPFS 才是"重置应用"。换端口（如 3001）/换浏览器即全新环境。

## 6. 本地 Supabase 自托管（推荐：全程数据与官方隔离）

仓库自带完整栈：`docker/compose.yaml`（db=supabase/postgres **含 Readest 完整 schema**、auth=gotrue、kong 网关:8000、rest=postgrest、minio S3:9000/9001）。

> ⚠️ compose 里的 `client` 服务会拉**生产发布镜像** `ghcr.io/readest/readest:latest` 占用 3000 端口（compose.yaml:126-132）——自托管一键运行用；本地开发**不要启动 client**，只起后端服务。

### 6.1 密钥生成（docker/.env）

```bash
cp docker/.env.example docker/.env

# ① POSTGRES_PASSWORD / ② JWT_SECRET：随机 64 位十六进制（URL-safe）
# ⚠️ 不要用 `openssl rand -base64`——base64 含 / + =。POSTGRES_PASSWORD 会被
#    直接拼进 gotrue/postgrest 的连接串（compose.yaml:63,87），`/` 会让 Go
#    的 url.Parse 解析失败返回 nil，gotrue 的 migrate (migrate_cmd.go:58)
#    未 check error 直接 u.Query() → nil 指针 panic → 容器无限 Restarting。
#    panic 日志特征：`invalid memory address or nil pointer dereference …
#    (.*cmd.migrate.*) migrate_cmd.go:58`
openssl rand -hex 32

# ③ ANON_KEY / ④ SERVICE_ROLE_KEY：HS256 JWT，必须用 JWT_SECRET 签名
#    payload 原文分别为 {"role":"anon"} / {"role":"service_role"}
export JWT_SECRET='<上面生成的 JWT_SECRET>'
node -e "
const {createHmac} = require('crypto');
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const header = b({alg:'HS256', typ:'JWT'});
const key = (role) => {
  const payload = b({role});
  const sig = createHmac('sha256', process.env.JWT_SECRET).update(header+'.'+payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
};
console.log('ANON_KEY=' + key('anon'));
console.log('SERVICE_ROLE_KEY=' + key('service_role'));
"
```

其余保持模板默认（本地路径/端口已就绪）；`MINIO_ROOT_PASSWORD` 顺手换强密码（hex 即可）；SMTP 不需要（`ENABLE_EMAIL_AUTOCONFIRM=true` 注册即登录）。

**改密钥后的联动规则**：

- 改 `POSTGRES_PASSWORD` 后**必须** `docker compose down -v` 重建数据库卷——role 密码（`supabase_auth_admin`/`authenticator`）在首次初始化时固化（`volumes/db/roles.sql:2-6`），只改 `.env` 会导致 auth/rest 连不上
- 改 `JWT_SECRET` 后**必须**重签 `ANON_KEY`/`SERVICE_ROLE_KEY`，否则 kong 拒绝所有请求

### 6.2 启动后端服务

```bash
cd docker && docker compose up -d db kong auth rest minio minio-setup
# 或自根目录执行（--wait 等待就绪，compose v2.17+ 推荐）
# docker compose --env-file docker/.env -f docker/compose.yaml up -d --wait db kong auth rest minio minio-setup
```

| 服务 | 对应端口（宿主机） |
|---|---|
| kong（auth/rest 网关） | 8000 |
| minio / minio console | 9000 / 9001（minioadmin 登录） |
| 前端 | 你的 `pnpm dev-web` :3000，**client 服务不启动** |

**验证后端就绪**：

```bash
docker compose ps          # auth/rest 应为 Up（不再 Restarting）
docker compose logs --tail 30 auth | grep migrations
# 期望：`GoTrue migrations applied successfully`（65 个迁移）

# 网关 + gotrue（200 = 网关/认证 OK）
curl -s http://localhost:8000/auth/v1/health

# 网关 + PostgREST（200 = 连上库且 schema 就绪）
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2)
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8000/rest/v1/books?select=count" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# 注意：查错表名返回 404 PGRST205 "Could not find the table ..." 属正常应答，
# 说明 PostgREST 链路是通的（正解：public.books）
```

### 6.3 前端指向本地实例（apps/readest-app/.env.local）

> **必须操作**：该文件默认不存在。不创建且不重启 dev server 时，前端会 fallback 到 `.env` 里 base64 的**生产 Supabase**（注册请求发往 `readest.supabase.co`）。
> 一键生成：`just setup env-local`（见 §7；密钥自动从 `docker/.env` 派生）。
> 判据：`curl -s http://localhost:3000/runtime-config.js` 返回 `{}` = 未生效；返回含 `supabaseUrl` 的 JSON = 就绪。
> 修改 env 文件后**必须重启** `pnpm dev-web`（Next 启动时才加载）。

照 compose.yaml 里 client 服务 environment（compose.yaml:133-152）改写为宿主机地址（**实测可用模板**，值取自 `docker/.env`）：

```env
SUPABASE_PUBLIC_URL=http://localhost:8000   # 服务端运行时配置优先采用此值
SUPABASE_URL=http://localhost:8000          # 浏览器端填宿主端口；容器内才是 http://kong:8000
SUPABASE_ANON_KEY=<anon key>
SUPABASE_ADMIN_KEY=<service_role key>       # 服务端 API 路由用（utils/supabase.ts:29-31）
API_BASE_URL=http://localhost:3000

# 浏览器端内联备份（runtime-config 未命中时 fallback 才用，与同容器中不一致极易踩坑）
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000

# 对象存储：本地 MinIO
OBJECT_STORAGE_TYPE=s3
NEXT_PUBLIC_OBJECT_STORAGE_TYPE=s3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET_NAME=readest-files
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=<minio 密码>
STORAGE_FIXED_QUOTA=1073741824
TRANSLATION_FIXED_QUOTA=50000
SELF_HOSTED=true                             # 解锁高级功能（配额仍执行，见 §6.3.2）
```

### 6.3.1 Stripe 测试密钥（/user 页本地必配，缺失即崩溃）

`/user`（订阅/套餐）页会调用 `/api/stripe/plans`，而 `src/libs/payment/stripe/server.ts:11-17` 在 dev 模式读取
`STRIPE_SECRET_KEY_DEV`——未设置时 `new Stripe(undefined!)` 抛错：HTTP 500
`Neither apiKey nor config.authenticator provided`，浏览器端再跟一个
`Failed to load Stripe.js`（`client.ts:15-18` 的 pk_test 与前端的 secret 不匹配）。
`SELF_HOSTED=true` 只管配额，**不**跳过这一页面的 Stripe 初始化。

在 Stripe 后台注册免费账号 → 开发者工具 → API keys 拿**测试模式**密钥后追加到 `.env.local`：

```bash
cat >> apps/readest-app/.env.local <<EOF
STRIPE_SECRET_KEY_DEV=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV_BASE64=$(echo -n "pk_test_xxx" | base64 -w0)
EOF
```

- 两把 key 必须**同属一个 Stripe 测试账号**（否则套餐列表能拿到、checkout 会串号）
- 你的测试账号没有 Readest 产品时，`/api/stripe/plans` 返回空数组，页面正常渲染、不报错——这是预期行为
- 调试付费流程需参照 `src/app/api/stripe/plans/route.ts` 的 `metadata.plan`/`storageGB` 结构自建测试产品
- `Failed to load Stripe.js` 若仍存在：stripe-js 需浏览器能访问 `js.stripe.com`，网络受限则列表页不受影响，仅卡片结账不可用
- 改完必须重启 `pnpm dev-web`；`just env-local` 生成的模板里有两行注释占位，取消注释填入即可

### 6.3.2 自托管与配额（SELF_HOSTED / 固定配额）

自托管下分两套机制，**不要混为一谈**：

**① SELF_HOSTED=true → 只解锁"高级功能闸门"，不碰配额**

统一闸门 `isCustomizationAllowed`（`src/utils/access.ts:139-140`）：

```ts
isCustomizationAllowed = isSelfHosted() || customizationPurchased || PREMIUM_PLANS.includes(plan)
```

置 true 后以下功能**不再看 JWT 套餐、登录与否都解锁**（`isSelfHosted():
access.ts:129-133`）：

- 字体/主题等完整自定义（Full Customization）
- 第三方云同步 WebDAV / Google Drive / S3（`isCloudSyncInPlan → isCustomizationAllowed`）
- TTS 离线音频缓存（`isTTSCacheInPlan` 同链路）
- Send-to-Readest 邮件收件箱

**② 配额始终强制执行，但数额可配置（自托管者的唯一收费"开关"）**

存储/翻译上限不随 SELF_HOSTED 抬高，看 `access.ts:144-169`：

```ts
const fixedQuota = runtimeConfig?.storageFixedQuota ?? process.env['STORAGE_FIXED_QUOTA'];
const quota = fixedQuota || DEFAULT_STORAGE_QUOTA[plan];  // plan 来自登录账号 JWT
```

| 环境变量（可放 `docker/.env` + `apps/readest-app/.env.local`） | 作用 | 缺省（设 0/删除）时的兜底 |
|---|---|---|
| `STORAGE_FIXED_QUOTA` | 所有套餐统一的云存储上限（字节） | `DEFAULT_STORAGE_QUOTA[plan]`：free 500MB / plus 5GB / pro 20GB |
| `TRANSLATION_FIXED_QUOTA` | 每日翻译字符数上限 | `DEFAULT_DAILY_TRANSLATION_QUOTA[plan]`：free 10K / plus 100K / pro 500K |

- **执行是活的**：`/api/storage/upload.ts` 会在 `usage + fileSize > quota + 10MB grace` 时 403；
  `/api/storage/stats.ts` 与 UI 进度条照常统计
- **不要设 0/删除**：0 走 `||` 回落到"按 JWT 套餐"档位（free 只有 500MB/10K，反而更严）
- **两边通道保持一致**：服务端 `pages/api` 读 `process.env`，浏览器读 `/runtime-config.js`
  （服务端 env → runtimeConfig）——`docker/.env` 与 `.env.local` 各写一份且值一致，
  否则 UI 显示与实际限额不符
- 默认模板值（compose/docker/just 生成）：1GB 存储 / 50K 翻译——属于"我运营我定价"

**③ 注意**：`/user` 订阅页的 Stripe 初始化**不走上述闸门**（`api/stripe/plans/route.ts:29`），
`SELF_HOSTED` 不解它——本地仍需要测试密钥（§6.3.1）或干脆不进该页。

### 6.4 常用操作

```bash
cd docker && docker compose down          # 停止（保留数据卷）
cd docker && docker compose down -v       # 停止并删除数据卷（重置）
```

## 7. Justfile 参考配方（仓库根目录已有此文件）

```just
# 生成 docker/.env 密钥（幂等：仅当文件缺失时生成，不覆盖手填的值）
setup:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f docker/.env ]; then
        echo "docker/.env 已存在，跳过密钥生成"
    else
        cp docker/.env.example docker/.env
        PW=$(openssl rand -hex 32)
        JWT=$(openssl rand -hex 32)
        MPW=$(openssl rand -hex 32)
        # POSTGRES_PASSWORD / JWT_SECRET / MINIO_ROOT_PASSWORD 全部用 hex（URL-safe，见 §8 事故 2）
        sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PW}|" docker/.env
        sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" docker/.env
        sed -i "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MPW}|" docker/.env
        # 用 JWT_SECRET 签出 anon / service_role 两个 JWT（base64url，无 / 无 &，可安全 s|||）
        ANON=$(JWT_SECRET="$JWT" node -e '
            const {createHmac}=require("crypto");
            const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
            const h=b({alg:"HS256",typ:"JWT"});
            const k=(role)=>{const p=b({role});return h+"."+p+"."+createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url")};
            console.log(k(process.argv[1]));
        ' anon)
        SVC=$(JWT_SECRET="$JWT" node -e '…同上，参数改为 service_role' service_role)
        sed -i "s|^ANON_KEY=.*|ANON_KEY=${ANON}|" docker/.env
        sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${SVC}|" docker/.env
        echo "docker/.env 已生成密钥"
    fi

# 生成 apps/readest-app/.env.local（幂等：缺失时从 docker/.env 取值生成）
env-local:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f apps/readest-app/.env.local ]; then
        echo "apps/readest-app/.env.local 已存在，跳过"
    else
        SVC=$(grep '^SERVICE_ROLE_KEY=' docker/.env | cut -d= -f2-)
        ANON=$(grep '^ANON_KEY=' docker/.env | cut -d= -f2-)
        MPW=$(grep '^MINIO_ROOT_PASSWORD=' docker/.env | cut -d= -f2-)
        # 模板见 §6.3，密钥动态替换生成
        cat > apps/readest-app/.env.local <<EOF
    # 由 just env-local 自动生成；修改后需重启 pnpm dev-web 才生效
    SUPABASE_PUBLIC_URL=http://localhost:8000
    SUPABASE_URL=http://localhost:8000
    SUPABASE_ANON_KEY=${ANON}
    SUPABASE_ADMIN_KEY=${SVC}
    API_BASE_URL=http://localhost:3000
    NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON}
    NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
    OBJECT_STORAGE_TYPE=s3
    NEXT_PUBLIC_OBJECT_STORAGE_TYPE=s3
    S3_ENDPOINT=http://localhost:9000
    S3_REGION=us-east-1
    S3_BUCKET_NAME=readest-files
    S3_ACCESS_KEY_ID=minioadmin
    S3_SECRET_ACCESS_KEY=${MPW}
    STORAGE_FIXED_QUOTA=1073741824
    TRANSLATION_FIXED_QUOTA=50000
    SELF_HOSTED=true
    EOF
        echo "apps/readest-app/.env.local 已生成"
    fi

# 一键：密钥 + 后端 + .env.local + Next dev server
dev-web: setup backend env-local
    pnpm dev-web

backend:
    test -f docker/.env || cp docker/.env.example docker/.env
    # minio-setup 是一次性容器（建桶后退出），--wait 会因其 exit(0) 报错，故单独启动
    docker compose --env-file docker/.env -f docker/compose.yaml up -d --wait db kong auth rest minio
    docker compose --env-file docker/.env -f docker/compose.yaml up -d minio-setup

backend-down:
    docker compose -f docker/compose.yaml down

backend-reset:
    docker compose -f docker/compose.yaml down -v
```

> 说明：幂等规则是"文件存在即跳过"。想重新生成时先删除文件再执行——例如
> `rm apps/readest-app/.env.local && just env-local`；
> 手改过 `docker/.env` 后重跑 `just setup` 不会覆盖你的值。
> `backend` 只为后端服务拉镜像，**不会碰 `client`**（否则 3000 被生产镜像占用）。
> 两个坑（均已内置修复）：① 配方内 heredoc 的每一行（含 `EOF` 终结符）必须保持
> 配方缩进，否则 just 解析报 `unknown start of token`；② `up --wait` 对一次性容器
> `minio-setup` 的 exit(0) 报错（compose ≥5.x），必须单独 `up -d`。
> 注意：替换 `docker/.env` 密钥（如删掉重跑 `just setup`）后，库卷仍是旧密码初始化的，
> 需 `just backend-reset && just backend` 重新起栈。

## 8. 常见坑（含已踩过的真实事故）

1. **client 服务占 3000**：`docker compose up`（不带服务名）会启动生产镜像，和 `pnpm dev-web` 冲突——只列后端服务名。
2. **POSTGRES_PASSWORD 用 base64 → gotrue 无限重启** ⚠️（本次事故）：base64 含 `/`，拼进连接 URL 后 Go `url.Parse` 返回 nil，gotrue migrate `u.Query()`（migrate_cmd.go:58）nil 指针 panic。症状：`supabase-auth   Restarting (2) 15 seconds ago` + panic 日志。解法：hex/base64url 密码 + `down -v` 重建库卷（见 §6.1）。
3. **改 POSTGRES_PASSWORD 后只改 .env 无效**：role 密码在库卷首次初始化时固化（roles.sql），必须 `docker compose down -v` 才能重建；不然 auth/rest 已就绪但连库失败。
4. **改 JWT_SECRET 忘了重签 ANON_KEY/SERVICE_ROLE_KEY**：kong 会拒掉所有带旧密签名的请求，日志报 JWT 验证失败。
5. **注册仍发往 `readest.supabase.co`** ⚠️（本次事故）：`.env.local` 未创建 或 创建后未重启 dev server——fallback 链走穿命中 `.env` 的 base64 生产默认值（§3.1）。判据：`curl -s http://localhost:3000/runtime-config.js` 返回 `{}`；解法：§6.3 模板 + 重启 `pnpm dev-web` + 浏览器刷新。
6. **首次初始化慢**：gotrue/db 需要几十秒，`up -d` 后立刻注册会报错；`--wait` 或 sleep 后再启动前端。
7. **`.env` 两套**：`docker/.env`（compose）与 `apps/readest-app/.env*`（Next）完全独立，互相不读。
8. **跨域**：middleware 已允许 `localhost:3000/3001`（middleware.ts:3-10）；kong 自带 cors 插件。
9. **vendors**：`public/vendor/` 缺失时 PDF/简繁转换功能报错，跑 `pnpm --filter @readest/readest-app setup-vendors`。
10. **`/user` 页 500（`Neither apiKey nor config.authenticator provided`）**：dev 模式缺 `STRIPE_SECRET_KEY_DEV`（只配了 Supabase 无关）；解法见 §6.3.1。特别注意它与 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV_BASE64` 须同账号。
