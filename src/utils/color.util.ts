/**
 * 颜色处理工具
 * 与原项目 js/ThemeManager.js 中 adjustColor、hexToRgba 行为一致
 */

/** 调整 HEX 颜色亮度（正数变亮，负数变暗） */
export function adjustColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * Math.abs(percent));
    const R = percent > 0
        ? Math.min(255, (num >> 16) + amt)
        : Math.max(0, (num >> 16) - amt);
    const G = percent > 0
        ? Math.min(255, ((num >> 8) & 0x00FF) + amt)
        : Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = percent > 0
        ? Math.min(255, (num & 0x0000FF) + amt)
        : Math.max(0, (num & 0x0000FF) - amt);
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

/** HEX 颜色转 RGBA */
export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 判断颜色是否为浅色系（用于文字颜色反色判断） */
export function isLightColor(hex: string): boolean {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = (num >> 16) & 0xFF;
    const g = (num >> 8) & 0xFF;
    const b = num & 0xFF;
    // 基于感知亮度公式
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
}
