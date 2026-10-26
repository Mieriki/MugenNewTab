/**
 * 媒体缓存服务（IndexedDB）
 *
 * 缓存两类远程资源，避免每次打开新标签页都重新走网络：
 *   - icon：站点 favicon / 远程图片图标（默认 7 天）
 *   - wallpaper：网络壁纸（默认 30 天）
 *
 * 设计要点：
 * - 只缓存 http(s) 地址；data:、本地相对路径、内联 SVG 不参与（它们本来就不走网络）；
 * - 开关关闭时 resolve() 直接返回 null、cache() 直接返回，界面回退到网络加载，
 *   但**不会**删除已有缓存——用户重新打开开关即可继续命中；
 * - IndexedDB 不可用（隐私模式、jsdom 测试环境）时整体降级，调用方无感；
 * - 网页环境下跨域 fetch 可能被 CORS 拦截，失败时静默忽略，图标仍能直接网络加载；
 * - 同一 URL 的并发读取会去重，避免首屏几十个图标同时打 IndexedDB。
 */

import { STORAGE_KEYS } from '@/types/storage';

/** 数据库名称 */
const DB_NAME = 'mugen-media-cache';
/** 数据库版本 */
const DB_VERSION = 1;
/** 对象仓库名称 */
const STORE_NAME = 'entries';
/** 旧版本（仅图标缓存）使用的数据库名，打开新库时顺手清掉，回收空间 */
const LEGACY_DB_NAME = 'mugen-icon-cache';

/** 图标缓存有效期：7 天（毫秒） */
export const ICON_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 壁纸缓存有效期：30 天（毫秒）。壁纸体积大、变化慢，没必要频繁重下 */
export const WALLPAPER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 缓存资源类型 */
export type MediaCacheKind = 'icon' | 'wallpaper';

/** 各类型的缓存有效期 */
const TTL_BY_KIND: Record<MediaCacheKind, number> = {
    icon: ICON_CACHE_TTL_MS,
    wallpaper: WALLPAPER_CACHE_TTL_MS
};

/** 默认缓存类型（兼容旧调用方） */
const DEFAULT_KIND: MediaCacheKind = 'icon';

/**
 * 从 localStorage 镜像同步读取开关
 *
 * 开关值同时写进 STORAGE_KEYS.MEDIA_CACHE 镜像，这里在服务构造时同步读一次：
 * 否则用户关闭缓存后，要等打开个性化面板（cache store 初始化）才生效，
 * 中间这段时间图标和壁纸仍会被缓存。
 */
function readEnabledFromMirror(): boolean {
    try {
        if (typeof localStorage === 'undefined') {
            return true;
        }
        const raw = localStorage.getItem(STORAGE_KEYS.MEDIA_CACHE);
        if (!raw) {
            return true;
        }
        const parsed = JSON.parse(raw) as { enabled?: unknown };
        return typeof parsed?.enabled === 'boolean' ? parsed.enabled : true;
    } catch {
        return true;
    }
}

/** IndexedDB 中存储的缓存条目 */
export interface MediaCacheEntry {
    /** 原始资源 URL（主键） */
    url: string;
    /** 二进制内容 */
    blob: Blob;
    /** 缓存写入时间戳 */
    fetchedAt: number;
    /** 资源类型；旧版本写入的条目没有该字段，读取时按 icon 处理 */
    kind?: MediaCacheKind;
    /** 内容字节数（旧条目缺失时回退 blob.size） */
    bytes?: number;
}

/** 缓存用量统计 */
export interface MediaCacheStats {
    /** 条目总数 */
    count: number;
    /** 总字节数 */
    bytes: number;
    /** 各类型条目数 */
    byKind: Record<MediaCacheKind, number>;
}

/** 将 IDBRequest 包装为 Promise */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** 取条目的实际类型（旧数据没有 kind 字段） */
function entryKind(entry: MediaCacheEntry): MediaCacheKind {
    return entry.kind === 'wallpaper' ? 'wallpaper' : DEFAULT_KIND;
}

/** 取条目的字节数（旧数据没有 bytes 字段） */
function entryBytes(entry: MediaCacheEntry): number {
    return typeof entry.bytes === 'number' ? entry.bytes : entry.blob?.size ?? 0;
}

/** 判断条目是否过期 */
function isExpired(entry: MediaCacheEntry, now: number): boolean {
    return now - entry.fetchedAt > TTL_BY_KIND[entryKind(entry)];
}

/**
 * 媒体缓存服务（单例）
 * 内存中维护「原始 URL → 对象 URL」映射，同一会话内重复引用同一资源不重复访问 IndexedDB。
 */
class MediaCacheService {
    private dbPromise: Promise<IDBDatabase | null> | null = null;
    /** 会话级内存缓存：原始 URL -> 对象 URL */
    private readonly memoryCache = new Map<string, string>();
    /** 进行中的读取请求，用于去重 */
    private readonly pendingReads = new Map<string, Promise<string | null>>();
    /** 本会话抓取失败过的 URL，避免每次渲染都重试一次注定失败的请求 */
    private readonly failedUrls = new Set<string>();
    /** 是否已在本会话执行过期清理 */
    private swept = false;
    /** 开关：关闭后既不读缓存也不写缓存 */
    private enabled = readEnabledFromMirror();

    /** 当前环境是否支持 IndexedDB 缓存 */
    isAvailable(): boolean {
        return typeof indexedDB !== 'undefined';
    }

    /** 缓存开关是否开启 */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * 设置缓存开关。
     * 关闭时不清理已有缓存，只是不再读写，用户重新打开可立即复用。
     */
    setEnabled(value: boolean): void {
        this.enabled = value;
    }

    /** 判断 URL 是否为可缓存的远程地址（仅 http/https） */
    isCacheableUrl(url?: string | null): boolean {
        return !!url && /^https?:\/\//i.test(url);
    }

    /**
     * 从缓存解析资源地址
     * @param url 原始资源 URL
     * @returns 命中且未过期时返回对象 URL，否则返回 null
     */
    async resolve(url: string): Promise<string | null> {
        if (!this.enabled || !this.isCacheableUrl(url)) {
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
     * 抓取远程资源并写入缓存（通常在网络加载成功后后台调用）
     * 已缓存、已失败过或抓取失败时静默返回。
     */
    async cache(url: string, kind: MediaCacheKind = DEFAULT_KIND): Promise<void> {
        await this.fetchAndCache(url, kind);
    }

    /**
     * 抓取并缓存，返回可直接渲染的对象地址
     *
     * 和「先让 <img> 走网络、加载成功再 cache()」相比，这里只发一次请求：
     * 抓到了就直接用 blob: 地址渲染，抓不到（跨域被拦等）返回 null，
     * 由调用方回退到原始网络地址，图标/壁纸仍能正常显示。
     *
     * @returns 命中缓存或抓取成功时返回对象地址，否则返回 null
     */
    async fetchAndCache(url: string, kind: MediaCacheKind = DEFAULT_KIND): Promise<string | null> {
        if (!this.enabled || !this.isCacheableUrl(url)) {
            return null;
        }
        const inMemory = this.memoryCache.get(url);
        if (inMemory) {
            return inMemory;
        }
        if (this.failedUrls.has(url)) {
            return null;
        }
        try {
            const response = await fetch(url, { credentials: 'omit' });
            if (!response.ok) {
                this.failedUrls.add(url);
                return null;
            }
            const blob = await response.blob();
            if (!blob.size) {
                this.failedUrls.add(url);
                return null;
            }
            const objectUrl = URL.createObjectURL(blob);
            this.memoryCache.set(url, objectUrl);

            const db = await this.openDb();
            if (db) {
                const entry: MediaCacheEntry = {
                    url,
                    blob,
                    fetchedAt: Date.now(),
                    kind,
                    bytes: blob.size
                };
                await requestToPromise(
                    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry)
                );
            }
            // 即使 IndexedDB 写失败（配额满等），本次会话内仍可用对象地址
            return objectUrl;
        } catch {
            // 网络或跨域失败时记下来，本会话不再重试；资源继续走网络加载
            this.failedUrls.add(url);
            return null;
        }
    }

    /** 移除单个缓存条目（如缓存内容损坏时） */
    async evict(url: string): Promise<void> {
        const objectUrl = this.memoryCache.get(url);
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            this.memoryCache.delete(url);
        }
        this.failedUrls.delete(url);
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

    /** 清空全部缓存 */
    async clear(): Promise<void> {
        for (const objectUrl of this.memoryCache.values()) {
            URL.revokeObjectURL(objectUrl);
        }
        this.memoryCache.clear();
        this.failedUrls.clear();
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

    /** 统计缓存用量（供设置面板展示） */
    async stats(): Promise<MediaCacheStats> {
        const empty: MediaCacheStats = { count: 0, bytes: 0, byKind: { icon: 0, wallpaper: 0 } };
        const db = await this.openDb();
        if (!db) {
            return empty;
        }
        try {
            return await new Promise<MediaCacheStats>((resolve) => {
                const result: MediaCacheStats = { count: 0, bytes: 0, byKind: { icon: 0, wallpaper: 0 } };
                const request = db
                    .transaction(STORE_NAME, 'readonly')
                    .objectStore(STORE_NAME)
                    .openCursor();
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) {
                        resolve(result);
                        return;
                    }
                    const entry = cursor.value as MediaCacheEntry;
                    result.count += 1;
                    result.bytes += entryBytes(entry);
                    result.byKind[entryKind(entry)] += 1;
                    cursor.continue();
                };
                request.onerror = () => resolve(empty);
            });
        } catch {
            return empty;
        }
    }

    /** 仅供测试：重置数据库连接与内存状态 */
    resetForTests(): void {
        for (const objectUrl of this.memoryCache.values()) {
            URL.revokeObjectURL(objectUrl);
        }
        this.memoryCache.clear();
        this.pendingReads.clear();
        this.failedUrls.clear();
        this.swept = false;
        this.enabled = true;
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
                    this.dropLegacyDb();
                }
            });
        }
        return this.dbPromise;
    }

    /** 尽力删除旧版本遗留的纯图标缓存库（失败无副作用） */
    private dropLegacyDb(): void {
        try {
            if (typeof indexedDB.deleteDatabase !== 'function') {
                return;
            }
            const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
            request.onerror = () => undefined;
        } catch {
            // 忽略：旧库删不掉只是占一点空间
        }
    }

    /** 从 IndexedDB 读取缓存条目 */
    private async resolveFromDb(url: string): Promise<string | null> {
        const db = await this.openDb();
        if (!db) {
            return null;
        }
        try {
            const entry = await requestToPromise<MediaCacheEntry | undefined>(
                db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(url) as IDBRequest<MediaCacheEntry | undefined>
            );
            if (!entry) {
                return null;
            }
            if (isExpired(entry, Date.now())) {
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
                const entry = cursor.value as MediaCacheEntry;
                if (isExpired(entry, now)) {
                    cursor.delete();
                }
                cursor.continue();
            };
        } catch {
            // 清理失败不影响使用
        }
    }
}

/** 媒体缓存服务单例 */
export const mediaCacheService = new MediaCacheService();

/** 测试用：拿到一个新的独立实例 */
export function createMediaCacheService(): MediaCacheService {
    return new MediaCacheService();
}
