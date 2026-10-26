/**
 * cache.store
 * 媒体缓存（站点图标 / 网络壁纸）的开关与用量统计。
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
import { mediaCacheService, type MediaCacheStats } from '@/services/mediaCache.service';
import { STORAGE_KEYS, type MediaCacheSettings } from '@/types/storage';

/** 默认开启：缓存是纯收益，用户嫌占空间可以关掉 */
const DEFAULT_ENABLED = true;

/** 空统计（IndexedDB 不可用时也返回这个） */
function emptyStats(): MediaCacheStats {
    return { count: 0, bytes: 0, byKind: { icon: 0, wallpaper: 0 } };
}

/** 同步读取 localStorage 镜像里的开关值 */
function readMirroredEnabled(): boolean {
    try {
        const mirrored = storageManager.getSync(STORAGE_KEYS.MEDIA_CACHE);
        if (mirrored && typeof mirrored === 'object') {
            const enabled = (mirrored as Partial<MediaCacheSettings>).enabled;
            if (typeof enabled === 'boolean') {
                return enabled;
            }
        }
    } catch (error) {
        console.warn('[CacheStore] 读取缓存开关镜像失败:', error);
    }
    return DEFAULT_ENABLED;
}

export const useCacheStore = defineStore('cache', () => {
    const enabled = ref<boolean>(readMirroredEnabled());
    const initialized = ref(false);
    const stats = ref<MediaCacheStats>(emptyStats());
    const loading = ref(false);

    /** 首帧就同步生效，避免开关状态晚一拍 */
    mediaCacheService.setEnabled(enabled.value);

    async function persist(): Promise<void> {
        const settings: MediaCacheSettings = { enabled: enabled.value };
        await storageManager.set(STORAGE_KEYS.MEDIA_CACHE, settings);
    }

    /** 加载缓存设置（幂等） */
    async function init(): Promise<void> {
        if (initialized.value) return;
        try {
            const saved = (await storageManager.get(STORAGE_KEYS.MEDIA_CACHE)) as Partial<MediaCacheSettings> | null;
            if (saved && typeof saved === 'object' && typeof saved.enabled === 'boolean') {
                enabled.value = saved.enabled;
            }
            // 回填同步镜像：老版本没有这份数据，不回填的话下次首帧仍按默认值走
            storageManager.writeSyncMirror(STORAGE_KEYS.MEDIA_CACHE, { enabled: enabled.value });
            mediaCacheService.setEnabled(enabled.value);
            initialized.value = true;
        } catch (error) {
            console.error('[CacheStore] 加载缓存设置失败:', error);
        }
    }

    /** 切换缓存开关（不清除已有缓存，重新打开即可复用） */
    async function setEnabled(value: boolean): Promise<void> {
        enabled.value = value;
        mediaCacheService.setEnabled(value);
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
        enabled,
        initialized,
        stats,
        loading,
        init,
        setEnabled,
        refreshStats,
        clearCache,
        isAvailable,
    };
});
