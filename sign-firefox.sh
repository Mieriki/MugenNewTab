#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "  MugenNewTab - Firefox 扩展签名脚本"
echo "=========================================="
echo ""

if [ -z "$WEB_EXT_API_KEY" ] || [ -z "$WEB_EXT_API_SECRET" ]; then
    echo "❌ 错误：未设置 API 密钥环境变量"
    echo ""
    echo "请先执行以下命令（替换为你自己的密钥）："
    echo "  export WEB_EXT_API_KEY=\"user:xxxxxx:xx\""
    echo "  export WEB_EXT_API_SECRET=\"你的JWT私钥\""
    echo ""
    exit 1
fi

echo "✅ API 密钥已检测到"
echo "   API Key: ${WEB_EXT_API_KEY:0:10}..."
echo ""

echo "📦 重新构建 build-firefox 目录..."
./build-firefox.sh > /dev/null
echo "   构建完成"

# 自动递增版本号（避免 AMO "upload already submitted" 错误）
# 规则：基础版本号 + git 提交计数，例如 1.0.0.42
# 同时更新源码和构建目录中的 manifest
BASE_VERSION="1.0.0"
GIT_REV=$(git rev-list --count HEAD 2>/dev/null || echo "0")
NEW_VERSION="${BASE_VERSION}.${GIT_REV}"

# 更新源码 manifest 和构建目录中的 manifest
update_manifest_version() {
    local file="$1"
    if [ -f "$file" ]; then
        # 使用 node 精确修改 JSON（保持格式）
        node -e "
            const fs = require('fs');
            const p = process.argv[1];
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            j.version = process.argv[2];
            fs.writeFileSync(p, JSON.stringify(j, null, 4) + '\n');
        " "$file" "$NEW_VERSION"
        echo "   已更新 $(basename "$file") -> v${NEW_VERSION}"
    fi
}

echo "🔧 设置版本号: v${NEW_VERSION}"
update_manifest_version "manifest.firefox.json"
update_manifest_version "manifest.json"
update_manifest_version "build-firefox/manifest.json"

echo ""
echo "🔐 开始签名..."
echo ""

web-ext sign \
    --source-dir build-firefox \
    --artifacts-dir . \
    --api-key "$WEB_EXT_API_KEY" \
    --api-secret "$WEB_EXT_API_SECRET" \
    --channel unlisted

echo ""
echo "=========================================="
echo "  ✅ 签名完成！"
echo "=========================================="
echo ""
echo "版本: v${NEW_VERSION}"
echo "签名后的扩展文件位于当前目录，文件名类似："
echo "  mugen_newtab-${NEW_VERSION}-an+fx.xpi"
echo ""
echo "可以直接在 Firefox 中打开安装。"
