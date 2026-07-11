#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "  MugenNewTab - Chromium 扩展构建脚本"
echo "=========================================="
echo ""

# 清理旧的构建目录
if [ -d "build-chromium" ]; then
    echo "🧹 清理旧构建目录..."
    rm -rf build-chromium
fi

echo "📦 创建新的构建目录..."
mkdir -p build-chromium

# 复制所有需要的文件和目录
echo "📂 复制文件..."

# 复制目录
cp -r js build-chromium/js
cp -r config build-chromium/config
cp -r view build-chromium/view
cp -r image build-chromium/image

# 复制主页面
cp index.html build-chromium/index.html

# 使用 Chromium 专用 manifest（覆盖为 manifest.json）
cp manifest.json build-chromium/manifest.json

echo "✅ 构建完成"
echo ""
echo "构建内容："
echo "  - index.html"
echo "  - js/"
echo "  - config/"
echo "  - view/"
echo "  - image/"
echo "  - manifest.json (来自根目录 manifest.json)"
echo ""
