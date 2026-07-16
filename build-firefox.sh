#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "  MugenNewTab - Firefox 扩展构建脚本"
echo "=========================================="
echo ""

# 清理旧的构建目录
if [ -d "build-firefox" ]; then
    echo "🧹 清理旧构建目录..."
    rm -rf build-firefox
fi

echo "📦 构建 Firefox 版本..."
npm run build:firefox

echo ""
echo "📂 复制构建产物到 build-firefox/..."
mkdir -p build-firefox
cp -r dist/* build-firefox/

echo ""
echo "✅ 构建完成"
echo ""
echo "构建内容："
ls -1 build-firefox
echo ""
echo "运行 ./sign-firefox.sh 进行签名。"
