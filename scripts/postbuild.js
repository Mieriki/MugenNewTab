#!/usr/bin/env node
/**
 * postbuild.js - 扩展构建后处理脚本
 *
 * 根据构建目标选择对应的 manifest 文件，写入 dist/manifest.json。
 * 对 Firefox 目标，同步后台脚本路径为构建产物中的 js/background-firefox.js。
 *
 * 注意：manifest 版本号由源 manifest 文件决定，签名脚本（sign-firefox.sh）会另行维护版本号，
 * 因此本脚本不再覆盖版本号。
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

function getTarget() {
    const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
    return targetArg ? targetArg.split('=')[1] : 'chromium';
}

function main() {
    const target = getTarget();

    if (target !== 'firefox' && target !== 'chromium') {
        console.error(`❌ 未知构建目标: ${target}`);
        console.error('请使用 --target=firefox 或 --target=chromium');
        process.exit(1);
    }

    const sourceFile = target === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';
    const sourcePath = path.join(ROOT_DIR, sourceFile);
    const outputPath = path.join(DIST_DIR, 'manifest.json');

    if (!fs.existsSync(sourcePath)) {
        console.error(`❌ 未找到源 manifest 文件: ${sourcePath}`);
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

    // Firefox 后台脚本路径与 Vite 输出保持一致
    if (target === 'firefox' && manifest.background && Array.isArray(manifest.background.scripts)) {
        manifest.background.scripts = ['js/background-firefox.js'];
    }

    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 4) + '\n', 'utf8');
    console.log(`✅ 已生成 ${outputPath}`);
    console.log(`   目标: ${target}`);
    console.log(`   版本: ${manifest.version}`);
}

main();
