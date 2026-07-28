/**
 * 图标缓存服务
 * 使用 IndexedDB 缓存远程站点图标（favicon 等），避免每次打开新标签页都重复请求网络图标。
 *
 * - Chrome / Firefox 扩展环境与网页环境通用，仅依赖标准 IndexedDB / fetch / Blob API；
 * - 缓存有效期 7 天，过期条目在读取时自动清除；
 * - IndexedDB 不可用（如隐私模式、jsdom 测试环境）时自动降级，图标仍直接走网络加载；
 * - 网页环境下跨域 fetch 受 CORS 限制可能失败，失败时静默忽略、不影响图标显示。
 */

/** 数据库名称 */
const DB_NAME = 'mugen-icon-cache';
/** 数据库版本 */
const DB_VERSION = 1;
/** 对象仓库名称 */
const STORE_NAME = 'icons';
/** 缓存有效期：7 天（毫秒） */
export const ICON_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** IndexedDB 中存储的图标缓存条目 */
export interface IconCacheEntry {
    /** 原始图标 URL（主键） */
    url: string;
    /** 图标二进制内容 */
    blob: Blob;
    /** 缓存写入时间戳 */
    fetchedAt: number;
}

/** 将 IDBRequest 包装为 Promise */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 图标缓存服务（单例）
 * 内存中维护「原始 URL → 对象 URL」映射，同一会话内重复引用同一图标不重复访问 IndexedDB。
 */
class IconCacheService {
    private dbPromise: Promise<IDBDatabase | null> | null = null;
    /** 会话级内存缓存：原始 URL -> 对象 URL */
    private readonly memoryCache = new Map<string, string>();
    /** 进行中的读取请求，用于去重 */
    private readonly pendingReads = new Map<string, Promise<string | null>>();
    /** 是否已在本会话执行过期清理 */
    private swept = false;

    /** 当前环境是否支持 IndexedDB 缓存 */
    isAvailable(): boolean {
        return typeof indexedDB !== 'undefined';
    }

    /** 判断 URL 是否为可缓存的远程图标地址（仅 http/https） */
    isCacheableUrl(url?: string | null): boolean {
        return !!url && /^https?:\/\//i.test(url);
    }

    /**
     * 从缓存解析图标地址
     * @param url 原始图标 URL
     * @returns 命中且未过期时返回对象 URL，否则返回 null
     */
    async resolve(url: string): Promise<string | null> {
        if (!this.isCacheableUrl(url)) {
            return null;
        }
        const cached = this.memoryCache.get(url);
        if (cached) {
            return cached;
        }
        const pending = this.pendingReads.get(url);
        if (pending) {
            return pending;
        }
        const readPromise = this.resolveFromDb(url).finally(() => {
            this.pendingReads.delete(url);
        });
        this.pendingReads.set(url, readPromise);
        return readPromise;
    }

    /**
     * 抓取远程图标并写入缓存（通常在网络加载成功后后台调用）
     * 已缓存或抓取失败时静默返回。
     */
    async cache(url: string): Promise<void> {
        if (!this.isCacheableUrl(url) || this.memoryCache.has(url)) {
            return;
        }
        try {
            const response = await fetch(url, { credentials: 'omit' });
            if (!response.ok) {
                return;
            }
            const blob = await response.blob();
            if (!blob.size) {
                return;
            }
            const db = await this.openDb();
            if (!db) {
                return;
            }
            const entry: IconCacheEntry = { url, blob, fetchedAt: Date.now() };
            await requestToPromise(
                db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry)
            );
            this.memoryCache.set(url, URL.createObjectURL(blob));
        } catch {
            // 网络或跨域失败时静默忽略，图标保持直接网络加载
        }
    }

    /** 移除单个缓存条目（如缓存内容损坏时） */
    async evict(url: string): Promise<void> {
        const objectUrl = this.memoryCache.get(url);
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            this.memoryCache.delete(url);
        }
        const db = await this.openDb();
        if (!db) {
            return;
        }
        try {
            await requestToPromise(
                db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(url)
            );
        } catch {
            // 删除失败不影响使用
        }
    }

    /** 清空全部图标缓存 */
    async clear(): Promise<void> {
        for (const objectUrl of this.memoryCache.values()) {
            URL.revokeObjectURL(objectUrl);
        }
        this.memoryCache.clear();
        const db = await this.openDb();
        if (!db) {
            return;
        }
        try {
            await requestToPromise(
                db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear()
            );
        } catch {
            // 清空失败不影响使用
        }
    }

    /** 仅供测试：重置数据库连接与内存状态 */
    resetForTests(): void {
        for (const objectUrl of this.memoryCache.values()) {
            URL.revokeObjectURL(objectUrl);
        }
        this.memoryCache.clear();
        this.pendingReads.clear();
        this.swept = false;
        if (this.dbPromise) {
            this.dbPromise.then(db => db?.close()).catch(() => undefined);
            this.dbPromise = null;
        }
    }

    /** 打开数据库（IndexedDB 不可用时返回 null），并在首次打开时清理过期条目 */
    private openDb(): Promise<IDBDatabase | null> {
        if (!this.isAvailable()) {
            return Promise.resolve(null);
        }
        if (!this.dbPromise) {
            this.dbPromise = new Promise<IDBDatabase | null>(resolve => {
                try {
                    const request = indexedDB.open(DB_NAME, DB_VERSION);
                    request.onupgradeneeded = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                        }
                    };
                    request.onsuccess = () => {
                        const db = request.result;
                        // 数据库被其他上下文升级时关闭连接，下次重新打开
                        db.onversionchange = () => {
                            db.close();
                            this.dbPromise = null;
                        };
                        resolve(db);
                    };
                    request.onerror = () => resolve(null);
                    request.onblocked = () => resolve(null);
                } catch {
                    resolve(null);
                }
            });
            this.dbPromise.then(db => {
                if (db) {
                    this.sweepExpired(db);
                }
            });
        }
        return this.dbPromise;
    }

    /** 从 IndexedDB 读取缓存条目 */
    private async resolveFromDb(url: string): Promise<string | null> {
        const db = await this.openDb();
        if (!db) {
            return null;
        }
        try {
            const entry = await requestToPromise<IconCacheEntry | undefined>(
                db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(url) as IDBRequest<IconCacheEntry | undefined>
            );
            if (!entry) {
                return null;
            }
            if (Date.now() - entry.fetchedAt > ICON_CACHE_TTL_MS) {
                // 已过期：清除并回退到网络加载
                await this.evict(url);
                return null;
            }
            const objectUrl = URL.createObjectURL(entry.blob);
            this.memoryCache.set(url, objectUrl);
            return objectUrl;
        } catch {
            return null;
        }
    }

    /** 每个会话执行一次的过期条目清理 */
    private sweepExpired(db: IDBDatabase): void {
        if (this.swept) {
            return;
        }
        this.swept = true;
        try {
            const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
            const now = Date.now();
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    return;
                }
                const entry = cursor.value as IconCacheEntry;
                if (now - entry.fetchedAt > ICON_CACHE_TTL_MS) {
                    cursor.delete();
                }
                cursor.continue();
            };
        } catch {
            // 清理失败不影响使用
        }
    }
}

/** 图标缓存服务单例 */
export const iconCacheService = new IconCacheService();
