#!/usr/bin/env node
/**
 * postbuild.js - 扩展构建后处理脚本
 *
 * 根据构建目标选择对应的 manifest 文件，写入输出目录的 manifest.json。
 * 对 Firefox 目标，同步后台脚本路径为构建产物中的 js/background-firefox.js。
 *
 * 目标说明：
 *   - chromium（默认）：Chrome / 其他 Chromium 浏览器，使用 logo_girl 图标
 *   - firefox：Firefox，使用 logo_girl 图标
 *   - edge：Microsoft Edge，使用 logo_girl 图标（全浏览器统一）
 *
 * 注意：manifest 版本号由源 manifest 文件决定，签名脚本（sign-firefox.sh）会另行维护版本号，
 * 因此本脚本不再覆盖版本号。
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_DIST_DIR = path.resolve(ROOT_DIR, 'dist-chrome');

/** 各目标对应的源 manifest 文件 */
const MANIFEST_BY_TARGET = {
    chromium: 'manifest.json',
    firefox: 'manifest.firefox.json',
    edge: 'manifest.edge.json'
};

function getTarget() {
    const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
    return targetArg ? targetArg.split('=')[1] : 'chromium';
}

function getOutDir() {
    const outArg = process.argv.find((arg) => arg.startsWith('--out='));
    if (!outArg) return DEFAULT_DIST_DIR;
    return path.resolve(ROOT_DIR, outArg.split('=')[1]);
}

/** Vite 带内容哈希的产物文件名，例如 main-OKpEOmkh.js / global-gmnIygFH.css */
const HASHED_ASSET = /-[\w-]{8}\.(?:js|css)$/;

/**
 * 清理上一轮构建遗留的哈希产物
 *
 * 因为构建使用 --emptyOutDir=false（避免误删 dist 目录），旧哈希文件会越积越多。
 * 这里只删除「带哈希但已不被任何 HTML / manifest 引用」的 js、css，
 * 无哈希的固定文件（如 background-firefox.js）一律保留。
 */
function pruneStaleAssets(distDir) {
    const jsDir = path.join(distDir, 'js');
    if (!fs.existsSync(jsDir)) {
        return [];
    }

    const referenced = [];
    for (const relPath of ['index.html', 'view/popup.html', 'manifest.json']) {
        const filePath = path.join(distDir, relPath);
        if (fs.existsSync(filePath)) {
            referenced.push(fs.readFileSync(filePath, 'utf8'));
        }
    }
    const haystack = referenced.join('\n');

    const removed = [];
    for (const fileName of fs.readdirSync(jsDir)) {
        if (!HASHED_ASSET.test(fileName)) continue;
        if (haystack.includes(fileName)) continue;
        fs.unlinkSync(path.join(jsDir, fileName));
        removed.push(fileName);
    }
    return removed;
}

function main() {
    const target = getTarget();
    const distDir = getOutDir();

    if (!MANIFEST_BY_TARGET[target]) {
        console.error(`❌ 未知构建目标: ${target}`);
        console.error(`请使用 ${Object.keys(MANIFEST_BY_TARGET).map((item) => `--target=${item}`).join(' 或 ')}`);
        process.exit(1);
    }

    const sourcePath = path.join(ROOT_DIR, MANIFEST_BY_TARGET[target]);
    const outputPath = path.join(distDir, 'manifest.json');

    if (!fs.existsSync(sourcePath)) {
        console.error(`❌ 未找到源 manifest 文件: ${sourcePath}`);
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

    // Firefox 后台脚本路径与 Vite 输出保持一致
    if (target === 'firefox' && manifest.background && Array.isArray(manifest.background.scripts)) {
        manifest.background.scripts = ['js/background-firefox.js'];
    }

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 4) + '\n', 'utf8');
    console.log(`✅ 已生成 ${outputPath}`);
    console.log(`   目标: ${target}`);
    console.log(`   版本: ${manifest.version}`);
    console.log(`   图标: ${manifest.icons ? Object.values(manifest.icons)[0] : '未指定'}`);

    const removed = pruneStaleAssets(distDir);
    if (removed.length > 0) {
        console.log(`   清理旧产物: ${removed.join(', ')}`);
    }
}

main();
