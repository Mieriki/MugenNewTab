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

# ====== 步骤 1：构建 ======
echo "📦 重新构建 build-firefox 目录..."
./build-firefox.sh > /dev/null
echo "   构建完成"

# ====== 步骤 2：版本号管理 ======
BUILD_NUM_FILE=".firefox-build-num"

# 读取当前构建号（如果文件不存在则初始化）
if [ -f "$BUILD_NUM_FILE" ]; then
    BUILD_NUM=$(cat "$BUILD_NUM_FILE")
else
    # 首次运行，从较高的起始值开始（避免与旧版本冲突）
    BUILD_NUM=100
fi

# 递增构建号
BUILD_NUM=$((BUILD_NUM + 1))
VERSION="1.0.0.${BUILD_NUM}"

# 更新 manifest 版本号
update_manifest_version() {
    local file="$1"
    if [ -f "$file" ]; then
        node -e "
            const fs = require('fs');
            const p = process.argv[1];
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            j.version = process.argv[2];
            fs.writeFileSync(p, JSON.stringify(j, null, 4) + '\n');
        " "$file" "$VERSION"
        echo "   $(basename "$file") -> v${VERSION}"
    fi
}

echo "🔧 设置版本号: v${VERSION}"
update_manifest_version "manifest.firefox.json"
update_manifest_version "manifest.json"
update_manifest_version "build-firefox/manifest.json"

# 保存构建号
echo "$BUILD_NUM" > "$BUILD_NUM_FILE"

# ====== 步骤 3：签名 ======
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
echo "版本: v${VERSION}"
echo "构建号: ${BUILD_NUM}"
echo ""
echo "签名后的扩展文件位于当前目录，文件名类似："
echo "  mugen_newtab-${VERSION}-an+fx.xpi"
echo ""
echo "可以直接在 Firefox 中打开安装。"
