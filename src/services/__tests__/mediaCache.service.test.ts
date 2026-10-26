/**
 * 媒体缓存服务单元测试
 * 使用 fake-indexeddb 模拟 IndexedDB，覆盖图标/壁纸缓存读写、按类型过期、
 * 开关关闭、用量统计与降级行为。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    mediaCacheService,
    ICON_CACHE_TTL_MS,
    WALLPAPER_CACHE_TTL_MS,
} from '@/services/mediaCache.service';

const ICON_URL = 'https://example.com/favicon.ico';
const ICON_URL_B = 'https://other.com/icon.png';
const WALLPAPER_URL = 'https://images.example.com/wide.jpg';

const DB_NAME = 'mugen-media-cache';
const STORE_NAME = 'entries';

/** 构造一个带内容的图片 Blob */
function makeBlob(content = 'icon-bytes'): Blob {
    return new Blob([content], { type: 'image/png' });
}

/** 直接绕过网络，向缓存写入一条记录 */
async function seedCache(
    url: string,
    blob: Blob,
    fetchedAt: number,
    kind?: 'icon' | 'wallpaper'
): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'url' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ url, blob, fetchedAt, kind, bytes: blob.size });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

/** 统一的 fetch mock：返回一个非空 Blob */
function mockFetchOk() {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(makeBlob()),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('mediaCacheService', () => {
    beforeEach(() => {
        vi.stubGlobal('indexedDB', new IDBFactory());
        // jsdom 未实现 createObjectURL / revokeObjectURL，直接挂载 mock 方法
        (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`);
        (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
        mediaCacheService.resetForTests();
    });

    afterEach(() => {
        mediaCacheService.resetForTests();
        delete (URL as unknown as Record<string, unknown>).createObjectURL;
        delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('仅 http/https 地址可缓存', () => {
        expect(mediaCacheService.isCacheableUrl(ICON_URL)).toBe(true);
        expect(mediaCacheService.isCacheableUrl('http://a.com/x.png')).toBe(true);
        expect(mediaCacheService.isCacheableUrl('/image/icons/home.svg')).toBe(false);
        expect(mediaCacheService.isCacheableUrl('data:image/svg+xml,xxx')).toBe(false);
        expect(mediaCacheService.isCacheableUrl('')).toBe(false);
        expect(mediaCacheService.isCacheableUrl(undefined)).toBe(false);
    });

    it('缓存未命中时 resolve 返回 null', async () => {
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('cache 抓取资源并写入 IndexedDB，resolve 返回对象地址', async () => {
        const fetchMock = mockFetchOk();

        await mediaCacheService.cache(ICON_URL);
        expect(fetchMock).toHaveBeenCalledWith(ICON_URL, { credentials: 'omit' });

        // 清空内存缓存（保留 IndexedDB 数据），验证从 IndexedDB 读取的路径
        mediaCacheService.resetForTests();
        const objectUrl = await mediaCacheService.resolve(ICON_URL);
        expect(objectUrl).toMatch(/^blob:mock-/);
    });

    it('已缓存的资源不会重复抓取', async () => {
        const fetchMock = mockFetchOk();

        await mediaCacheService.cache(ICON_URL);
        await mediaCacheService.cache(ICON_URL);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('网络失败时静默忽略，且同一会话不再重试', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('CORS'));
        vi.stubGlobal('fetch', fetchMock);

        await mediaCacheService.cache(ICON_URL);
        await mediaCacheService.cache(ICON_URL);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('响应异常或空内容时不写入缓存', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, blob: () => Promise.resolve(makeBlob()) }));
        await mediaCacheService.cache(ICON_URL);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob([])) }));
        await mediaCacheService.cache(ICON_URL_B);

        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
        expect(await mediaCacheService.resolve(ICON_URL_B)).toBeNull();
    });

    it('图标过期（7 天）在读取时被清除', async () => {
        const expiredAt = Date.now() - ICON_CACHE_TTL_MS - 1000;
        await seedCache(ICON_URL, makeBlob(), expiredAt, 'icon');

        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();

        mockFetchOk();
        await mediaCacheService.cache(ICON_URL);
        expect(await mediaCacheService.resolve(ICON_URL)).not.toBeNull();
    });

    it('壁纸的有效期比图标长：8 天前的壁纸仍然命中', async () => {
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
        await seedCache(WALLPAPER_URL, makeBlob('wallpaper-bytes'), eightDaysAgo, 'wallpaper');

        expect(await mediaCacheService.resolve(WALLPAPER_URL)).not.toBeNull();
    });

    it('壁纸超过 30 天后过期', async () => {
        const tooOld = Date.now() - WALLPAPER_CACHE_TTL_MS - 1000;
        await seedCache(WALLPAPER_URL, makeBlob('wallpaper-bytes'), tooOld, 'wallpaper');

        expect(await mediaCacheService.resolve(WALLPAPER_URL)).toBeNull();
    });

    it('旧版本写入的条目没有 kind 字段，按图标处理', async () => {
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
        await seedCache(ICON_URL, makeBlob(), eightDaysAgo);

        // 没有 kind 时按 icon 的 7 天 TTL 判定，8 天前即过期
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('开关关闭后不读缓存也不写缓存', async () => {
        const fetchMock = mockFetchOk();
        await mediaCacheService.cache(ICON_URL);
        expect(await mediaCacheService.resolve(ICON_URL)).not.toBeNull();

        mediaCacheService.setEnabled(false);
        expect(mediaCacheService.isEnabled()).toBe(false);
        // 关闭后即使内存里有对象地址也不返回，让界面走网络
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();

        fetchMock.mockClear();
        await mediaCacheService.cache(ICON_URL_B);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('重新打开开关后已有缓存仍可命中（关闭不清数据）', async () => {
        mockFetchOk();
        await mediaCacheService.cache(ICON_URL);

        mediaCacheService.setEnabled(false);
        mediaCacheService.setEnabled(true);

        expect(await mediaCacheService.resolve(ICON_URL)).not.toBeNull();
    });

    it('evict 移除单个缓存条目', async () => {
        mockFetchOk();
        await mediaCacheService.cache(ICON_URL);
        expect(await mediaCacheService.resolve(ICON_URL)).not.toBeNull();

        await mediaCacheService.evict(ICON_URL);
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('clear 清空全部缓存', async () => {
        mockFetchOk();
        await mediaCacheService.cache(ICON_URL);
        await mediaCacheService.cache(ICON_URL_B);

        await mediaCacheService.clear();
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
        expect(await mediaCacheService.resolve(ICON_URL_B)).toBeNull();
    });

    it('stats 统计条目数、字节数与类型分布', async () => {
        await seedCache(ICON_URL, makeBlob('12345'), Date.now(), 'icon');
        await seedCache(WALLPAPER_URL, makeBlob('1234567890'), Date.now(), 'wallpaper');

        const stats = await mediaCacheService.stats();

        expect(stats.count).toBe(2);
        expect(stats.bytes).toBe(15);
        expect(stats.byKind).toEqual({ icon: 1, wallpaper: 1 });
    });

    it('IndexedDB 不可用时降级：不落盘，但本次会话仍可用对象地址', async () => {
        vi.stubGlobal('indexedDB', undefined);
        mediaCacheService.resetForTests();

        expect(mediaCacheService.isAvailable()).toBe(false);
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
        expect(await mediaCacheService.stats()).toEqual({ count: 0, bytes: 0, byKind: { icon: 0, wallpaper: 0 } });

        const fetchMock = mockFetchOk();
        const objectUrl = await mediaCacheService.fetchAndCache(ICON_URL);
        expect(fetchMock).toHaveBeenCalled();
        expect(objectUrl).toMatch(/^blob:/);

        // 内存被清掉（相当于重开页面）后就没了，说明确实没有落盘
        mediaCacheService.resetForTests();
        expect(await mediaCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('同一会话内 resolve 命中内存缓存，不重复读取 IndexedDB', async () => {
        mockFetchOk();
        await mediaCacheService.cache(ICON_URL);

        const first = await mediaCacheService.resolve(ICON_URL);
        const second = await mediaCacheService.resolve(ICON_URL);
        expect(first).toBe(second);
        // 内存命中，createObjectURL 只在 cache 写入时调用一次
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });
});
