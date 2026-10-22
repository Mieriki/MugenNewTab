/**
 * chrome.storage.sync 封装（跨设备同步区）
 *
 * 与 storage.service 的本地存储相互独立：
 *   - 扩展环境：走浏览器账号同步区 storage.sync，登录同一账号的其他设备可见；
 *   - 非扩展环境（网页版调试）：降级为 localStorage 加前缀模拟，仅本机可见。
 *
 * 注意：storage.sync 有配额限制（单条 8KB / 总计约 100KB），只适合存放加密后的短凭据。
 * 因此这里把「是否真的走了原生同步区」暴露给上层（getSyncAreaStatus），
 * 避免网页预览环境下用户以为凭据已经同步到浏览器账号，实际只写进了本机 localStorage。
 */

/** 非扩展环境的 localStorage 前缀 */
const LOCAL_PREFIX = '__mnt_sync__:';

interface SyncChangeListener {
    (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string): void;
}

interface SyncAreaLike {
    get: (...args: unknown[]) => unknown;
    set: (...args: unknown[]) => unknown;
    remove: (...args: unknown[]) => unknown;
}

interface SyncStorageNamespace {
    sync?: SyncAreaLike;
    onChanged?: {
        addListener: (listener: SyncChangeListener) => void;
        removeListener: (listener: SyncChangeListener) => void;
    };
}

interface WindowWithSyncStorage {
    chrome?: {
        storage?: SyncStorageNamespace;
        runtime?: { lastError?: { message?: string } };
    };
    browser?: { storage?: SyncStorageNamespace };
    localStorage?: Storage;
}

/** 同步区形态：native = 浏览器账号同步区；local = localStorage 降级 */
export type SyncAreaKind = 'native' | 'local';

/** 同步区状态 */
export interface SyncAreaStatus {
    /** 是否使用浏览器原生同步区 */
    native: boolean;
    /** 形态标识，便于 UI 展示提示 */
    kind: SyncAreaKind;
}

function getWindow(): WindowWithSyncStorage | null {
    return typeof window === 'undefined' ? null : (window as unknown as WindowWithSyncStorage);
}

/** 取原生 storage.sync 对象，不存在时返回 null */
function getNativeSyncArea(): SyncAreaLike | null {
    const win = getWindow();
    return win?.browser?.storage?.sync ?? win?.chrome?.storage?.sync ?? null;
}

/** Firefox 的 browser.* 直接返回 Promise，chrome.* 需要回调 */
function isPromiseStyle(): boolean {
    return !!getWindow()?.browser?.storage?.sync;
}

/** 是否使用浏览器原生同步区（否则是 localStorage 降级） */
export function isNativeSyncStorage(): boolean {
    return getNativeSyncArea() !== null;
}

/** 当前同步区状态（UI 用于提示「仅在扩展中生效」） */
export function getSyncAreaStatus(): SyncAreaStatus {
    const native = isNativeSyncStorage();
    return { native, kind: native ? 'native' : 'local' };
}

function localKey(key: string): string {
    return `${LOCAL_PREFIX}${key}`;
}

/** 把底层错误翻译成用户能看懂的中文提示 */
function toSyncError(error: unknown, fallback: string): Error {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/QUOTA_BYTES_PER_ITEM/i.test(message)) {
        return new Error('浏览器同步区单条数据超限，无法写入同步凭据');
    }
    if (/QUOTA_BYTES|quota/i.test(message)) {
        return new Error('浏览器同步区空间已满，请清理后重试');
    }
    if (/MAX_WRITE_OPERATIONS/i.test(message)) {
        return new Error('浏览器同步写入过于频繁，请稍后再试');
    }
    return new Error(message || fallback);
}

/** 读取单个同步项 */
export async function syncGet(key: string): Promise<unknown | null> {
    const area = getNativeSyncArea();
    if (!area) {
        const raw = getWindow()?.localStorage?.getItem(localKey(key)) ?? null;
        if (raw === null) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }

    if (isPromiseStyle()) {
        const items = (await (area.get as (keys: string) => Promise<Record<string, unknown>>)(key)) ?? {};
        return items[key] ?? null;
    }

    return new Promise((resolve, reject) => {
        (area.get as (keys: string, cb: (items: Record<string, unknown>) => void) => void)(
            key,
            (items) => {
                const lastError = getWindow()?.chrome?.runtime?.lastError;
                if (lastError) {
                    reject(toSyncError(new Error(lastError.message || ''), '读取浏览器同步区失败'));
                    return;
                }
                resolve(items?.[key] ?? null);
            }
        );
    });
}

/** 写入单个同步项 */
export async function syncSet(key: string, value: unknown): Promise<void> {
    const area = getNativeSyncArea();
    if (!area) {
        try {
            getWindow()?.localStorage?.setItem(localKey(key), JSON.stringify(value));
        } catch (error) {
            throw toSyncError(error, '写入本机模拟同步区失败');
        }
        return;
    }

    if (isPromiseStyle()) {
        try {
            await (area.set as (items: Record<string, unknown>) => Promise<void>)({ [key]: value });
        } catch (error) {
            throw toSyncError(error, '写入浏览器同步区失败');
        }
        return;
    }

    await new Promise<void>((resolve, reject) => {
        (area.set as (items: Record<string, unknown>, cb: () => void) => void)(
            { [key]: value },
            () => {
                const lastError = getWindow()?.chrome?.runtime?.lastError;
                if (lastError) {
                    reject(toSyncError(new Error(lastError.message || ''), '写入浏览器同步区失败'));
                    return;
                }
                resolve();
            }
        );
    });
}

/** 删除单个同步项 */
export async function syncRemove(key: string): Promise<void> {
    const area = getNativeSyncArea();
    if (!area) {
        getWindow()?.localStorage?.removeItem(localKey(key));
        return;
    }

    if (isPromiseStyle()) {
        try {
            await (area.remove as (keys: string) => Promise<void>)(key);
        } catch (error) {
            throw toSyncError(error, '清理浏览器同步区失败');
        }
        return;
    }

    await new Promise<void>((resolve, reject) => {
        (area.remove as (keys: string, cb: () => void) => void)(key, () => {
            const lastError = getWindow()?.chrome?.runtime?.lastError;
            if (lastError) {
                reject(toSyncError(new Error(lastError.message || ''), '清理浏览器同步区失败'));
                return;
            }
            resolve();
        });
    });
}

/**
 * 订阅同步区变更
 *
 * 其他设备推送凭据后，本机可在不重开面板的情况下感知到（areaName === 'sync'）。
 * 非扩展环境没有原生同步区，直接返回空的取消函数。
 */
export function subscribeSyncAreaChanges(
    listener: (changes: Record<string, { newValue?: unknown }>) => void
): () => void {
    const win = getWindow();
    const onChanged = win?.browser?.storage?.onChanged ?? win?.chrome?.storage?.onChanged;
    if (!onChanged || !isNativeSyncStorage()) {
        return () => {};
    }

    const handler: SyncChangeListener = (changes, areaName) => {
        if (areaName !== 'sync') return;
        listener(changes);
    };

    onChanged.addListener(handler);
    return () => {
        try {
            onChanged.removeListener(handler);
        } catch {
            // 扩展卸载 / 上下文失效时忽略
        }
    };
}
