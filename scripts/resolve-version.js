#!/usr/bin/env node
/**
 * resolve-version.js - 解析下一个发版版本号
 *
 * 取代旧的 .build-num 计数器方案：
 * 旧方案在显式发版（如 1.0.1.0）时会把最后一段「0」写回计数器，
 * 把构建号从 110 打回 0，下次自动发版就降成 1.0.0.1（低于已发布版本，
 * 商店拒绝、自动更新失效）。
 *
 * 「已发布最新版本」取以下来源中的最大者：
 * - 本地 git tag（v 前缀，按数字段比较）
 * - manifest.json / manifest.edge.json / manifest.firefox.json 的当前 version
 *
 * 规则：
 * - 自动发版：最新版本最后一段 +1，前缀保持不变（1.0.1.0 → 1.0.1.1）
 * - 显式发版：必须严格大于最新版本，否则报错
 * - 版本号 1~4 段数字，每段 0~65535（Chrome 上限），禁止前导零
 *
 * 用法：
 *   node scripts/resolve-version.js          # 自动解析下一个版本
 *   node scripts/resolve-version.js 1.0.1.1  # 校验并采用显式版本
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');

/** 1~4 段数字，每段为 0 或不以 0 开头 */
const VERSION_RE = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}$/;

/** 版本号 → 数字段数组 */
function parse(version) {
    return version.split('.').map(Number);
}

/**
 * 数字段比较：缺段按 0 处理。
 * 与 Chrome / Mozilla AMO 的版本比较规则一致（逐段比较数值）。
 * @returns 负数 a<b / 0 相等 / 正数 a>b
 */
function compare(a, b) {
    const partsA = parse(a);
    const partsB = parse(b);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

/** 格式与取值范围校验（1~4 段、0~65535、无前导零） */
function valid(version) {
    if (typeof version !== 'string' || !VERSION_RE.test(version)) {
        return false;
    }
    return parse(version).every(part => part <= 65535);
}

/**
 * 计算已发布版本之后的下一个版本：末段 +1，前缀保持。
 * 末段达到 65535 时无法继续，提示手动提升前面的段。
 */
function nextAfter(version) {
    const parts = parse(version);
    const lastIndex = parts.length - 1;
    if (parts[lastIndex] >= 65535) {
        throw new Error(`版本 ${version} 末段已达 65535 上限，请手动提升前面的段`);
    }
    parts[lastIndex] += 1;
    return parts.join('.');
}

/** 收集本地 tag 与 manifest 中的版本，返回最大者；没有合法版本时返回 null */
function latestVersion() {
    const candidates = [];

    try {
        const output = execSync('git tag -l "v*"', { encoding: 'utf8' });
        for (const tag of output.split(/\s+/).filter(Boolean)) {
            candidates.push(tag.replace(/^v/, ''));
        }
    } catch {
        // 非 git 环境，只看 manifest
    }

    for (const file of ['manifest.json', 'manifest.edge.json', 'manifest.firefox.json']) {
        try {
            candidates.push(JSON.parse(fs.readFileSync(file, 'utf8')).version);
        } catch {
            // manifest 缺失/损坏时跳过
        }
    }

    let latest = null;
    for (const candidate of candidates) {
        if (!valid(candidate)) {
            continue;
        }
        if (latest === null || compare(candidate, latest) > 0) {
            latest = candidate;
        }
    }
    return latest;
}

/** 首次发版的起始版本（与旧脚本的初始值保持一致） */
const FIRST_VERSION = '1.0.0.100';

function resolve(explicit) {
    const latest = latestVersion();

    if (explicit !== null) {
        if (!valid(explicit)) {
            const error = new Error(
                `版本号格式非法: ${explicit}` +
                '（只允许 1~4 段数字，每段 0~65535，禁止前导零）'
            );
            error.code = 'INVALID_VERSION';
            throw error;
        }
        if (latest !== null && compare(explicit, latest) <= 0) {
            const error = new Error(
                `版本号 ${explicit} 必须大于已发布的最新版本 ${latest}`
            );
            error.code = 'VERSION_NOT_NEWER';
            throw error;
        }
        return explicit;
    }

    if (latest === null) {
        return FIRST_VERSION;
    }
    return nextAfter(latest);
}

function main() {
    const explicit = process.argv[2] ?? null;
    process.stdout.write(resolve(explicit));
}

module.exports = {
    parse,
    compare,
    valid,
    nextAfter,
    latestVersion,
    resolve,
    FIRST_VERSION
};

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
