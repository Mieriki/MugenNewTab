/**
 * browserApi.service.ts
 * 统一 Chrome / Firefox / Edge 扩展 API 抽象层
 *
 * 提供与原生 js/browserPolyfill.js 行为一致的封装：
 *   - storage.local.get / set / remove
 *   - tabs.query
 *   - runtime.lastError / runtime.getURL
 *
 * 非扩展环境自动降级到 localStorage，保证网页版可用性。
 */
import type {
    StorageItems,
    StorageLocal,
    TabsQueryInfo,
    Tab,
    BrowserTabs,
    BrowserRuntime,
    BrowserApi,
    BrowserType,
    BrowserNamespace,
    RuntimeLastError
} from '@/types/browserApi.types';

/** 判断值是否为字符串 */
function isString(value: unknown): value is string {
    return typeof value === 'string';
}

/** 解析 localStorage 中存储的值，失败时返回原字符串 */
function parseStoredValue(value: string | null): unknown {
    if (value === null) return null;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

class BrowserApiService implements BrowserApi {
    /** 缓存检测结果，避免重复计算 */
    private _browserType: BrowserType | null = null;
    private _apiRoot: BrowserNamespace | null = null;
    private _detected = false;

    /** 缓存的 API 代理对象 */
    private _storageLocal: StorageLocal | null = null;
    private _tabs: BrowserTabs | null = null;
    private _runtime: BrowserRuntime | null = null;

    /** 判断当前是否运行在浏览器扩展环境中 */
    get isExtension(): boolean {
        return this.detect().isExtension;
    }

    /** 获取当前浏览器类型 */
    get browserType(): BrowserType {
        return this.detect().browserType;
    }

    /** 获取原生浏览器命名空间 */
    get apiRoot(): BrowserNamespace | null {
        return this.detect().apiRoot;
    }

    /**
     * 检测当前运行环境
     * 优先使用 Firefox 的 Promise 风格 browser 对象，否则回退到 chrome
     */
    private detect(): { isExtension: boolean; browserType: BrowserType; apiRoot: BrowserNamespace | null } {
        if (this._detected) {
            return {
                isExtension: this._browserType !== 'none',
                browserType: this._browserType ?? 'none',
                apiRoot: this._apiRoot
            };
        }

        const browserNs = (typeof window !== 'undefined' && (window as unknown as { browser?: BrowserNamespace }).browser) || null;
        const chromeNs = (typeof window !== 'undefined' && (window as unknown as { chrome?: BrowserNamespace }).chrome) || null;
        const apiRoot = browserNs || chromeNs;

        const isExtension = !!(
            apiRoot &&
            apiRoot.storage &&
            apiRoot.storage.local
        );

        if (isExtension) {
            this._browserType = browserNs && browserNs.storage && browserNs.storage.local ? 'firefox' : 'chrome';
        } else {
            this._browserType = 'none';
        }

        this._apiRoot = apiRoot;
        this._detected = true;

        return {
            isExtension: this._browserType !== 'none',
            browserType: this._browserType,
            apiRoot: this._apiRoot
        };
    }

    /**
     * 将 Chrome 回调风格 API 包装为 Promise
     * 例如: promisifyCall(chrome.storage.local, 'get', [key]) -> Promise(result)
     */
    private promisifyCall<T>(
        obj: Record<string, (...args: unknown[]) => unknown>,
        method: string,
        args: unknown[]
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            try {
                const fn = obj[method];
                if (typeof fn !== 'function') {
                    reject(new Error(`浏览器 API 不支持 ${method}`));
                    return;
                }
                fn.apply(obj, [
                    ...args,
                    (result: T) => {
                        const lastError = this.apiRoot?.runtime?.lastError;
                        if (lastError) {
                            reject(new Error(lastError.message || String(lastError)));
                            return;
                        }
                        resolve(result);
                    }
                ]);
            } catch (error) {
                reject(error);
            }
        });
    }

    /** 非扩展环境：使用 localStorage 模拟 storage.local */
    private buildLocalStorageApi(): StorageLocal {
        return {
            get: async (key: string | string[] | null): Promise<StorageItems> => {
                if (key === null || key === undefined) {
                    const all: StorageItems = {};
                    for (let i = 0; i < window.localStorage.length; i++) {
                        const k = window.localStorage.key(i);
                        if (k === null) continue;
                        all[k] = parseStoredValue(window.localStorage.getItem(k));
                    }
                    return all;
                }

                const keys = Array.isArray(key) ? key : [key];
                const result: StorageItems = {};
                for (const k of keys) {
                    const raw = window.localStorage.getItem(k);
                    if (raw !== null) {
                        result[k] = parseStoredValue(raw);
                    }
                }
                return result;
            },

            set: async (items: StorageItems): Promise<void> => {
                for (const [k, value] of Object.entries(items)) {
                    const storageValue = isString(value) ? value : JSON.stringify(value);
                    window.localStorage.setItem(k, storageValue);
                }
            },

            remove: async (key: string | string[]): Promise<void> => {
                const keys = Array.isArray(key) ? key : [key];
                for (const k of keys) {
                    window.localStorage.removeItem(k);
                }
            }
        };
    }

    /** 扩展环境：构建 storage.local 封装 */
    private buildExtensionStorageApi(): StorageLocal {
        const apiRoot = this.apiRoot;
        const storage = apiRoot?.storage;
        const local = storage?.local;
        const browserNs = (typeof window !== 'undefined' && (window as unknown as { browser?: BrowserNamespace }).browser) || null;
        const hasNativePromise = !!(browserNs && browserNs.storage && browserNs.storage.local);

        return {
            get: async (key: string | string[] | null): Promise<StorageItems> => {
                if (hasNativePromise) {
                    return (browserNs!.storage!.local!.get as (k: typeof key) => Promise<StorageItems>)(key);
                }
                return this.promisifyCall<StorageItems>(local as Record<string, (...args: unknown[]) => unknown>, 'get', [key]);
            },

            set: async (items: StorageItems): Promise<void> => {
                if (hasNativePromise) {
                    await (browserNs!.storage!.local!.set as (items: StorageItems) => Promise<void>)(items);
                    return;
                }
                await this.promisifyCall<void>(local as Record<string, (...args: unknown[]) => unknown>, 'set', [items]);
            },

            remove: async (key: string | string[]): Promise<void> => {
                if (hasNativePromise) {
                    await (browserNs!.storage!.local!.remove as (k: typeof key) => Promise<void>)(key);
                    return;
                }
                await this.promisifyCall<void>(local as Record<string, (...args: unknown[]) => unknown>, 'remove', [key]);
            }
        };
    }

    /** 构建 storage.local */
    private getStorageLocal(): StorageLocal {
        if (!this._storageLocal) {
            this._storageLocal = this.isExtension
                ? this.buildExtensionStorageApi()
                : this.buildLocalStorageApi();
        }
        return this._storageLocal;
    }

    /** 构建 tabs.query */
    private getTabs(): BrowserTabs {
        if (!this._tabs) {
            const apiRoot = this.apiRoot;
            const tabs = apiRoot?.tabs;
            const browserNs = (typeof window !== 'undefined' && (window as unknown as { browser?: BrowserNamespace }).browser) || null;
            const hasNativePromise = !!(browserNs && browserNs.tabs);

            this._tabs = {
                query: async (queryInfo: TabsQueryInfo): Promise<Tab[]> => {
                    if (!tabs) {
                        return [];
                    }
                    if (hasNativePromise) {
                        return (browserNs!.tabs!.query as (info: TabsQueryInfo) => Promise<Tab[]>)(queryInfo);
                    }
                    return this.promisifyCall<Tab[]>(tabs as Record<string, (...args: unknown[]) => unknown>, 'query', [queryInfo]);
                }
            };
        }
        return this._tabs;
    }

    /** 构建 runtime */
    private getRuntime(): BrowserRuntime {
        if (!this._runtime) {
            const apiRoot = this.apiRoot;
            const runtime = apiRoot?.runtime;

            this._runtime = {
                get lastError(): RuntimeLastError | null | undefined {
                    return runtime ? runtime.lastError : null;
                },

                getURL: (path: string): string => {
                    if (runtime && runtime.getURL) {
                        return runtime.getURL(path);
                    }
                    return path;
                }
            };
        }
        return this._runtime;
    }

    /** storage.local 统一入口 */
    get storage(): { local: StorageLocal } {
        return { local: this.getStorageLocal() };
    }

    /** tabs 统一入口 */
    get tabs(): BrowserTabs {
        return this.getTabs();
    }

    /** runtime 统一入口 */
    get runtime(): BrowserRuntime {
        return this.getRuntime();
    }

    /**
     * 重置环境检测缓存（主要用于单元测试）
     */
    resetDetection(): void {
        this._detected = false;
        this._browserType = null;
        this._apiRoot = null;
        this._storageLocal = null;
        this._tabs = null;
        this._runtime = null;
    }
}

/** 浏览器 API 服务单例 */
export const browserApi = new BrowserApiService();

/** 与原生 js/browserPolyfill.js 保持一致命名的导出 */
export const BrowserAPI = browserApi;

/** 是否运行在浏览器扩展环境中 */
export const isExtension = (): boolean => browserApi.isExtension;

/** 当前检测到的浏览器类型 */
export const browserType = (): BrowserType => browserApi.browserType;

/** 默认导出 */
export default browserApi;

/** 类型重导出，方便统一从 service 文件导入 */
export type {
    StorageItems,
    StorageLocal,
    TabsQueryInfo,
    Tab,
    BrowserTabs,
    BrowserRuntime,
    BrowserApi,
    BrowserType,
    BrowserNamespace,
    RuntimeLastError
} from '@/types/browserApi.types';
