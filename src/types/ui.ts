/**
 * UI 图标库相关类型定义
 * 对应原项目 config/defaultData.json 中 systemUiLib / userUiLib 结构
 */

/** UI 图标分类 */
export interface UiCategory {
    id: string;
    name: string;
}

/** UI 图标项 */
export interface UiItem {
    id: string;
    name: string;
    /** 图标 URL、Emoji 或 SVG 路径 */
    url: string;
    category: string;
    /** 是否系统内置（合并系统与用户图标库时注入） */
    isSystem?: boolean;
}

/** UI 图标库完整数据 */
export interface UiLib {
    categories: UiCategory[];
    items: UiItem[];
}

/** 用户 UI 图标库（不含 isSystem 标记） */
export interface UserUiLib {
    categories: UiCategory[];
    items: Array<Omit<UiItem, 'isSystem'>>;
}

/** 创建 UI 分类输入 */
export interface UiCategoryInput {
    name: string;
}

/** 创建 UI 图标项输入 */
export interface UiItemInput {
    name: string;
    url: string;
    category: string;
}
