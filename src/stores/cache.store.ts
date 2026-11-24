/**
 * cache.store
 * 媒体缓存（站点图标 / 网络壁纸）的开关与用量统计。
 *
 * 图标与壁纸各有一个开关：随机 / 动态壁纸接口每次返回不同图片，一旦按 URL
 * 缓存就会固定成首次抓到的那张，因此必须能单独关掉壁纸缓存而不影响图标。
 *
 * 开关本身持久化在 STORAGE_KEYS.MEDIA_CACHE，并加入 SYNC_MIRROR_KEYS：
 * 图标组件在首帧就要决定「读缓存还是走网络」，等异步存储回来再判断会让
 * 「已关闭」状态失效一次，所以这里同步读镜像拿初值。
 *
 * 真正的缓存数据在 IndexedDB（mediaCacheService），这里只负责开关与展示。
 */

import { ref } from 'vue';
import { defineStore } from 'pinia';
import { storageManager } from '@/services/storage.service';
import {
    mediaCacheService,
    parseMediaCacheSettings,
    type MediaCacheStats
} from '@/services/mediaCache.service';
import { STORAGE_KEYS } from '@/types/storage';

/** 空统计（IndexedDB 不可用时也返回这个） */
function emptyStats(): MediaCacheStats {
    return { count: 0, bytes: 0, byKind: { icon: 0, wallpaper: 0 } };
}

/** 同步读取 localStorage 镜像里的开关（含旧版总开关迁移） */
function readMirroredSettings(): Record<'icon' | 'wallpaper', boolean> {
    try {
        return parseMediaCacheSettings(storageManager.getSync(STORAGE_KEYS.MEDIA_CACHE));
    } catch (error) {
        console.warn('[CacheStore] 读取缓存开关镜像失败:', error);
        return { icon: true, wallpaper: true };
    }
}

export const useCacheStore = defineStore('cache', () => {
    const mirrored = readMirroredSettings();
    const iconEnabled = ref<boolean>(mirrored.icon);
    const wallpaperEnabled = ref<boolean>(mirrored.wallpaper);
    const initialized = ref(false);
    const stats = ref<MediaCacheStats>(emptyStats());
    const loading = ref(false);

    /** 首帧就同步生效，避免开关状态晚一拍 */
    mediaCacheService.setEnabled('icon', iconEnabled.value);
    mediaCacheService.setEnabled('wallpaper', wallpaperEnabled.value);

    /** 把两个开关一起写入存储与镜像 */
    async function persist(): Promise<void> {
        const settings = { icon: iconEnabled.value, wallpaper: wallpaperEnabled.value };
        await storageManager.set(STORAGE_KEYS.MEDIA_CACHE, settings);
    }

    /** 加载缓存设置（幂等） */
    async function init(): Promise<void> {
        if (initialized.value) return;
        try {
            const saved = parseMediaCacheSettings(
                await storageManager.get(STORAGE_KEYS.MEDIA_CACHE)
            );
            iconEnabled.value = saved.icon;
            wallpaperEnabled.value = saved.wallpaper;
            // 回填同步镜像：老版本存的是总开关，不回填的话下次首帧仍按旧结构解析
            storageManager.writeSyncMirror(STORAGE_KEYS.MEDIA_CACHE, {
                icon: saved.icon,
                wallpaper: saved.wallpaper
            });
            mediaCacheService.setEnabled('icon', saved.icon);
            mediaCacheService.setEnabled('wallpaper', saved.wallpaper);
            initialized.value = true;
        } catch (error) {
            console.error('[CacheStore] 加载缓存设置失败:', error);
        }
    }

    /** 切换图标缓存开关（不清除已有缓存，重新打开即可复用） */
    async function setIconEnabled(value: boolean): Promise<void> {
        iconEnabled.value = value;
        mediaCacheService.setEnabled('icon', value);
        await persist();
    }

    /** 切换壁纸缓存开关（不清除已有缓存，重新打开即可复用） */
    async function setWallpaperEnabled(value: boolean): Promise<void> {
        wallpaperEnabled.value = value;
        mediaCacheService.setEnabled('wallpaper', value);
        await persist();
    }

    /** 刷新用量统计 */
    async function refreshStats(): Promise<void> {
        stats.value = await mediaCacheService.stats();
    }

    /** 清空全部缓存并刷新统计 */
    async function clearCache(): Promise<void> {
        loading.value = true;
        try {
            await mediaCacheService.clear();
            await refreshStats();
        } finally {
            loading.value = false;
        }
    }

    /** 缓存是否可用（IndexedDB 被禁用时返回 false，界面据此提示） */
    function isAvailable(): boolean {
        return mediaCacheService.isAvailable();
    }

    return {
        iconEnabled,
        wallpaperEnabled,
        initialized,
        stats,
        loading,
        init,
        setIconEnabled,
        setWallpaperEnabled,
        refreshStats,
        clearCache,
        isAvailable,
    };
});
