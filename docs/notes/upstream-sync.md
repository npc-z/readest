# 同步上游（readest/readest）main 并 rebase dev

> 对象：本仓库为 https://github.com/readest/readest 的 fork（origin = `npc-z/readest`）。
> 覆盖：上游 main 更新 → 同步本地 main → submodule 对齐 → dev rebase 到新 main。

## 0. 约定与背景

- 仓库含 **10 个 submodule**（`.gitmodules`），本地均已 `--init` 过；`nix develop` 的 shellHook 会自动 `git submodule update --init --recursive`。
- dev 的提交均为 docs 类（`idea.md`、`CONTEXT.md`、`.scratch/`），上游 main **不含这些文件**，rebase 不可能因它们冲突。
- 唯一可能冲突的文件是 `Justfile`（dev 的第 3 个提交 `Justfile: 更新配方` 改过它；上游若同时也有 Justfile 改动则冲突）。
- submodule 指针（gitlink）在 index 里就是普通树条目，ff 合并/rebase 对它的处理和普通文件一样，**不会**因为我们没碰 submodule 而产生冲突；双方同时 bump 同一 submodule 才会冲突。

## 1. 同步 main

```bash
# ① 添加上游 remote（仅首次）
git remote add upstream https://github.com/readest/readest.git

# ② 拉取（只动 refs，不动工作区）
git fetch upstream

# ③ 确认变更范围
git log --oneline main..upstream/main               # 上游新增提交列表
git diff --name-only <old main> upstream/main -- .gitmodules   # URL/路径/条目是否变化
git diff --submodule=log <old main> upstream/main | head        # 哪些 submodule 指针被 bump

# ④ 本地 main 快进（假定本地 main 未发生分歧，否则先处理分歧）
git switch main && git merge --ff-only upstream/main

# ⑤ 推送 fork 的 main（快进，无需 force）
git push origin main
```

## 2. submodule 对齐（merge 后必查）

`git merge --ff-only` 之后 `git status` 常见此一幕：

```
modified:   packages/foliate-js (new commits)
```

含义：**index 里的 gitlink 已指向新提交，而子模块工作区目录还停在旧提交**（上游 bump 了指针）。这是工作区滞后，不是真实改动，**不要 `git add` 它**。

对齐工作区：

```bash
git submodule update --init --recursive    # 全量对齐；或只对齐单个：-- packages/xxxx
```

- 只在上游改了 `.gitmodules`（URL/路径/新增条目）时才需要先 `git submodule sync --recursive`，再 update。
- 对齐后该子模块切到记录提交（detached HEAD 是预期；本地子模块上没有私有工作则无损失）。
- 判定哪些子模块滞后：`git submodule status`，前缀 `+`（超前）/`-`（未 checkout/滞后）表示与 gitlink 不一致。

## 3. dev rebase 到新 main

```bash
# ① 备份当前 dev（以备回退）
git branch backup/dev-pre-rebase

# ② rebase（dev 的提交重放到新 main 上）
git switch dev && git rebase main

# ③ 若 Justfile 冲突：保留上游内容，重新应用我们的 hunk
#    （dev 侧 hunk = uncomment Stripe 测试 key + backend-reset 加 rm 行，见 git show dev~0 -- Justfile）
#    解决后 git add Justfile && git rebase --continue

# ④ 上游若动过 submodule 指针，重放完再次对齐
git submodule update --init --recursive

# ⑤ 验证
git log --oneline main..dev     # 应恰好等于我们的提交数
git status                      # 干净，submodule 无 "new commits"
```

## 4. 推送 dev（rebase 后历史被重写，必须 force）

```bash
git push --force-with-lease origin dev
```

- `--force-with-lease` 会在远端 ref 已被他人移动时拒绝推送，安全。
- dev 换基/压缩后与 `origin/dev`（旧链）无共同演进，普通 push 会被拒是预期。
