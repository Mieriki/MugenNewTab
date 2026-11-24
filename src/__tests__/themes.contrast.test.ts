/**
 * 主题配色契约测试
 *
 * 与其它主题测试不同，这里读的是**真实的** public/config/themes.json，
 * 而不是内联 mock 配色——「主题缺 token」「容器文字不可读」这类缺陷
 * 恰恰只在真实数据里出现，mock 测试永远发现不了。
 *
 * 对比度阈值取 WCAG 2.1 AA：正文 4.5、主要文本 7。
 */

import { describe, it, expect } from 'vitest';
import themesConfig from '../../public/config/themes.json';

interface ThemeJson {
    id: string;
    family?: string;
    mode?: string;
    colors: Record<string, string>;
}

const themes = (themesConfig as { themes: ThemeJson[] }).themes;

/** 每套主题必须提供的颜色键（组件与语义层依赖的完整集合） */
const REQUIRED_KEYS = [
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

function hexToRgb(hex: string): [number, number, number] {
    const value = hex.replace('#', '');
    const full = value.length === 3
        ? value.split('').map(c => c + c).join('')
        : value;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
}

/** WCAG 相对亮度 */
function relativeLuminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map(channel => {
        const value = channel / 255;
        return value <= 0.03928
            ? value / 12.92
            : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度（1–21） */
function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

const C = '--md-sys-color-';

/** 取主题内某 token，缺失时直接让测试失败而不是静默算出一个 NaN */
function color(theme: ThemeJson, name: string): string {
    const value = theme.colors[C + name];
    if (typeof value !== 'string') {
        throw new Error(`主题 ${theme.id} 缺少 ${C + name}`);
    }
    return value;
}

describe('themes.json 配色契约', () => {
    it('主题族与明暗变体数量齐整（每族明暗各一）', () => {
        expect(themes.length).toBeGreaterThan(0);
        const families = new Map<string, Set<string>>();
        for (const theme of themes) {
            const family = theme.family ?? theme.id;
            if (!families.has(family)) {
                families.set(family, new Set());
            }
            families.get(family)!.add(theme.mode ?? 'light');
        }
        for (const [family, modes] of families) {
            expect(modes, `主题族 ${family} 应同时提供明暗变体`).toEqual(new Set(['light', 'dark']));
        }
    });

    it('每套主题都提供组件依赖的完整颜色键', () => {
        for (const theme of themes) {
            expect(Object.keys(theme.colors).sort(), `主题 ${theme.id} 的颜色键集合`).toEqual(
                [...REQUIRED_KEYS].sort()
            );
        }
    });

    it('正文与主要文本达到 AA 对比度', () => {
        for (const theme of themes) {
            expect(
                contrastRatio(color(theme, 'on-surface'), color(theme, 'surface')),
                `${theme.id} on-surface/surface`
            ).toBeGreaterThanOrEqual(7);

            expect(
                contrastRatio(color(theme, 'on-surface-variant'), color(theme, 'surface')),
                `${theme.id} on-surface-variant/surface`
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('容器上的文字达到 AA 对比度（primary / secondary / tertiary）', () => {
        for (const theme of themes) {
            for (const group of ['primary', 'secondary', 'tertiary']) {
                expect(
                    contrastRatio(
                        color(theme, `on-${group}-container`),
                        color(theme, `${group}-container`)
                    ),
                    `${theme.id} on-${group}-container/${group}-container`
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('主色上的文字：已知待修项只能改善，其余必须达 AA', () => {
        // 这些主题的 on-primary/primary 目前低于 4.5，属于诊断中记录的 P1 待修项。
        // 之所以不在这里直接改配色：它牵涉整套主色相，需要单独的设计判断。
        // 约定是——记录实测值作为下限，只能变好不能变坏；修好一个就从表里删掉。
        const KNOWN_BELOW_AA: Record<string, number> = {
            'lavender-mist-light': 4.23,
            'mint-breeze-light': 4.12,
            'forest-whisper-light': 4.07,
            'amber-glow-light': 4.44,
            'neon-cyber-dark': 3.45,
        };

        for (const theme of themes) {
            const ratio = contrastRatio(color(theme, 'on-primary'), color(theme, 'primary'));
            const baseline = KNOWN_BELOW_AA[theme.id];
            if (baseline === undefined) {
                expect(ratio, `${theme.id} on-primary/primary`).toBeGreaterThanOrEqual(4.5);
            } else {
                expect(ratio, `${theme.id} on-primary/primary 不应低于记录的基线`).toBeGreaterThanOrEqual(baseline);
            }
        }

        // 基线表不能有幽灵条目：某主题若已达标却还留在表里，说明该删了
        for (const id of Object.keys(KNOWN_BELOW_AA)) {
            const theme = themes.find(item => item.id === id);
            expect(theme, `基线表中的 ${id} 已不存在`).toBeDefined();
            expect(
                contrastRatio(color(theme!, 'on-primary'), color(theme!, 'primary')),
                `${id} 已达标，请从基线表移除`
            ).toBeLessThan(4.5);
        }
    });
});
