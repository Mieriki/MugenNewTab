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

if [ ! -d "build-firefox" ]; then
    echo "❌ 构建目录 build-firefox 不存在"
    exit 1
fi

echo "📦 构建目录验证通过"
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
echo "签名后的扩展文件位于当前目录，文件名类似："
echo "  mugen_newtab-1.0.0-an+fx.xpi"
echo ""
echo "可以直接在 Firefox 中打开安装。"
