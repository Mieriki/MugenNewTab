/**
 * 图片加载与图标识别工具
 * 与原项目 js/app.js 中 Utils.createImageWithFallback、Utils.isImageIcon 行为一致
 * 禁止使用 emoji 作为占位，统一使用 24x24 SVG 占位
 */

import { escapeAttr } from './escape.util';

/**
 * 默认图片占位 SVG（24x24）
 * 使用 Material Design 风格的图片图标
 */
export const DEFAULT_IMAGE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E";

/** 系统图标基础路径 */
export const SYSTEM_ICON_BASE_PATH = '/image/icons/';

/** 判断给定字符串是否为图片图标 */
export function isImageIcon(icon?: string): boolean {
    if (!icon) {
        return false;
    }
    return (
        icon.startsWith('http') ||
        icon.startsWith('data:') ||
        icon.startsWith('//') ||
        icon.startsWith('./') ||
        icon.startsWith('/') ||
        icon.includes('.') ||
        /\.(svg|png|jpg|jpeg|gif|ico|webp)$/i.test(icon)
    );
}

/** 获取系统 SVG 图标 URL */
export function getSystemIconUrl(name: string): string {
    return `${SYSTEM_ICON_BASE_PATH}${name}.svg`;
}

/**
 * 创建带错误回退的图片 HTML 字符串
 * @param src 图片地址
 * @param alt 替代文本
 * @param fallback 加载失败时回退的图片地址（默认 SVG 占位）
 */
export function createImageWithFallback(
    src: string,
    alt: string,
    fallback = DEFAULT_IMAGE_PLACEHOLDER
): string {
    const safeSrc = escapeAttr(src);
    const safeAlt = escapeAttr(alt);
    const safeFallback = escapeAttr(fallback);
    return `<img src="${safeSrc}" alt="${safeAlt}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='${safeFallback}';">`;
}

/**
 * 创建支持黑白模式的图片 HTML 字符串
 * @param src 图片地址
 * @param alt 替代文本
 * @param style 行内样式
 * @param fallback 加载失败时回退的图片地址（默认 SVG 占位）
 */
export function createMonochromeImage(
    src: string,
    alt: string,
    style?: string,
    fallback = DEFAULT_IMAGE_PLACEHOLDER
): string {
    const safeSrc = escapeAttr(src);
    const safeAlt = escapeAttr(alt);
    const safeStyle = style ? escapeAttr(style) : '';
    const safeFallback = escapeAttr(fallback);
    const styleAttr = safeStyle ? ` style="${safeStyle}"` : '';
    return `<img src="${safeSrc}" alt="${safeAlt}" loading="lazy" decoding="async"${styleAttr} onerror="this.onerror=null; this.src='${safeFallback}';">`;
}

/** 创建 24x24 SVG 占位图标（用于无法使用系统图标时） */
export function createPlaceholderSvg(fill = '#999'): string {
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='${encodeURIComponent(fill)}' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'/%3E%3C/svg%3E`;
}
