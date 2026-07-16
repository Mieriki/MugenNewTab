/**
 * HTML 转义工具（XSS 防护）
 * 与原项目 js/app.js 中 Utils.escapeHtml 行为一致
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/** 转义 HTML 特殊字符，防止 XSS */
export function escapeHtml(text: unknown): string {
    if (text === null || text === undefined) {
        return '';
    }
    return String(text).replace(/[&<>"']/g, char => HTML_ESCAPE_MAP[char]);
}

/** 转义 HTML 属性值（额外处理反引号） */
export function escapeAttr(text: unknown): string {
    return escapeHtml(text).replace(/`/g, '&#96;');
}

/** 转义 CSS 字符串 */
export function escapeCssString(text: unknown): string {
    if (text === null || text === undefined) {
        return '';
    }
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
}
