/**
 * 图标缓存服务单元测试
 * 使用 fake-indexeddb 模拟 IndexedDB，覆盖缓存读写、过期清理、降级行为。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { iconCacheService, ICON_CACHE_TTL_MS } from '@/services/iconCache.service';

const ICON_URL = 'https://example.com/favicon.ico';
const ICON_URL_B = 'https://other.com/icon.png';

/** 构造一个带内容的图片 Blob */
function makeBlob(content = 'icon-bytes'): Blob {
    return new Blob([content], { type: 'image/png' });
}

/** 直接绕过网络，向缓存写入一条记录 */
async function seedCache(url: string, blob: Blob, fetchedAt: number): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('mugen-icon-cache', 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('icons')) {
                database.createObjectStore('icons', { keyPath: 'url' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('icons', 'readwrite');
        tx.objectStore('icons').put({ url, blob, fetchedAt });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

describe('iconCacheService', () => {
    beforeEach(() => {
        vi.stubGlobal('indexedDB', new IDBFactory());
        // jsdom 未实现 createObjectURL / revokeObjectURL，直接挂载 mock 方法
        (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`);
        (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
        iconCacheService.resetForTests();
    });

    afterEach(() => {
        iconCacheService.resetForTests();
        delete (URL as unknown as Record<string, unknown>).createObjectURL;
        delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('仅 http/https 地址可缓存', () => {
        expect(iconCacheService.isCacheableUrl(ICON_URL)).toBe(true);
        expect(iconCacheService.isCacheableUrl('http://a.com/x.png')).toBe(true);
        expect(iconCacheService.isCacheableUrl('/image/icons/home.svg')).toBe(false);
        expect(iconCacheService.isCacheableUrl('data:image/svg+xml,xxx')).toBe(false);
        expect(iconCacheService.isCacheableUrl('')).toBe(false);
        expect(iconCacheService.isCacheableUrl(undefined)).toBe(false);
    });

    it('缓存未命中时 resolve 返回 null', async () => {
        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('cache 抓取图标并写入 IndexedDB，resolve 返回对象地址', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(makeBlob()),
        });
        vi.stubGlobal('fetch', fetchMock);

        await iconCacheService.cache(ICON_URL);
        expect(fetchMock).toHaveBeenCalledWith(ICON_URL, { credentials: 'omit' });

        // 清空内存缓存（保留 IndexedDB 数据），验证从 IndexedDB 读取的路径
        iconCacheService.resetForTests();
        const objectUrl = await iconCacheService.resolve(ICON_URL);
        expect(objectUrl).toMatch(/^blob:mock-/);
    });

    it('已缓存的图标不会重复抓取', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(makeBlob()),
        });
        vi.stubGlobal('fetch', fetchMock);

        await iconCacheService.cache(ICON_URL);
        await iconCacheService.cache(ICON_URL);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('网络失败时静默忽略，不影响后续 resolve', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        await iconCacheService.cache(ICON_URL);
        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('响应异常或空内容时不写入缓存', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, blob: () => Promise.resolve(makeBlob()) }));
        await iconCacheService.cache(ICON_URL);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob([])) }));
        await iconCacheService.cache(ICON_URL_B);

        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();
        expect(await iconCacheService.resolve(ICON_URL_B)).toBeNull();
    });

    it('过期条目在读取时被清除并返回 null', async () => {
        const expiredAt = Date.now() - ICON_CACHE_TTL_MS - 1000;
        await seedCache(ICON_URL, makeBlob(), expiredAt);

        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();
        // 过期条目已被移除，重新抓取后应可正常缓存
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(makeBlob()),
        }));
        await iconCacheService.cache(ICON_URL);
        expect(await iconCacheService.resolve(ICON_URL)).not.toBeNull();
    });

    it('evict 移除单个缓存条目', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(makeBlob()),
        }));
        await iconCacheService.cache(ICON_URL);
        expect(await iconCacheService.resolve(ICON_URL)).not.toBeNull();

        await iconCacheService.evict(ICON_URL);
        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('clear 清空全部缓存', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(makeBlob()),
        }));
        await iconCacheService.cache(ICON_URL);
        await iconCacheService.cache(ICON_URL_B);

        await iconCacheService.clear();
        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();
        expect(await iconCacheService.resolve(ICON_URL_B)).toBeNull();
    });

    it('IndexedDB 不可用时降级：resolve 返回 null，cache 静默跳过', async () => {
        vi.stubGlobal('indexedDB', undefined);
        iconCacheService.resetForTests();

        expect(iconCacheService.isAvailable()).toBe(false);
        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(makeBlob()),
        });
        vi.stubGlobal('fetch', fetchMock);
        await iconCacheService.cache(ICON_URL);
        expect(await iconCacheService.resolve(ICON_URL)).toBeNull();
    });

    it('同一会话内 resolve 命中内存缓存，不重复读取 IndexedDB', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(makeBlob()),
        }));
        await iconCacheService.cache(ICON_URL);

        const first = await iconCacheService.resolve(ICON_URL);
        const second = await iconCacheService.resolve(ICON_URL);
        expect(first).toBe(second);
        // 内存命中，createObjectURL 只在 cache 写入时调用一次
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });
});
