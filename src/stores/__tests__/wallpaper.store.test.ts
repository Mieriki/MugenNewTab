import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { BrowserAPI } from '@/services/browserApi.service';
import { storageManager, STORAGE_EVENT } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { WallpaperSettings, WallpaperImageData } from '@/types/storage';
import { useWallpaperStore, DEFAULT_WALLPAPER_SETTINGS } from '@/stores/wallpaper.store';
import * as fileUtil from '@/utils/file.util';

vi.mock('@/utils/file.util', async () => {
    const actual = await vi.importActual<typeof import('@/utils/file.util')>('@/utils/file.util');
    return {
        ...actual,
        fileToBase64: vi.fn(() => Promise.resolve('data:image/png;base64,mocked'))
    };
});

function createMockFile(name: string, type: string, size: number): File {
    return new File(['x'.repeat(size)], name, { type });
}

describe('useWallpaperStore', () => {
    beforeEach(() => {
        localStorage.clear();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('初始化时应从空存储加载默认值', async () => {
        const store = useWallpaperStore();
        expect(store.initialized).toBe(false);

        await store.init();

        expect(store.initialized).toBe(true);
        expect(store.settings).toEqual(DEFAULT_WALLPAPER_SETTINGS);
        expect(store.imageData).toBeNull();
        expect(store.hasWallpaper).toBe(false);
    });

    it('初始化时应加载已持久化的壁纸设置', async () => {
        const persisted: WallpaperSettings = {
            url: 'https://example.com/bg.jpg',
            opacity: 0.8,
            blur: 4,
            overlayOpacity: 0.2,
            isLocalImage: false
        };
        await storageManager.set(STORAGE_KEYS.WALLPAPER, persisted);

        const store = useWallpaperStore();
        await store.init();

        expect(store.settings).toEqual(persisted);
        expect(store.effectiveUrl).toBe(persisted.url);
        expect(store.hasWallpaper).toBe(true);
    });

    it('初始化时应加载已持久化的本地图片', async () => {
        const imageData: WallpaperImageData = {
            data: 'data:image/png;base64,abc123',
            name: 'wallpaper.png',
            type: 'image/png',
            size: 1024,
            timestamp: 1700000000000
        };
        const settings: WallpaperSettings = {
            url: '',
            opacity: 1,
            blur: 0,
            overlayOpacity: 0,
            isLocalImage: true
        };
        await storageManager.setMany({
            [STORAGE_KEYS.WALLPAPER]: settings,
            [STORAGE_KEYS.WALLPAPER_IMAGE]: imageData
        });

        const store = useWallpaperStore();
        await store.init();

        expect(store.imageData).toEqual(imageData);
        expect(store.isLocalImage).toBe(true);
        expect(store.effectiveUrl).toBe(imageData.data);
        expect(store.hasWallpaper).toBe(true);
    });

    it('setUrl 应持久化 URL 并清除本地图片状态', async () => {
        const store = useWallpaperStore();
        await store.setLocalImageData({
            data: 'data:image/png;base64,old',
            name: 'old.png',
            type: 'image/png',
            size: 100,
            timestamp: 1
        });

        await store.setUrl('https://example.com/new.jpg');

        expect(store.settings.url).toBe('https://example.com/new.jpg');
        expect(store.settings.isLocalImage).toBe(false);
        expect(store.imageData).toBeNull();
        expect(store.effectiveUrl).toBe('https://example.com/new.jpg');

        const persisted = await storageManager.get(STORAGE_KEYS.WALLPAPER_IMAGE);
        expect(persisted).toBeNull();
    });

    it('setLocalImage 应校验文件大小并持久化 Base64 图片', async () => {
        const store = useWallpaperStore();
        const file = createMockFile('bg.png', 'image/png', 100);

        await store.setLocalImage(file);

        expect(fileUtil.fileToBase64).toHaveBeenCalledWith(file);
        expect(store.imageData).toMatchObject({
            data: 'data:image/png;base64,mocked',
            name: 'bg.png',
            type: 'image/png',
            size: 100
        });
        expect(store.settings.isLocalImage).toBe(true);
        expect(store.settings.url).toBe('');
        expect(store.effectiveUrl).toBe('data:image/png;base64,mocked');
    });

    it('setLocalImage 应拒绝超过 5MB 的图片', async () => {
        const store = useWallpaperStore();
        const file = createMockFile('big.png', 'image/png', 6 * 1024 * 1024);

        await expect(store.setLocalImage(file)).rejects.toThrow('不能超过');
        expect(store.imageData).toBeNull();
        expect(store.settings.isLocalImage).toBe(false);
    });

    it('setLocalImageData 应直接持久化图片数据', async () => {
        const store = useWallpaperStore();
        const imageData: WallpaperImageData = {
            data: 'data:image/jpeg;base64,xyz',
            name: 'imported.jpg',
            type: 'image/jpeg',
            size: 2048,
            timestamp: 1700000000000
        };

        await store.setLocalImageData(imageData);

        expect(store.imageData).toEqual(imageData);
        expect(store.settings.isLocalImage).toBe(true);
        expect(store.settings.url).toBe('');
    });

    it('setOpacity / setBlur / setOverlayOpacity 应分别持久化', async () => {
        const store = useWallpaperStore();

        await store.setOpacity(0.7);
        expect(store.settings.opacity).toBe(0.7);

        await store.setBlur(8);
        expect(store.settings.blur).toBe(8);

        await store.setOverlayOpacity(0.4);
        expect(store.settings.overlayOpacity).toBe(0.4);

        const persisted = (await storageManager.get(STORAGE_KEYS.WALLPAPER)) as WallpaperSettings;
        expect(persisted.opacity).toBe(0.7);
        expect(persisted.blur).toBe(8);
        expect(persisted.overlayOpacity).toBe(0.4);
    });

    it('applySettings 应批量应用并持久化', async () => {
        const store = useWallpaperStore();

        await store.applySettings({ opacity: 0.6, blur: 3 });

        expect(store.settings.opacity).toBe(0.6);
        expect(store.settings.blur).toBe(3);
        expect(store.settings.url).toBe(DEFAULT_WALLPAPER_SETTINGS.url);

        const persisted = (await storageManager.get(STORAGE_KEYS.WALLPAPER)) as WallpaperSettings;
        expect(persisted.opacity).toBe(0.6);
        expect(persisted.blur).toBe(3);
    });

    it('removeWallpaper 应清空 URL 与本地图片，但保留视觉参数', async () => {
        const store = useWallpaperStore();
        await store.setUrl('https://example.com/bg.jpg');
        await store.setOpacity(0.5);

        await store.removeWallpaper();

        expect(store.settings.url).toBe('');
        expect(store.settings.isLocalImage).toBe(false);
        expect(store.imageData).toBeNull();
        expect(store.settings.opacity).toBe(0.5);
        expect(store.hasWallpaper).toBe(false);
    });

    it('reset 应恢复所有设置为默认值', async () => {
        const store = useWallpaperStore();
        await store.setUrl('https://example.com/bg.jpg');
        await store.setOpacity(0.5);
        await store.setBlur(10);

        await store.reset();

        expect(store.settings).toEqual(DEFAULT_WALLPAPER_SETTINGS);
        expect(store.imageData).toBeNull();
        expect(store.hasWallpaper).toBe(false);
    });

    it('持久化失败时应回滚内存状态', async () => {
        const store = useWallpaperStore();
        await store.setUrl('https://example.com/original.jpg');

        const spy = vi.spyOn(storageManager, 'setMany').mockRejectedValueOnce(new Error('QuotaExceeded'));

        await expect(store.setUrl('https://example.com/new.jpg')).rejects.toThrow('QuotaExceeded');

        expect(store.settings.url).toBe('https://example.com/original.jpg');
        expect(store.hasWallpaper).toBe(true);

        spy.mockRestore();
    });

    it('应响应外部存储变更事件', async () => {
        const store = useWallpaperStore();
        await store.init();

        const newSettings: WallpaperSettings = {
            url: 'https://example.com/external.jpg',
            opacity: 0.3,
            blur: 2,
            overlayOpacity: 0.1,
            isLocalImage: false
        };

        window.dispatchEvent(
            new CustomEvent(STORAGE_EVENT, {
                detail: {
                    [STORAGE_KEYS.WALLPAPER]: { newValue: newSettings }
                }
            })
        );

        expect(store.settings).toEqual(newSettings);
        expect(store.effectiveUrl).toBe('https://example.com/external.jpg');
    });

    it('本地图片优先于 URL 作为 effectiveUrl', async () => {
        const store = useWallpaperStore();
        await store.setUrl('https://example.com/remote.jpg');
        await store.setLocalImageData({
            data: 'data:image/png;base64,local',
            name: 'local.png',
            type: 'image/png',
            size: 100,
            timestamp: 1
        });

        expect(store.effectiveUrl).toBe('data:image/png;base64,local');
        expect(store.isLocalImage).toBe(true);
    });
});
