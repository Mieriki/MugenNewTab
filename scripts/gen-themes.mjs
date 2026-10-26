#!/usr/bin/env node
/**
 * 由「单一模式的调色板」派生明/暗另一半，并生成 public/config/themes.json。
 *
 * 背景：原先 12 套主题里 7 套是亮色、5 套是深色，每套只有一个模式。
 * 现在每套主题都要同时具备明亮与深色两套调色板（12 个主题族 × 2 = 24 个变体）。
 *
 * 原则：
 * - **已有调色板原样保留**（不做任何改动），只派生缺失的那一半，
 *   避免"改造主题"变成"换主题"，老用户的观感不发生意外变化。
 * - 派生以原调色板的 primary 色相为基准，其余颜色按 Material Design 3 的
 *   明暗对称关系推导（亮色：低明度 primary + 高亮表面；深色：高明度 primary + 低亮表面）。
 *
 * 用法：
 *   node scripts/gen-themes.mjs          # 生成并覆盖 public/config/themes.json
 *   node scripts/gen-themes.mjs --check  # 只做对比度体检，不写文件
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEMES_PATH = resolve(__dirname, '../public/config/themes.json');

// ==================== 颜色工具 ====================

function hexToRgb(hex) {
    const value = hex.replace('#', '').trim();
    const full = value.length === 3
        ? value.split('').map((c) => c + c).join('')
        : value;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }) {
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** RGB → HSL（h: 0-360, s/l: 0-100） */
function rgbToHsl({ r, g, b }) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) {
        return { h: 0, s: 0, l: l * 100 };
    }
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    switch (max) {
        case rn:
            h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
            break;
        case gn:
            h = ((bn - rn) / d + 2) / 6;
            break;
        default:
            h = ((rn - gn) / d + 4) / 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

/** HSL → HEX */
function hslToHex(h, s, l) {
    const hn = ((h % 360) + 360) % 360;
    const sn = Math.max(0, Math.min(100, s)) / 100;
    const ln = Math.max(0, Math.min(100, l)) / 100;

    if (sn === 0) {
        const v = Math.round(ln * 255);
        return rgbToHex({ r: v, g: v, b: v });
    }

    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    const toChannel = (t) => {
        let tn = t;
        if (tn < 0) tn += 1;
        if (tn > 1) tn -= 1;
        if (tn < 1 / 6) return p + (q - p) * 6 * tn;
        if (tn < 1 / 2) return q;
        if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
        return p;
    };
    return rgbToHex({
        r: toChannel(hn / 360 + 1 / 3) * 255,
        g: toChannel(hn / 360) * 255,
        b: toChannel(hn / 360 - 1 / 3) * 255,
    });
}

function hexToHsl(hex) {
    return rgbToHsl(hexToRgb(hex));
}

/** 相对亮度（WCAG 2.1） */
function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const channel = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 对比度（1-21） */
function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    const light = Math.max(la, lb);
    const dark = Math.min(la, lb);
    return (light + 0.05) / (dark + 0.05);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * 提升色相饱和度下限：像 #8B0000 这种"深红"的 s 很高但 l 很低，
 * 直接搬过来做深色 primary 会偏灰，这里按明度补一点饱和度。
 */
function boostSat(sat, min) {
    return clamp(Math.max(sat, min), 0, 95);
}

// ==================== 派生逻辑 ====================

/**
 * 由亮色调色板派生深色调色板
 * 色相取自亮色 primary，表面色用该色相做极低明度染色，避免纯灰死板。
 */
function deriveDark(light) {
    const p = hexToHsl(light['--md-sys-color-primary']);
    const s = hexToHsl(light['--md-sys-color-secondary']);
    const t = hexToHsl(light['--md-sys-color-tertiary']);
    const hue = p.h;
    const sat = boostSat(p.s, 45);
    const secHue = s.s < 8 ? hue + 30 : s.h;
    const secSat = s.s < 8 ? 12 : boostSat(s.s, 18);
    const terHue = t.h;
    const terSat = boostSat(t.s, 30);

    return {
        '--md-sys-color-primary': hslToHex(hue, sat * 0.82, 74),
        '--md-sys-color-on-primary': hslToHex(hue, sat * 0.6, 18),
        '--md-sys-color-primary-container': hslToHex(hue, sat * 0.62, 27),
        '--md-sys-color-on-primary-container': hslToHex(hue, sat * 0.55, 89),
        '--md-sys-color-secondary': hslToHex(secHue, secSat * 0.75, 72),
        '--md-sys-color-on-secondary': hslToHex(secHue, secSat * 0.6, 18),
        '--md-sys-color-secondary-container': hslToHex(secHue, secSat * 0.7, 29),
        '--md-sys-color-on-secondary-container': hslToHex(secHue, secSat * 0.6, 88),
        '--md-sys-color-tertiary': hslToHex(terHue, terSat * 0.75, 73),
        '--md-sys-color-on-tertiary': hslToHex(terHue, terSat * 0.6, 18),
        '--md-sys-color-tertiary-container': hslToHex(terHue, terSat * 0.6, 29),
        '--md-sys-color-on-tertiary-container': hslToHex(terHue, terSat * 0.55, 89),
        '--md-sys-color-surface': hslToHex(hue, clamp(sat * 0.16, 4, 14), 10.5),
        '--md-sys-color-surface-variant': hslToHex(hue, clamp(sat * 0.14, 4, 12), 18),
        '--md-sys-color-on-surface': hslToHex(hue, clamp(sat * 0.12, 3, 10), 93),
        '--md-sys-color-on-surface-variant': hslToHex(hue, clamp(sat * 0.1, 3, 8), 72),
        '--md-sys-color-background': hslToHex(hue, clamp(sat * 0.16, 4, 14), 8),
        '--md-sys-color-on-background': hslToHex(hue, clamp(sat * 0.12, 3, 10), 93),
        '--md-sys-color-outline': hslToHex(hue, clamp(sat * 0.12, 4, 10), 40),
        '--md-sys-color-error': '#EF5350',
        '--md-sys-color-success': '#66BB6A',
        '--md-sys-color-inverse-surface': hslToHex(hue, clamp(sat * 0.12, 3, 10), 93),
        '--md-sys-color-inverse-on-surface': hslToHex(hue, clamp(sat * 0.14, 4, 12), 18),
    };
}

/**
 * 由深色调色板派生亮色调色板
 * 深色主题的 primary 通常是"提亮过的"色相，直接压暗即可得到同族亮色 primary。
 */
function deriveLight(dark) {
    const p = hexToHsl(dark['--md-sys-color-primary']);
    const s = hexToHsl(dark['--md-sys-color-secondary']);
    const t = hexToHsl(dark['--md-sys-color-tertiary']);
    const hue = p.h;
    const sat = boostSat(p.s, 42);
    const secHue = s.s < 8 ? hue + 30 : s.h;
    const secSat = s.s < 8 ? 14 : boostSat(s.s, 20);
    const terHue = t.h;
    const terSat = boostSat(t.s, 32);

    const surface = hslToHex(hue, clamp(sat * 0.4, 8, 30), 98);

    return {
        '--md-sys-color-primary': hslToHex(hue, sat, 40),
        '--md-sys-color-on-primary': '#FFFFFF',
        '--md-sys-color-primary-container': hslToHex(hue, sat * 0.75, 92),
        '--md-sys-color-on-primary-container': hslToHex(hue, sat, 22),
        '--md-sys-color-secondary': hslToHex(secHue, secSat, 42),
        '--md-sys-color-on-secondary': '#FFFFFF',
        '--md-sys-color-secondary-container': hslToHex(secHue, secSat * 0.6, 91),
        '--md-sys-color-on-secondary-container': hslToHex(secHue, secSat, 21),
        '--md-sys-color-tertiary': hslToHex(terHue, terSat, 42),
        '--md-sys-color-on-tertiary': '#FFFFFF',
        '--md-sys-color-tertiary-container': hslToHex(terHue, terSat * 0.55, 91),
        '--md-sys-color-on-tertiary-container': hslToHex(terHue, terSat, 21),
        '--md-sys-color-surface': surface,
        '--md-sys-color-surface-variant': hslToHex(hue, clamp(sat * 0.3, 6, 24), 93),
        '--md-sys-color-on-surface': hslToHex(hue, clamp(sat * 0.2, 4, 16), 11),
        '--md-sys-color-on-surface-variant': hslToHex(hue, clamp(sat * 0.16, 4, 14), 34),
        '--md-sys-color-background': surface,
        '--md-sys-color-on-background': hslToHex(hue, clamp(sat * 0.2, 4, 16), 11),
        '--md-sys-color-outline': hslToHex(hue, clamp(sat * 0.16, 4, 12), 55),
        '--md-sys-color-error': '#BA1A1A',
        '--md-sys-color-success': '#376B2F',
        '--md-sys-color-inverse-surface': hslToHex(hue, clamp(sat * 0.2, 4, 16), 11),
        '--md-sys-color-inverse-on-surface': hslToHex(hue, clamp(sat * 0.3, 6, 24), 93),
    };
}

/**
 * 把 primary 的对比度提到可用阈值。
 *
 * 有几套老主题的 primary 是"高饱和高明度"色（琥珀 #FFC107、薄荷绿等），
 * 直接压在浅色表面上只有 2.0 左右对比度，而 primary 在这个项目里被当成
 * 标题色 / 强调文字色用（.content-title、侧栏选中项），实际是看不清的。
 *
 * 这里只沿明度轴微调（亮色主题压暗、深色主题提亮），色相与饱和度不动，
 * 保证主题的"性格"不变；达到阈值即停，不会过度调整。
 */
function ensurePrimaryContrast(colors, mode, minContrast = 3.2) {
    const surface = colors['--md-sys-color-surface'];
    const original = colors['--md-sys-color-primary'];
    const hsl = hexToHsl(original);
    let l = hsl.l;
    let hex = original;

    for (let step = 0; step < 40; step += 1) {
        if (contrast(hex, surface) >= minContrast) break;
        l += mode === 'light' ? -1 : 1;
        if (l <= 8 || l >= 94) break;
        hex = hslToHex(hsl.h, hsl.s, l);
    }

    if (hex === original) return null;

    colors['--md-sys-color-primary'] = hex;
    // on-primary 必须跟着新 primary 走，否则按钮文字会糊在一起
    const white = '#FFFFFF';
    const dark = hslToHex(hsl.h, clamp(hsl.s, 20, 60), 12);
    colors['--md-sys-color-on-primary'] =
        contrast(hex, white) >= contrast(hex, dark) ? white : dark;

    return { from: original, to: hex, contrast: contrast(hex, surface) };
}

// ==================== 生成 ====================

/** 与调色板字段顺序保持一致，diff 更可读 */
const TOKEN_ORDER = [
    '--md-sys-color-primary',
    '--md-sys-color-on-primary',
    '--md-sys-color-primary-container',
    '--md-sys-color-on-primary-container',
    '--md-sys-color-secondary',
    '--md-sys-color-on-secondary',
    '--md-sys-color-secondary-container',
    '--md-sys-color-on-secondary-container',
    '--md-sys-color-tertiary',
    '--md-sys-color-on-tertiary',
    '--md-sys-color-tertiary-container',
    '--md-sys-color-on-tertiary-container',
    '--md-sys-color-surface',
    '--md-sys-color-surface-variant',
    '--md-sys-color-on-surface',
    '--md-sys-color-on-surface-variant',
    '--md-sys-color-background',
    '--md-sys-color-on-background',
    '--md-sys-color-outline',
    '--md-sys-color-error',
    '--md-sys-color-success',
    '--md-sys-color-inverse-surface',
    '--md-sys-color-inverse-on-surface',
];

function orderColors(colors) {
    const ordered = {};
    for (const key of TOKEN_ORDER) {
        if (colors[key]) ordered[key] = colors[key];
    }
    for (const [key, value] of Object.entries(colors)) {
        if (!(key in ordered)) ordered[key] = value;
    }
    return ordered;
}

const source = JSON.parse(readFileSync(THEMES_PATH, 'utf8'));
const checkOnly = process.argv.includes('--check');

const themes = [];
const legacyIds = {};
const report = [];
const corrections = [];

for (const old of source.themes) {
    const baseMode = old.isDark ? 'dark' : 'light';
    const lightColors = baseMode === 'light' ? { ...old.colors } : deriveLight(old.colors);
    const darkColors = baseMode === 'dark' ? { ...old.colors } : deriveDark(old.colors);

    // 对比度校正：只动明度，不动色相
    const fixes = {};
    const lightFix = ensurePrimaryContrast(lightColors, 'light');
    const darkFix = ensurePrimaryContrast(darkColors, 'dark');
    if (lightFix) fixes.light = lightFix;
    if (darkFix) fixes.dark = darkFix;
    if (Object.keys(fixes).length > 0) {
        corrections.push({ family: old.id, name: old.name, ...fixes });
    }

    const lightId = `${old.id}-light`;
    const darkId = `${old.id}-dark`;

    // 旧 ID 指向它原本所在的那一半，保证老用户升级后配色不变
    legacyIds[old.id] = baseMode === 'light' ? lightId : darkId;

    for (const [mode, id, colors] of [
        ['light', lightId, lightColors],
        ['dark', darkId, darkColors],
    ]) {
        themes.push({
            id,
            family: old.id,
            mode,
            isDark: mode === 'dark',
            name: old.name,
            description: old.description,
            logo: old.logo,
            colors: orderColors(colors),
        });
    }

    report.push({
        family: old.id,
        name: old.name,
        derived: baseMode === 'light' ? 'dark' : 'light',
        light: lightColors,
        dark: darkColors,
    });
}

// 默认主题 = 原默认主题族里"与系统无关"的那一半，运行时按系统偏好再挑模式
const defaultFamily = source.themes.find((t) => t.id === source.defaultTheme)?.id
    ?? source.themes[0].id;

const output = {
    defaultTheme: legacyIds[defaultFamily],
    legacyIds,
    themes,
};

// ==================== 对比度体检 ====================

let failed = 0;
console.log('主题族                     | 派生 | primary/表面 | 正文/表面 | 次级文字/表面');
console.log('---------------------------|------|-------------|----------|--------------');
for (const item of report) {
    for (const mode of ['light', 'dark']) {
        const c = item[mode];
        const surface = c['--md-sys-color-surface'];
        const pContrast = contrast(c['--md-sys-color-primary'], surface);
        const bodyContrast = contrast(c['--md-sys-color-on-surface'], surface);
        const mutedContrast = contrast(c['--md-sys-color-on-surface-variant'], surface);
        const ok = pContrast >= 3.0 && bodyContrast >= 7 && mutedContrast >= 4.5;
        if (!ok) failed += 1;
        console.log(
            `${`${item.family} (${mode})`.padEnd(26)} | ${(item.derived === mode ? '✓' : ' ').padEnd(4)} | `
            + `${pContrast.toFixed(2).padStart(11)} | ${bodyContrast.toFixed(2).padStart(8)} | `
            + `${mutedContrast.toFixed(2).padStart(12)}${ok ? '' : '  ✗'}`,
        );
    }
}

if (checkOnly) {
    console.log(`\n体检完成：${failed === 0 ? '全部通过' : `${failed} 项未达标`}`);
    process.exit(failed === 0 ? 0 : 1);
}

if (corrections.length > 0) {
    console.log('\n对比度校正（仅调明度，色相不变）：');
    for (const item of corrections) {
        for (const mode of ['light', 'dark']) {
            const fix = item[mode];
            if (!fix) continue;
            console.log(`  ${item.family} (${mode}): ${fix.from} → ${fix.to}（${fix.contrast.toFixed(2)}）`);
        }
    }
}

writeFileSync(THEMES_PATH, `${JSON.stringify(output, null, 4)}\n`, 'utf8');
console.log(`\n已写入 ${THEMES_PATH}`);
console.log(`主题族 ${report.length} 个，变体 ${themes.length} 个`);
if (failed > 0) {
    console.log(`注意：${failed} 项对比度未达标，需要手工微调`);
}
