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

echo "📦 构建 Chromium 版本..."
npm run build:chromium

echo ""
echo "📂 复制构建产物到 build-chromium/..."
mkdir -p build-chromium
cp -r dist/* build-chromium/

echo ""
echo "✅ 构建完成"
echo ""
echo "构建内容："
ls -1 build-chromium
echo ""
