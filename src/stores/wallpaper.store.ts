/**
 * 壁纸设置 Pinia Store
 * 管理壁纸 URL、本地 Base64 图片、透明度、模糊度、遮罩层透明度，并持久化到 StorageManager。
 *
 * 与原项目 js/app.js 中 WallpaperManager 保持一致的数据结构，
 * 存储键名为 STORAGE_KEYS.WALLPAPER 与 STORAGE_KEYS.WALLPAPER_IMAGE。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { WallpaperSettings, WallpaperImageData } from '@/types/storage';
import { fileToBase64, validateFileSize, DEFAULT_MAX_FILE_SIZE } from '@/utils/file.util';

/** 默认壁纸设置 */
export const DEFAULT_WALLPAPER_SETTINGS: WallpaperSettings = {
    url: '',
    opacity: 1,
    blur: 0,
    overlayOpacity: 0,
    isLocalImage: false
};

/** 本地图片最大限制（与原项目一致：5MB） */
export const MAX_LOCAL_IMAGE_SIZE = DEFAULT_MAX_FILE_SIZE;

/** 深拷贝辅助
 * 兼容 Vue reactive proxy：structuredClone 无法克隆 Proxy，
 * 因此失败时回退到 JSON 序列化。
 */
function clone<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value) as T;
        } catch (_) {
            return JSON.parse(JSON.stringify(value)) as T;
        }
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

/** 校验并补全壁纸设置 */
function normalizeSettings(value: unknown): WallpaperSettings {
    const settings = (value ?? {}) as Partial<WallpaperSettings>;
    return {
        url: typeof settings.url === 'string' ? settings.url : DEFAULT_WALLPAPER_SETTINGS.url,
        opacity: typeof settings.opacity === 'number' ? settings.opacity : DEFAULT_WALLPAPER_SETTINGS.opacity,
        blur: typeof settings.blur === 'number' ? settings.blur : DEFAULT_WALLPAPER_SETTINGS.blur,
        overlayOpacity: typeof settings.overlayOpacity === 'number'
            ? settings.overlayOpacity
            : DEFAULT_WALLPAPER_SETTINGS.overlayOpacity,
        isLocalImage: typeof settings.isLocalImage === 'boolean'
            ? settings.isLocalImage
            : DEFAULT_WALLPAPER_SETTINGS.isLocalImage
    };
}

/** 校验本地图片元数据格式 */
function isValidImageData(value: unknown): value is WallpaperImageData {
    const data = value as Partial<WallpaperImageData>;
    return (
        typeof data === 'object' &&
        data !== null &&
        typeof data.data === 'string' &&
        typeof data.name === 'string' &&
        typeof data.type === 'string' &&
        typeof data.size === 'number' &&
        typeof data.timestamp === 'number'
    );
}

/** 将 Partial 应用到完整对象，忽略显式传入的 undefined */
function applyPartial<T extends object>(target: T, partial: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(partial) as Array<keyof T>) {
        if (partial[key] !== undefined) {
            result[key] = partial[key] as T[keyof T];
        }
    }
    return result;
}

export const useWallpaperStore = defineStore('wallpaper', () => {
    // State
    const settings = ref<WallpaperSettings>(clone(DEFAULT_WALLPAPER_SETTINGS));
    const imageData = ref<WallpaperImageData | null>(null);
    const initialized = ref(false);

    let initPromise: Promise<void> | null = null;
    let unsubscribeStorage: (() => void) | null = null;

    // Getters
    /** 当前生效的壁纸 URL：本地图片优先 */
    const effectiveUrl = computed(() => {
        if (settings.value.isLocalImage && imageData.value?.data) {
            return imageData.value.data;
        }
        return settings.value.url;
    });

    /** 是否已设置壁纸 */
    const hasWallpaper = computed(() => {
        return Boolean(settings.value.isLocalImage ? imageData.value?.data : settings.value.url);
    });

    /** 当前是否为本地图片壁纸 */
    const isLocalImage = computed(() => settings.value.isLocalImage);

    // Internal helpers

    /** 从持久化存储读取壁纸设置与本地图片 */
    async function loadPersisted(): Promise<{
        settings: WallpaperSettings;
        imageData: WallpaperImageData | null;
    }> {
        const persisted = await storageManager.getMany([
            STORAGE_KEYS.WALLPAPER,
            STORAGE_KEYS.WALLPAPER_IMAGE
        ]);

        return {
            settings: normalizeSettings(persisted[STORAGE_KEYS.WALLPAPER]),
            imageData: isValidImageData(persisted[STORAGE_KEYS.WALLPAPER_IMAGE])
                ? clone(persisted[STORAGE_KEYS.WALLPAPER_IMAGE] as WallpaperImageData)
                : null
        };
    }

    /** 仅持久化壁纸设置 */
    async function persistSettings(): Promise<void> {
        await storageManager.set(STORAGE_KEYS.WALLPAPER, clone(settings.value));
    }

    /** 持久化壁纸设置与本地图片（含删除） */
    async function persistImageAndSettings(): Promise<void> {
        const items: Record<string, import('@/types/storage').StorageValue> = {
            [STORAGE_KEYS.WALLPAPER]: clone(settings.value),
            [STORAGE_KEYS.WALLPAPER_IMAGE]: imageData.value ? clone(imageData.value) : null
        };
        await storageManager.setMany(items);
    }

    /**
     * 带失败回滚的批量写入
     * 先更新内存状态，再持久化；持久化失败时恢复先前状态。
     */
    async function commitWithRollback(mutator: () => void): Promise<void> {
        const previousSettings = clone(settings.value);
        const previousImage = clone(imageData.value);

        mutator();

        try {
            await persistImageAndSettings();
        } catch (error) {
            settings.value = previousSettings;
            imageData.value = previousImage;
            throw error;
        }
    }

    /** 响应外部存储变更（如云同步、其他标签页） */
    function handleStorageChanges(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>): void {
        const wallpaperChange = changes[STORAGE_KEYS.WALLPAPER];
        if (wallpaperChange && 'newValue' in wallpaperChange) {
            settings.value = normalizeSettings(wallpaperChange.newValue);
        }

        const imageChange = changes[STORAGE_KEYS.WALLPAPER_IMAGE];
        if (imageChange && 'newValue' in imageChange) {
            imageData.value = isValidImageData(imageChange.newValue)
                ? clone(imageChange.newValue as WallpaperImageData)
                : null;
        }
    }

    // Actions

    /** 初始化：从持久化存储加载壁纸数据 */
    async function init(): Promise<void> {
        if (initialized.value) {
            return;
        }
        if (initPromise) {
            return initPromise;
        }

        initPromise = loadPersisted()
            .then(persisted => {
                settings.value = persisted.settings;
                imageData.value = persisted.imageData;
                initialized.value = true;

                if (!unsubscribeStorage) {
                    unsubscribeStorage = storageManager.subscribe(handleStorageChanges);
                }
            })
            .catch(error => {
                initPromise = null;
                throw error;
            });

        return initPromise;
    }

    /** 设置网络壁纸 URL，同时清除本地图片标记与数据 */
    async function setUrl(url: string): Promise<void> {
        await init();
        await commitWithRollback(() => {
            settings.value.url = url;
            settings.value.isLocalImage = false;
            imageData.value = null;
        });
    }

    /**
     * 上传本地图片并设为壁纸
     * 文件会被读取为 Base64 Data URL 后持久化。
     */
    async function setLocalImage(file: File): Promise<void> {
        await init();

        if (!validateFileSize(file, MAX_LOCAL_IMAGE_SIZE)) {
            throw new Error(`本地图片大小不能超过 ${MAX_LOCAL_IMAGE_SIZE / 1024 / 1024}MB`);
        }

        const data = await fileToBase64(file);

        await commitWithRollback(() => {
            imageData.value = {
                data,
                name: file.name,
                type: file.type || 'image/png',
                size: file.size,
                timestamp: Date.now()
            };
            settings.value.isLocalImage = true;
            settings.value.url = '';
        });
    }

    /** 直接设置本地图片数据（用于导入/云同步恢复等场景） */
    async function setLocalImageData(data: WallpaperImageData): Promise<void> {
        await init();
        await commitWithRollback(() => {
            imageData.value = clone(data);
            settings.value.isLocalImage = true;
            settings.value.url = '';
        });
    }

    /** 设置壁纸透明度 */
    async function setOpacity(opacity: number): Promise<void> {
        await init();
        settings.value.opacity = opacity;
        await persistSettings();
    }

    /** 设置壁纸模糊度 */
    async function setBlur(blur: number): Promise<void> {
        await init();
        settings.value.blur = blur;
        await persistSettings();
    }

    /** 设置遮罩层透明度 */
    async function setOverlayOpacity(overlayOpacity: number): Promise<void> {
        await init();
        settings.value.overlayOpacity = overlayOpacity;
        await persistSettings();
    }

    /** 批量应用壁纸设置 */
    async function applySettings(partial: Partial<WallpaperSettings>): Promise<void> {
        await init();
        await commitWithRollback(() => {
            settings.value = normalizeSettings(applyPartial(settings.value, partial));
        });
    }

    /** 移除当前壁纸（清空 URL 与本地图片），保留透明度等视觉参数 */
    async function removeWallpaper(): Promise<void> {
        await init();
        await commitWithRollback(() => {
            settings.value.url = '';
            settings.value.isLocalImage = false;
            imageData.value = null;
        });
    }

    /** 重置为默认壁纸设置 */
    async function reset(): Promise<void> {
        await init();
        await commitWithRollback(() => {
            settings.value = clone(DEFAULT_WALLPAPER_SETTINGS);
            imageData.value = null;
        });
    }

    return {
        // state
        settings,
        imageData,
        initialized,
        // getters
        effectiveUrl,
        hasWallpaper,
        isLocalImage,
        // actions
        init,
        setUrl,
        setLocalImage,
        setLocalImageData,
        setOpacity,
        setBlur,
        setOverlayOpacity,
        applySettings,
        removeWallpaper,
        reset
    };
});
