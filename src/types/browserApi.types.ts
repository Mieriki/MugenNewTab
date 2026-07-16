/**
 * 浏览器扩展 API 类型定义
 * 兼容 Chrome (Manifest V3 / callback 风格) 与 Firefox (Promise 风格)
 */

/** 存储项集合，键值对形式 */
export interface StorageItems {
    [key: string]: unknown;
}

/** storage.local 统一接口 */
export interface StorageLocal {
    /**
     * 读取一个或多个存储项
     * @param key 单个键、键数组，或 null/undefined 表示读取全部
     * @returns 以键值对形式返回结果对象
     */
    get(key: string | string[] | null): Promise<StorageItems>;

    /**
     * 写入存储项
     * @param items 要写入的键值对
     */
    set(items: StorageItems): Promise<void>;

    /**
     * 删除存储项
     * @param key 单个键或键数组
     */
    remove(key: string | string[]): Promise<void>;
}

/** 标签页查询条件 */
export interface TabsQueryInfo {
    active?: boolean;
    currentWindow?: boolean;
    [key: string]: unknown;
}

/** 标签页信息 */
export interface Tab {
    id?: number;
    url?: string;
    title?: string;
    favIconUrl?: string;
    [key: string]: unknown;
}

/** tabs API 统一接口 */
export interface BrowserTabs {
    /**
     * 查询标签页
     * @param queryInfo 查询条件
     * @returns 标签页数组
     */
    query(queryInfo: TabsQueryInfo): Promise<Tab[]>;
}

/** runtime.lastError 对象 */
export interface RuntimeLastError {
    message: string;
}

/** runtime API 统一接口 */
export interface BrowserRuntime {
    /** 最近一次运行时错误，无错误时为 null */
    readonly lastError: RuntimeLastError | null | undefined;

    /**
     * 将扩展内相对路径转换为绝对 URL
     * @param path 扩展内相对路径
     * @returns 绝对 URL 或原路径
     */
    getURL(path: string): string;
}

/** 统一的浏览器扩展 API */
export interface BrowserApi {
    storage: { local: StorageLocal };
    tabs: BrowserTabs;
    runtime: BrowserRuntime;
}

/** 检测到的浏览器类型 */
export type BrowserType = 'chrome' | 'firefox' | 'none';

/** 原生浏览器命名空间（Chrome 或 Firefox） */
export interface BrowserNamespace {
    storage?: {
        local?: {
            get?(key: unknown, callback?: (result: StorageItems) => void): Promise<StorageItems> | unknown;
            set?(items: StorageItems, callback?: () => void): Promise<void> | unknown;
            remove?(key: unknown, callback?: () => void): Promise<void> | unknown;
        };
        onChanged?: {
            addListener?(callback: (changes: StorageItems, areaName: string) => void): void;
            removeListener?(callback: (changes: StorageItems, areaName: string) => void): void;
        };
    };
    tabs?: {
        query?(queryInfo: TabsQueryInfo, callback?: (tabs: Tab[]) => void): unknown;
    };
    runtime?: {
        lastError?: RuntimeLastError | null;
        getURL?(path: string): string;
    };
}
