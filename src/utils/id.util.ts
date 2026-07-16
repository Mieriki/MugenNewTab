/**
 * 唯一 ID 生成工具
 * 与原项目 js/storage.js、js/app.js 中 ID 生成逻辑保持一致
 */

/** 生成通用唯一 ID */
export function generateId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** 生成应用 ID */
export function generateAppId(): string {
    return `app_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** 生成分类 ID */
export function generateCategoryId(): string {
    return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** 生成 UI 分类 ID */
export function generateUiCategoryId(): string {
    return `uicat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** 生成 UI 图标项 ID */
export function generateUiItemId(): string {
    return `uiitem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
