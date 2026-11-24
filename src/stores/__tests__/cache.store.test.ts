/**
 * cache.store 单元测试
 *
 * 覆盖图标 / 壁纸两个独立开关的默认值、镜像同步读取、旧版总开关迁移、
 * 持久化、用量统计与清理。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCacheStore } from '@/stores/cache.store';
import { storageManager } from '@/services/storage.service';
import { mediaCacheService } from '@/services/mediaCache.service';
import { STORAGE_KEYS } from '@/types/storage';

describe('cache.store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
        vi.spyOn(storageManager, 'get').mockResolvedValue(null);
        vi.spyOn(storageManager, 'set').mockResolvedValue(undefined);
        vi.spyOn(mediaCacheService, 'setEnabled').mockImplementation(() => undefined);
        vi.spyOn(mediaCacheService, 'stats').mockResolvedValue({
            count: 0,
            bytes: 0,
            byKind: { icon: 0, wallpaper: 0 },
        });
        vi.spyOn(mediaCacheService, 'clear').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('默认开启图标与壁纸缓存', () => {
        const store = useCacheStore();

        expect(store.iconEnabled).toBe(true);
        expect(store.wallpaperEnabled).toBe(true);
    });

    it('首帧同步读取镜像：关闭状态不必等 init 就生效', () => {
        localStorage.setItem(
            STORAGE_KEYS.MEDIA_CACHE,
            JSON.stringify({ icon: true, wallpaper: false })
        );

        const store = useCacheStore();

        expect(store.initialized).toBe(false);
        expect(store.iconEnabled).toBe(true);
        expect(store.wallpaperEnabled).toBe(false);
        expect(mediaCacheService.setEnabled).toHaveBeenCalledWith('wallpaper', false);
    });

    it('镜像里的旧版总开关会被迁移成两个独立开关', () => {
        localStorage.setItem(STORAGE_KEYS.MEDIA_CACHE, JSON.stringify({ enabled: false }));

        const store = useCacheStore();

        expect(store.iconEnabled).toBe(false);
        expect(store.wallpaperEnabled).toBe(false);
    });

    it('init 读取存储中的开关并同步给缓存服务', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ icon: true, wallpaper: false });

        const store = useCacheStore();
        await store.init();

        expect(store.iconEnabled).toBe(true);
        expect(store.wallpaperEnabled).toBe(false);
        expect(store.initialized).toBe(true);
        expect(mediaCacheService.setEnabled).toHaveBeenCalledWith('icon', true);
        expect(mediaCacheService.setEnabled).toHaveBeenCalledWith('wallpaper', false);
    });

    it('init 会把开关回填到同步镜像（旧结构归一为新结构）', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ enabled: false });

        const store = useCacheStore();
        await store.init();

        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.MEDIA_CACHE) ?? 'null')).toEqual({
            icon: false,
            wallpaper: false,
        });
    });

    it('setIconEnabled 持久化并立即作用于缓存服务', async () => {
        const store = useCacheStore();
        await store.init();

        await store.setIconEnabled(false);

        expect(store.iconEnabled).toBe(false);
        expect(store.wallpaperEnabled).toBe(true);
        expect(mediaCacheService.setEnabled).toHaveBeenCalledWith('icon', false);
        expect(storageManager.set).toHaveBeenCalledWith(STORAGE_KEYS.MEDIA_CACHE, {
            icon: false,
            wallpaper: true,
        });
    });

    it('setWallpaperEnabled 只影响壁纸，不动图标', async () => {
        const store = useCacheStore();
        await store.init();

        await store.setWallpaperEnabled(false);

        expect(store.wallpaperEnabled).toBe(false);
        expect(store.iconEnabled).toBe(true);
        expect(mediaCacheService.setEnabled).toHaveBeenCalledWith('wallpaper', false);
        expect(mediaCacheService.setEnabled).not.toHaveBeenCalledWith('icon', false);
        expect(storageManager.set).toHaveBeenCalledWith(STORAGE_KEYS.MEDIA_CACHE, {
            icon: true,
            wallpaper: false,
        });
    });

    it('refreshStats 拉取用量', async () => {
        vi.mocked(mediaCacheService.stats).mockResolvedValue({
            count: 3,
            bytes: 2048,
            byKind: { icon: 2, wallpaper: 1 },
        });

        const store = useCacheStore();
        await store.refreshStats();

        expect(store.stats.count).toBe(3);
        expect(store.stats.byKind.wallpaper).toBe(1);
    });

    it('clearCache 清空缓存后刷新统计', async () => {
        vi.mocked(mediaCacheService.stats).mockResolvedValue({
            count: 0,
            bytes: 0,
            byKind: { icon: 0, wallpaper: 0 },
        });

        const store = useCacheStore();
        await store.clearCache();

        expect(mediaCacheService.clear).toHaveBeenCalled();
        expect(store.stats.count).toBe(0);
        expect(store.loading).toBe(false);
    });
});
