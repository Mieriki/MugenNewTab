#!/usr/bin/env node
/**
 * make-latest-json.js - 生成应用内更新检查用的静态清单 latest.json
 *
 * 为什么不用 GitHub REST API：
 * 未认证的 `releases/latest` 接口限 60 次/小时/IP，公司 NAT、VPN、云主机这类
 * 共享出口很容易被刷满，届时检查会静默失败，用户永远看不到新版本提示。
 * 把版本信息做成 Release 资产，由 CDN 直出，既没有频率限制，也不受 CORS 约束
 * （扩展有 host_permissions，可以直接 fetch）。
 *
 * 用法：
 *   node scripts/make-latest-json.js \
 *     --version=1.0.0.109 \
 *     --repo=AlexCat315/MugenNewTab \
 *     --xpi=artifacts/mugennewtab-1.0.0.109.xpi \
 *     --zip=artifacts/mugen_newtab-chromium.zip \
 *     --out=artifacts/latest.json
 *
 * 客户端读取地址：
 *   https://github.com/<repo>/releases/latest/download/latest.json
 */

const fs = require('fs');
const path = require('path');

function getArg(name, fallback) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : fallback;
}

function main() {
    const version = getArg('version');
    const repo = getArg('repo');
    const out = getArg('out', 'latest.json');
    const tag = getArg('tag', `v${version}`);
    const xpi = getArg('xpi');
    const zip = getArg('zip');

    if (!version || !repo) {
        console.error('❌ 缺少必需参数：--version / --repo');
        process.exit(1);
    }

    /** 拼 Release 资产的固定下载地址 */
    const assetUrl = (fileName) =>
        fileName
            ? `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(fileName)}`
            : '';

    const payload = {
        version,
        tag,
        release: `https://github.com/${repo}/releases/tag/${tag}`,
        // 按浏览器区分的安装包；缺失时客户端回退到 release 页面
        firefox: xpi ? assetUrl(path.basename(xpi)) : '',
        chromium: zip ? assetUrl(path.basename(zip)) : '',
        publishedAt: new Date().toISOString()
    };

    fs.writeFileSync(out, JSON.stringify(payload, null, 4) + '\n', 'utf8');

    console.log(`✅ 已生成 ${out}`);
    console.log(`   version  : ${payload.version}`);
    console.log(`   firefox  : ${payload.firefox || '(无)'}`);
    console.log(`   chromium : ${payload.chromium || '(无)'}`);
}

main();
