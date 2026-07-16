/**
 * 浏览器扩展 API 类型定义
 * 与原项目 js/browserPolyfill.js 保持一致
 */

/** 浏览器扩展存储变更详情 */
export interface ExtensionStorageChange<T = unknown> {
    oldValue?: T;
    newValue?: T;
}

export type ExtensionStorageChanges = Record<string, ExtensionStorageChange>;

/** 标签页查询参数 */
export interface TabQueryInfo {
    active?: boolean;
    currentWindow?: boolean;
    [key: string]: unknown;
}

/** 标签页信息 */
export interface TabInfo {
    id?: number;
    title?: string;
    url?: string;
    favIconUrl?: string;
    [key: string]: unknown;
}

/** 运行时错误 */
export interface RuntimeError {
    message?: string;
}

/** 浏览器存储 API */
export interface BrowserStorageApi {
    local: {
        get(key: string | string[] | null): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
        remove(key: string | string[]): Promise<void>;
    };
}

/** 浏览器标签页 API */
export interface BrowserTabsApi {
    query(queryInfo: TabQueryInfo): Promise<TabInfo[]>;
}

/** 浏览器运行时 API */
export interface BrowserRuntimeApi {
    readonly lastError: RuntimeError | null | undefined;
    getURL(path: string): string;
}

/** 统一浏览器扩展 API */
export interface BrowserAPI {
    storage: BrowserStorageApi;
    tabs: BrowserTabsApi;
    runtime: BrowserRuntimeApi;
}

/** 运行环境标识 */
export type ExtensionEnvironment = 'chrome' | 'firefox' | 'web';
