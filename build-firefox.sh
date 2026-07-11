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

echo "📦 创建新的构建目录..."
mkdir -p build-firefox

# 复制所有需要的文件和目录
echo "📂 复制文件..."

# 复制目录
cp -r js build-firefox/js
cp -r config build-firefox/config
cp -r view build-firefox/view
cp -r image build-firefox/image

# 复制主页面
cp index.html build-firefox/index.html

# 使用 Firefox 专用 manifest（覆盖为 manifest.json）
cp manifest.firefox.json build-firefox/manifest.json

echo "✅ 构建完成"
echo ""
echo "构建内容："
echo "  - index.html"
echo "  - js/ (含 cloudSync.js)"
echo "  - config/"
echo "  - view/"
echo "  - image/"
echo "  - manifest.json (来自 manifest.firefox.json)"
echo ""
echo "运行 ./sign-firefox.sh 进行签名。"
