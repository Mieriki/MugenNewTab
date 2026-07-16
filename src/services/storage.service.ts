/**
 * 统一存储与数据管理层
 * 主页面、popup 和云同步必须共用本服务，避免缓存与持久化语义分叉。
 *
 * 底层存储后端复用 browserApi.service.ts 提供的 BrowserAPI.storage.local，
 * 仅在订阅扩展原生变更事件时直接访问 window.chrome/browser.storage.onChanged。
 */

import { BrowserAPI } from '@/services/browserApi.service';
import type {
    StorageValue,
    StorageChanges,
    StorageChangeListener,
} from '@/types/storage';
import {
    STORAGE_KEYS,
    SYNC_MIRROR_KEYS,
} from '@/types/storage';

/** 本地存储变更事件名 */
export const STORAGE_EVENT = 'mugen-storage-change';

/** 同步镜像键集合（从 types/storage.ts 重新导出，便于 service 内部使用） */
export { SYNC_MIRROR_KEYS };

/** 常用存储键集合（从 types/storage.ts 重新导出） */
export { STORAGE_KEYS };

/**
 * 构建包含原始错误信息的错误对象
 * 由于项目 target 为 ES2020，Error cause 选项不在类型定义中，
 * 因此将原始错误信息拼入 message。
 */
function createError(message: string, cause?: unknown): Error {
    if (cause instanceof Error) {
        return new Error(`${message}: ${cause.message}`);
    }
    if (cause !== undefined && cause !== null) {
        return new Error(`${message}: ${String(cause)}`);
    }
    return new Error(message);
}

/**
 * 深度克隆辅助函数
 * 优先使用 structuredClone，不支持时回退到 JSON 序列化。
 */
function clone<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof structuredClone === 'function') {
        return structuredClone(value) as T;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 解析本地存储中的字符串值
 * JSON 字符串会被解析为对应类型，解析失败则保留原字符串。
 */
function parseStoredValue(value: string | null): StorageValue {
    if (value === null || value === undefined) {
        return null;
    }
    try {
        return JSON.parse(value) as StorageValue;
    } catch (_) {
        return value;
    }
}

/**
 * 同步镜像键类型
 */
export type SyncMirrorKey = 'selectedTheme' | 'selectedSearchEngine' | 'searchHistory' | 'sidebarCollapsed';

const SYNC_MIRROR_KEY_SET = SYNC_MIRROR_KEYS;

/**
 * 原生扩展 storage.onChanged 监听器类型
 */
type NativeChangeListener = (changes: StorageChanges, areaName: string) => void;

/**
 * 原生扩展 API 命名空间（仅用于订阅 onChanged）
 */
interface NativeExtensionNamespace {
    storage?: {
        onChanged?: {
            addListener(listener: NativeChangeListener): void;
            removeListener(listener: NativeChangeListener): void;
        };
    };
}

interface WindowWithNativeExtension {
    chrome?: NativeExtensionNamespace;
    browser?: NativeExtensionNamespace;
}

/**
 * 获取原生扩展 storage.onChanged 对象
 */
function getNativeOnChanged() {
    const globalWindow = window as unknown as WindowWithNativeExtension;
    const apiRoot = globalWindow.chrome || globalWindow.browser;
    return apiRoot?.storage?.onChanged ?? null;
}

export interface IStorageManager {
    readonly isExtension: boolean;
    getSync(key: string): StorageValue;
    get(key: string): Promise<StorageValue | null>;
    getMany(keys: string[]): Promise<Record<string, StorageValue | null>>;
    set(key: string, value: StorageValue): Promise<void>;
    setMany(items: Record<string, StorageValue>): Promise<void>;
    remove(key: string): Promise<void>;
    subscribe(listener: StorageChangeListener): () => void;
}

/**
 * 统一存储管理器
 * 自动检测扩展环境并选择 storage.local 或 localStorage 作为后端。
 * 对主题、搜索引擎等首屏设置保留 localStorage 同步镜像，避免 FOUC 闪烁。
 */
export class StorageManager implements IStorageManager {
    /**
     * 是否运行在浏览器扩展环境中
     */
    get isExtension(): boolean {
        return BrowserAPI.isExtension;
    }

    /**
     * 同步读取 localStorage（主要用于同步镜像键的首屏回退）
     */
    getSync(key: string): StorageValue {
        return parseStoredValue(localStorage.getItem(key));
    }

    /**
     * 异步读取单个存储项
     * 扩展环境中缺失且为同步镜像键时，自动回退读取 localStorage 并回填。
     */
    async get(key: string): Promise<StorageValue | null> {
        try {
            const result = await BrowserAPI.storage.local.get(key);
            let value: StorageValue = result && typeof result === 'object'
                ? (result as Record<string, StorageValue>)[key]
                : (result as StorageValue);

            if (
                (value === undefined || value === null) &&
                this.isExtension &&
                SYNC_MIRROR_KEY_SET.has(key)
            ) {
                value = this.getSync(key);
                if (value !== null) {
                    await BrowserAPI.storage.local.set({ [key]: value });
                }
            }
            return value === undefined ? null : clone(value);
        } catch (error) {
            throw createError(`读取存储项 ${key} 失败`, error);
        }
    }

    /**
     * 异步批量读取存储项
     */
    async getMany(keys: string[]): Promise<Record<string, StorageValue | null>> {
        const entries = await Promise.all(
            keys.map(async key => [key, await this.get(key)] as const)
        );
        return Object.fromEntries(entries);
    }

    /**
     * 异步写入单个存储项
     */
    set(key: string, value: StorageValue): Promise<void> {
        return this.setMany({ [key]: value });
    }

    /**
     * 异步批量写入存储项
     * 同步镜像键会先写入 localStorage，持久化失败时回滚 localStorage 镜像。
     */
    async setMany(items: Record<string, StorageValue>): Promise<void> {
        const storedItems = clone(items);
        const previousMirrors = new Map<string, string | null>();

        for (const key of Object.keys(storedItems)) {
            if (SYNC_MIRROR_KEY_SET.has(key)) {
                previousMirrors.set(key, localStorage.getItem(key));
                localStorage.setItem(key, JSON.stringify(storedItems[key]));
            }
        }

        try {
            await BrowserAPI.storage.local.set(storedItems);
        } catch (error) {
            for (const [key, previous] of previousMirrors) {
                if (previous === null) {
                    localStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, previous);
                }
            }
            throw createError('写入浏览器存储失败，数据未保存', error);
        }

        window.dispatchEvent(
            new CustomEvent(STORAGE_EVENT, {
                detail: Object.fromEntries(
                    Object.entries(storedItems).map(([key, value]) => [
                        key,
                        { newValue: clone(value) },
                    ])
                ),
            })
        );
    }

    /**
     * 异步删除单个存储项
     */
    async remove(key: string): Promise<void> {
        try {
            await BrowserAPI.storage.local.remove(key);
            if (SYNC_MIRROR_KEY_SET.has(key)) {
                localStorage.removeItem(key);
            }
        } catch (error) {
            throw createError(`删除存储项 ${key} 失败`, error);
        }

        window.dispatchEvent(
            new CustomEvent(STORAGE_EVENT, {
                detail: { [key]: { newValue: undefined } },
            })
        );
    }

    /**
     * 订阅存储变更
     * 同时监听本地事件、跨标签页 storage 事件（非扩展环境）以及扩展原生 onChanged 事件。
     */
    subscribe(listener: StorageChangeListener): () => void {
        const localHandler = (event: Event) => {
            const customEvent = event as CustomEvent<StorageChanges>;
            listener(customEvent.detail || {});
        };
        window.addEventListener(STORAGE_EVENT, localHandler);

        const storageHandler = (event: StorageEvent) => {
            if (!event.key) {
                return;
            }
            listener({ [event.key]: { newValue: parseStoredValue(event.newValue) } });
        };
        if (!this.isExtension) {
            window.addEventListener('storage', storageHandler);
        }

        const onChanged = getNativeOnChanged();
        const nativeHandler: NativeChangeListener = (changes, areaName) => {
            if (areaName === 'local') {
                listener(changes);
            }
        };
        if (this.isExtension && onChanged) {
            onChanged.addListener(nativeHandler);
        }

        return () => {
            window.removeEventListener(STORAGE_EVENT, localHandler);
            window.removeEventListener('storage', storageHandler);
            if (this.isExtension && onChanged) {
                onChanged.removeListener(nativeHandler);
            }
        };
    }
}

/** 全局单例存储管理器 */
export const storageManager = new StorageManager();
