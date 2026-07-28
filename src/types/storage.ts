/**
 * 存储相关类型定义与常量
 * 与原项目 js/storage.js、js/cloudSync.js、js/ThemeManager.js 保持一致
 */

import type { AppNavigatorData } from './app';
import type { UserUiLib, UiLib } from './ui';

/** 存储键名常量 */
export const STORAGE_KEYS = {
    MAIN_DATA: 'appNavigator_data',
    USER_UI_LIB: 'appNavigator_user_uiLib',
    DATA_UPDATED_AT: 'appNavigator_dataUpdatedAt',
    WALLPAPER: 'appNavigator_wallpaper',
    WALLPAPER_IMAGE: 'appNavigator_wallpaper_image',
    CLOUD_TOKEN: 'appNavigator_cloudSync_token',
    CLOUD_GIST_ID: 'appNavigator_cloudSync_gistId',
    CLOUD_AUTO_SYNC: 'appNavigator_cloudSync_autoSync',
    CLOUD_LAST_SYNC_TIME: 'appNavigator_cloudSync_lastSyncTime',
    CLOUD_USER_INFO: 'appNavigator_cloudSync_userInfo',
    SELECTED_THEME: 'selectedTheme',
    SIDEBAR_COLLAPSED: 'sidebarCollapsed',
    SEARCH_HISTORY: 'searchHistory',
    SELECTED_SEARCH_ENGINE: 'selectedSearchEngine',
    SHOW_HIDDEN_APPS: 'appNavigator_showHiddenApps',
    HIDDEN_TIP_DISMISSED: 'appNavigator_hiddenTipDismissed',
    LAYOUT_SETTINGS: 'appNavigator_layoutSettings'
} as const;

/** 需要同步镜像到 localStorage 的首屏设置键（防止 FOUC 闪烁） */
export const SYNC_MIRROR_KEYS = new Set<string>([
    STORAGE_KEYS.SELECTED_THEME,
    STORAGE_KEYS.SELECTED_SEARCH_ENGINE,
    STORAGE_KEYS.SEARCH_HISTORY,
    STORAGE_KEYS.SIDEBAR_COLLAPSED
]);

/** 云同步需要收集的本地数据键 */
export const CLOUD_SYNC_DATA_KEYS: string[] = [
    STORAGE_KEYS.MAIN_DATA,
    STORAGE_KEYS.USER_UI_LIB,
    STORAGE_KEYS.WALLPAPER,
    STORAGE_KEYS.WALLPAPER_IMAGE,
    STORAGE_KEYS.SELECTED_THEME,
    STORAGE_KEYS.SIDEBAR_COLLAPSED,
    STORAGE_KEYS.SEARCH_HISTORY,
    STORAGE_KEYS.SELECTED_SEARCH_ENGINE,
    STORAGE_KEYS.SHOW_HIDDEN_APPS,
    STORAGE_KEYS.HIDDEN_TIP_DISMISSED,
    STORAGE_KEYS.LAYOUT_SETTINGS,
    STORAGE_KEYS.DATA_UPDATED_AT
];

/** 存储项值类型 */
export type StorageValue = string | number | boolean | object | null | undefined;

/** 单个存储变更详情 */
export interface StorageChange<T = StorageValue> {
    oldValue?: T;
    newValue?: T;
}

/** 存储变更映射 */
export type StorageChanges = Record<string, StorageChange>;

/** 壁纸设置 */
export interface WallpaperSettings {
    url: string;
    opacity: number;
    blur: number;
    overlayOpacity: number;
    /** 是否为本地图片（Base64 存储） */
    isLocalImage?: boolean;
}

/** 页面布局设置 */
export interface LayoutSettings {
    /** 每行卡片列数，'auto' 表示按宽度自适应 */
    columns: number | 'auto';
    /** 是否开启分页模式 */
    paginate: boolean;
    /** 分页模式每页卡片数 */
    pageSize: number;
    /** 是否在侧栏显示「全部应用」分类（false 时只按分类显示） */
    showAllCategory: boolean;
    /** 「全部应用」视图是否平铺显示（不按分类分组） */
    allViewFlat: boolean;
    /** 是否显示站点卡片图标背景（false 时图标背景透明） */
    showIconBackground: boolean;
}

/** 本地壁纸图片元数据 */
export interface WallpaperImageData {
    data: string;
    name: string;
    type: string;
    size: number;
    timestamp: number;
}

/** GitHub 用户信息缓存 */
export interface CloudSyncUserInfo {
    login: string;
    id: number;
    avatar: string;
}

/** 云同步设置 */
export interface CloudSyncSettings {
    token: string | null;
    gistId: string | null;
    autoSync: boolean;
    lastSyncTime: number;
    userInfo: CloudSyncUserInfo | null;
}

/** 导出/导入备份结构 */
export interface BackupData {
    data?: AppNavigatorData;
    userUiLib?: UserUiLib;
    /** 旧版本备份可能直接包含 uiLib */
    uiLib?: UiLib;
    exportTime?: string;
    version?: string;
}

/** 云同步快照（DataManager.applyStorageSnapshot 使用） */
export type StorageSnapshot = Record<string, StorageValue>;

/** 存储事件监听器 */
export type StorageChangeListener = (changes: StorageChanges) => void;

/** 存储变更来源 */
export type StorageChangeSource = 'local' | 'external' | 'cloud';
