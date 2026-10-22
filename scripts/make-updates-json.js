#!/usr/bin/env node
/**
 * make-updates-json.js - 生成 Firefox 自托管更新清单 updates.json
 *
 * Firefox 通过 manifest 里 browser_specific_settings.gecko.update_url 指向的
 * 这个 JSON 文件检查更新：发现 version 高于已安装版本时，静默下载 update_link
 * 并安装。因此每次发版都必须重新生成它，并和 .xpi 一起放到同一个 Release 里。
 *
 * 用法：
 *   node scripts/make-updates-json.js \
 *     --version=1.0.0.104 \
 *     --repo=AlexCat315/MugenNewTab \
 *     --xpi=artifacts/mugennewtab-1.0.0.104.xpi \
 *     --out=artifacts/updates.json
 *
 * update_link 默认拼成：
 *   https://github.com/<repo>/releases/download/v<version>/<xpi 文件名>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ADDON_ID = 'cyke0315@163.com';

function getArg(name, fallback) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : fallback;
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
    const version = getArg('version');
    const repo = getArg('repo');
    const xpi = getArg('xpi');
    const out = getArg('out', 'updates.json');
    const addonId = getArg('addon-id', DEFAULT_ADDON_ID);
    const tag = getArg('tag', `v${version}`);

    if (!version || !repo || !xpi) {
        console.error('❌ 缺少必需参数：--version / --repo / --xpi');
        process.exit(1);
    }
    if (!fs.existsSync(xpi)) {
        console.error(`❌ 找不到 xpi 文件: ${xpi}`);
        process.exit(1);
    }

    const xpiName = path.basename(xpi);
    const updateLink = getArg(
        'link',
        `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(xpiName)}`
    );
    const hash = sha256(xpi);

    const manifest = {
        addons: {
            [addonId]: {
                updates: [
                    {
                        version,
                        update_link: updateLink,
                        update_hash: `sha256:${hash}`
                    }
                ]
            }
        }
    };

    fs.writeFileSync(out, JSON.stringify(manifest, null, 4) + '\n', 'utf8');

    console.log(`✅ 已生成 ${out}`);
    console.log(`   addon id : ${addonId}`);
    console.log(`   version  : ${version}`);
    console.log(`   update   : ${updateLink}`);
    console.log(`   sha256   : ${hash}`);
}

main();
