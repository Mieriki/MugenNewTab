#!/bin/bash
# release.sh - 本地发版入口
#
# 做的事情：递增版本号 → 写进两份 manifest → 提交 → 打 tag → 推送。
# 推送 tag 后 GitHub Actions 会自动构建、签名、发 Release、更新 updates.json。
#
# 用法：
#   ./scripts/release.sh              # 构建号自动 +1，例如 1.0.0.103 → 1.0.0.104
#   ./scripts/release.sh 1.0.1.0      # 指定版本号
#
# 注意：版本号只允许 1~4 段数字，且不能与 AMO 上已提交的版本重复，
# 否则 web-ext sign 会报 "This upload has already been submitted"。

set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_NUM_FILE=".build-num"

if [ -n "${1:-}" ]; then
    VERSION="$1"
else
    BUILD_NUM=$(cat "$BUILD_NUM_FILE" 2>/dev/null || echo 100)
    BUILD_NUM=$((BUILD_NUM + 1))
    VERSION="1.0.0.${BUILD_NUM}"
fi

if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+(\.[0-9]+){0,3}$'; then
    echo "❌ 版本号格式非法: $VERSION（只允许 1~4 段数字）"
    exit 1
fi

TAG="v${VERSION}"

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
    for (const f of ["manifest.json", "manifest.firefox.json"]) {
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        j.version = process.argv[1];
        fs.writeFileSync(f, JSON.stringify(j, null, 4) + "\n");
        console.log("   " + f + " -> v" + j.version);
    }
' "$VERSION"

# 同步 .build-num，保证下次自动递增基于本次版本
printf '%s' "${VERSION##*.}" > "$BUILD_NUM_FILE"

# 只提交已跟踪文件的改动：避免把 .workbuddy-ai/、build 产物等本地文件带进仓库。
# 如果本次发版包含新增文件，请先手动 git add。
git add -u
git commit -m "chore(release): v${VERSION}"
git tag "$TAG"

echo ""
echo "🚀 推送提交与 tag..."
git push origin HEAD
git push origin "$TAG"

echo ""
echo "✅ 已推送 ${TAG}"
echo "   GitHub Actions 会开始构建并发布："
echo "   https://github.com/$(git remote get-url origin | sed -E 's#.*github.com[:/](.+)\.git#\1#')/actions"
