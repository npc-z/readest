# 一键：密钥 + 后端 + .env + web dev server
dev-web: setup backend
    pnpm dev-web

# setup env
setup: docker-env env-local

# 生成 docker/.env 密钥（幂等：仅当文件缺失时生成，不覆盖手填的值）
docker-env:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f docker/.env ]; then
        echo "docker/.env 已存在，跳过密钥生成"
    else
        cp docker/.env.example docker/.env
        PW=$(openssl rand -hex 32)
        JWT=$(openssl rand -hex 32)
        MPW=$(openssl rand -hex 32)
        sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PW}|" docker/.env
        sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" docker/.env
        sed -i "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MPW}|" docker/.env
        ANON=$(JWT_SECRET="$JWT" node -e '
            const {createHmac}=require("crypto");
            const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
            const h=b({alg:"HS256",typ:"JWT"});
            const k=(role)=>{const p=b({role});return h+"."+p+"."+createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url")};
            console.log(k(process.argv[1]));
        ' anon)
        SVC=$(JWT_SECRET="$JWT" node -e '
            const {createHmac}=require("crypto");
            const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
            const h=b({alg:"HS256",typ:"JWT"});
            const k=(role)=>{const p=b({role});return h+"."+p+"."+createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url")};
            console.log(k(process.argv[1]));
        ' service_role)
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
    # Stripe 测试密钥（/user 页与 /api/stripe/plans 依赖；去 Stripe 后台拿测试 key，
    # 取消注释并填入同账号的 sk_test/pk_test。缺失时 /user 页 500）
    STRIPE_SECRET_KEY_DEV=sk_test_123
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV_BASE64=<echo -n "pk_test_123" | base64 -w0 的结果>
    EOF
        echo "apps/readest-app/.env.local 已生成"
    fi

backend:
    test -f docker/.env || cp docker/.env.example docker/.env
    # minio-setup 是一次性容器（建桶后退出），--wait 会因其 exit(0) 报错，故单独启动
    docker compose --env-file docker/.env -f docker/compose.yaml up -d --wait db kong auth rest minio
    docker compose --env-file docker/.env -f docker/compose.yaml up -d minio-setup

backend-down:
    docker compose -f docker/compose.yaml down

backend-reset:
    docker compose -f docker/compose.yaml down -v
    rm -f apps/readest-app/.env.local
    rm -f docker/.env
