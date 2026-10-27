#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "  MugenNewTab - 扩展打包脚本"
echo "=========================================="
echo ""

# 检查 web-ext
if ! command -v web-ext >/dev/null 2>&1; then
    echo "❌ 错误：未找到 web-ext"
    echo ""
    echo "请先安装 web-ext："
    echo "  npm install -g web-ext"
    echo ""
    exit 1
fi

echo "✅ web-ext 已安装"
echo ""

# ====== 版本号管理 ======
# 版本号统一由 scripts/resolve-version.js 从 git tag / manifest 推导，
# 不再使用可被意外清零的 .build-num。
git fetch --tags --quiet 2>/dev/null || true
VERSION="$(node scripts/resolve-version.js)"

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

# ====== 步骤 1：构建 ======
echo ""
echo "📦 构建 Firefox 目录..."
./build-firefox.sh > /dev/null
echo "   完成"

echo "📦 构建 Chromium 目录..."
./build-chromium.sh > /dev/null
echo "   完成"

# 同步更新构建目录中的 manifest 版本
update_manifest_version "build-firefox/manifest.json"
update_manifest_version "build-chromium/manifest.json"

# ====== 步骤 2：打包输出 ======
DIST_DIR="dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# ====== Chromium 打包：生成 .zip ======
echo ""
echo "🔐 开始打包 Chromium 扩展（Chrome / Edge 通用）..."

web-ext build \
    --source-dir build-chromium \
    --artifacts-dir "$DIST_DIR" \
    >/dev/null 2>&1

# web-ext 会根据 manifest 名称自动命名，这里重命名为统一名称
mv "$DIST_DIR/"*.zip "$DIST_DIR/mugen_newtab-chromium.zip" 2>/dev/null || true

echo "✅ Chromium 包: $DIST_DIR/mugen_newtab-chromium.zip"

# ====== Firefox 打包：签名 .xpi 或未签名 .zip ======
echo ""
if [ -n "$WEB_EXT_API_KEY" ] && [ -n "$WEB_EXT_API_SECRET" ]; then
    echo "🔐 检测到 Firefox API 密钥，开始签名..."
    web-ext sign \
        --source-dir build-firefox \
        --artifacts-dir "$DIST_DIR" \
        --api-key "$WEB_EXT_API_KEY" \
        --api-secret "$WEB_EXT_API_SECRET" \
        --channel unlisted
else
    echo "⚠️  未设置 Firefox API 密钥，将生成未签名 .zip"
    echo "   （如需签名，请设置 WEB_EXT_API_KEY 与 WEB_EXT_API_SECRET）"
    echo ""
    web-ext build \
        --source-dir build-firefox \
        --artifacts-dir "$DIST_DIR"
fi

echo ""
echo "=========================================="
echo "  ✅ 全部打包完成！"
echo "=========================================="
echo ""
echo "版本: v${VERSION}"
echo ""
echo "输出文件："
ls -1 "$DIST_DIR"
echo ""
echo "说明："
echo "  - mugen_newtab-chromium.zip          : Chrome / Edge 商店提交包 / 开发者模式加载包"
echo "  - 以 mugen_newtab-*.xpi 结尾的文件 : Firefox 已签名安装包"
echo "  - 以 mugen_newtab-*.zip 结尾的文件 : Firefox 未签名包（临时加载用）"
echo ""
