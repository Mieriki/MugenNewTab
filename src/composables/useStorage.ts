/**
 * useStorage
 * 对 StorageManager 的响应式封装。
 *
 * 提供以 ref 形式自动同步的存储状态，支持异步读写、同步读（syncGet）、
 * 同步写（syncSet，状态立即更新，写入仍为异步），并自动监听 Storage 变更事件。
 */

import {
    ref,
    onMounted,
    onUnmounted,
    getCurrentInstance,
    type Ref,
} from 'vue';
import { storageManager } from '@/services/storage.service';
import type { StorageChanges, StorageValue } from '@/types/storage';

/** 存储值序列化器 */
export interface StorageSerializer<T> {
    /** 从 StorageValue 读取为业务类型 */
    read: (raw: StorageValue) => T;
    /** 将业务类型写入为 StorageValue */
    write: (value: T) => StorageValue;
}

/** useStorage 配置项 */
export interface UseStorageOptions<T> {
    /** 存储键名 */
    key: string;
    /** 无存储值时的默认值 */
    defaultValue?: T;
    /** 是否在初始化时立即从 Storage 加载，默认 true */
    immediate?: boolean;
    /** 自定义序列化器，默认恒等序列化 */
    serializer?: StorageSerializer<T>;
}

/** useStorage 返回值 */
export interface UseStorageReturn<T> {
    /** 响应式存储值 */
    value: Ref<T>;
    /** 是否正在加载 */
    isLoading: Ref<boolean>;
    /** 最近一次错误 */
    error: Ref<Error | null>;
    /** 异步读取最新值 */
    get: () => Promise<T>;
    /** 异步设置新值 */
    set: (value: T) => Promise<void>;
    /** 同步读取当前存储值（优先 localStorage 同步镜像） */
    syncGet: () => T;
    /** 同步更新响应式状态并异步持久化 */
    syncSet: (value: T) => Promise<void>;
    /** 删除存储项并恢复默认值 */
    remove: () => Promise<void>;
    /** 刷新：重新从 Storage 加载 */
    refresh: () => Promise<T>;
    /** 清理副作用（取消 Storage 订阅） */
    cleanup: () => void;
}

/** 深比较（仅用于判断是否更新 ref，避免循环触发） */
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
        return false;
    }
}

/**
 * 创建响应式 Storage 封装
 */
export function useStorage<T = StorageValue>(
    options: UseStorageOptions<T>
): UseStorageReturn<T> {
    const {
        key,
        defaultValue,
        immediate = true,
        serializer = {
            read: (raw: StorageValue) => raw as T,
            write: (value: T) => value as StorageValue,
        },
    } = options;

    const value = ref(defaultValue) as Ref<T>;
    const isLoading = ref(false);
    const error = ref<Error | null>(null);

    let unsubscribe: (() => void) | null = null;

    function parse(raw: StorageValue | undefined | null): T {
        if (raw === undefined || raw === null) {
            return defaultValue as T;
        }
        return serializer.read(raw);
    }

    async function load(): Promise<T> {
        isLoading.value = true;
        error.value = null;
        try {
            const raw = await storageManager.get(key);
            const next = parse(raw);
            value.value = next;
            return next;
        } catch (err) {
            error.value = err instanceof Error ? err : new Error(String(err));
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    async function set(next: T): Promise<void> {
        error.value = null;
        const previous = value.value as T;
        value.value = next;
        try {
            await storageManager.set(key, serializer.write(next));
        } catch (err) {
            value.value = previous;
            error.value = err instanceof Error ? err : new Error(String(err));
            throw err;
        }
    }

    function syncGet(): T {
        return parse(storageManager.getSync(key));
    }

    async function syncSet(next: T): Promise<void> {
        return set(next);
    }

    async function remove(): Promise<void> {
        error.value = null;
        const previous = value.value as T;
        value.value = defaultValue as T;
        try {
            await storageManager.remove(key);
        } catch (err) {
            value.value = previous;
            error.value = err instanceof Error ? err : new Error(String(err));
            throw err;
        }
    }

    function handleChanges(changes: StorageChanges): void {
        const change = changes[key];
        if (!change) return;
        if (!('newValue' in change)) return;

        const next = parse(change.newValue);
        if (!deepEqual(value.value, next)) {
            value.value = next;
        }
    }

    function cleanup(): void {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    }

    if (typeof window !== 'undefined') {
        unsubscribe = storageManager.subscribe(handleChanges);

        const instance = getCurrentInstance();
        if (instance) {
            onMounted(() => {
                if (immediate) {
                    load().catch(() => {});
                }
            });
            onUnmounted(cleanup);
        } else if (immediate) {
            load().catch(() => {});
        }
    }

    return {
        value,
        isLoading,
        error,
        get: load,
        set,
        syncGet,
        syncSet,
        remove,
        refresh: load,
        cleanup,
    };
}
