#!/bin/bash
# release.sh - 本地发版入口
#
# 做的事情：解析下一个版本号 → 写进三份 manifest → 提交 → 打 tag → 推送。
# 推送 tag 后 GitHub Actions 会自动构建、签名、发 Release、更新 updates.json。
#
# 用法：
#   ./scripts/release.sh              # 版本号自动 +1（基于最新 tag / manifest，
#                                     # 如 1.0.1.0 → 1.0.1.1，1.0.0.110 → 1.0.0.111）
#   ./scripts/release.sh 1.0.2.0      # 指定版本号（必须大于已发布的最新版本）
#
# 断点续推：
#   如果上次提交和 tag 都建好了但推送失败（网络抖动、SSL_ERROR_SYSCALL 等），
#   直接重新运行本脚本即可——它会检测到 HEAD 上未推送的 tag，跳过版本递增，
#   只把已有的提交和 tag 补推上去，不会白白消耗一个版本号。
#
# 注意：版本号只允许 1~4 段数字（每段 0~65535），且不能与已发布版本重复，
# 否则 web-ext sign 会报 "This upload has already been submitted"。
# 版本号一律以 git tag 与 manifest 为准，不再使用可被意外清零的 .build-num。

set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE="origin"
TAG=""

# ---------------------------------------------------------------
# 推送（带重试）
# ---------------------------------------------------------------
push_with_retry() {
    local attempt wait_seconds
    for attempt in 1 2 3; do
        echo "  推送尝试 ${attempt}/3..."
        if git push "$REMOTE" HEAD && git push "$REMOTE" "$TAG"; then
            return 0
        fi
        if [ "$attempt" -lt 3 ]; then
            wait_seconds=$((attempt * 5))
            echo "  ⚠️  推送失败，${wait_seconds} 秒后重试"
            sleep "$wait_seconds"
        fi
    done
    return 1
}

print_push_failed_hint() {
    echo ""
    echo "❌ 推送失败。提交和 tag 已经在本地建好了，没有丢失。"
    echo "   网络恢复后直接重新运行本脚本即可补推："
    echo "     ./scripts/release.sh"
    echo "   或者手动推送："
    echo "     git push ${REMOTE} HEAD && git push ${REMOTE} ${TAG}"
    echo ""
    echo "   注意：不要手动再升版本号，否则 ${TAG} 会变成一个永远推不上去的废 tag。"
}

# ---------------------------------------------------------------
# 断点续推：HEAD 已打 tag 但远端没有 → 说明上次推送失败，只补推
# ---------------------------------------------------------------
EXISTING_TAG="$(git tag --points-at HEAD | grep -E '^v[0-9]' | head -n 1 || true)"

if [ -n "$EXISTING_TAG" ]; then
    if ! git ls-remote --exit-code --tags "$REMOTE" "refs/tags/${EXISTING_TAG}" >/dev/null 2>&1; then
        TAG="$EXISTING_TAG"
        echo "🔄 检测到 ${TAG} 已在本地提交但尚未推送到 ${REMOTE}"
        echo "   跳过版本递增，直接补推已有的提交和 tag"
        echo ""
        if push_with_retry; then
            echo ""
            echo "✅ 已推送 ${TAG}"
            echo "   GitHub Actions 会开始构建并发布"
            exit 0
        fi
        print_push_failed_hint
        exit 1
    fi
fi

# ---------------------------------------------------------------
# 正常发版：解析版本号
# ---------------------------------------------------------------
# 先同步远端 tag，保证「最新版本」判断基于当前真实发版历史；
# 离线时拉取失败也不阻塞，回退到本地 tag + manifest。
git fetch --tags --quiet 2>/dev/null || true

if [ $# -ge 1 ]; then
    VERSION="$(node scripts/resolve-version.js "$1")"
else
    VERSION="$(node scripts/resolve-version.js)"
fi

TAG="v${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "❌ 本地已存在 tag ${TAG}，请换一个版本号"
    exit 1
fi

# 工作区有未提交改动时先停下，避免把无关改动混进发版提交
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "⚠️  工作区存在未提交的改动："
    git status --short --untracked-files=no
    echo ""
    read -r -p "仍然继续发版？这些改动会被一起提交 [y/N] " REPLY
    case "$REPLY" in
        [yY]) ;;
        *) echo "已取消"; exit 1 ;;
    esac
fi

echo "🔧 设置版本号: ${VERSION}"
node -e '
    const fs = require("fs");
    // 三个目标（Chrome / Edge / Firefox）共用同一版本号：
    // Edge 商店要求每次提交的版本号严格递增，漏掉任一份 manifest 都会让
    // 该目标的版本号停留在旧值，下次提交时被判定为「版本未提升」而拒绝。
    for (const f of ["manifest.json", "manifest.edge.json", "manifest.firefox.json"]) {
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        j.version = process.argv[1];
        fs.writeFileSync(f, JSON.stringify(j, null, 4) + "\n");
        console.log("   " + f + " -> v" + j.version);
    }
' "$VERSION"

# 只提交已跟踪文件的改动：避免把 .workbuddy-ai/、build 产物等本地文件带进仓库。
# 如果本次发版包含新增文件，请先手动 git add。
git add -u
git commit -m "chore(release): v${VERSION}"
git tag "$TAG"

echo ""
echo "🚀 推送提交与 tag..."
if ! push_with_retry; then
    print_push_failed_hint
    exit 1
fi

echo ""
echo "✅ 已推送 ${TAG}"
echo "   GitHub Actions 会开始构建并发布："
echo "   https://github.com/$(git remote get-url "$REMOTE" | sed -E 's#.*github.com[:/](.+)\.git#\1#')/actions"
