/**
 * 壁纸设置 Composable
 * 封装 wallpaper store，提供壁纸 URL、本地图片上传、视觉参数调整、重置等方法。
 *
 * 设计要点：
 * - 在组件 setup 中调用，自动完成 store 初始化。
 * - 暴露响应式状态与可直接绑定到背景层的 style 对象。
 * - 使用 effectScope 管理派生状态与 watcher，onUnmounted 时自动清理。
 * - 使用 AbortController 跟踪异步操作，组件卸载时取消未完成的请求/预加载。
 */

import { computed, effectScope, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useWallpaperStore, DEFAULT_WALLPAPER_SETTINGS } from '@/stores/wallpaper.store';
import { mediaCacheService } from '@/services/mediaCache.service';
import type { WallpaperSettings, WallpaperImageData } from '@/types/storage';
import {
    isImageFile,
    validateFileSize,
    DEFAULT_MAX_FILE_SIZE,
    formatFileSize
} from '@/utils/file.util';

/** Composable 配置项 */
export interface UseWallpaperOptions {
    /** 是否在组件挂载后自动初始化 store，默认 true */
    autoInit?: boolean;
}

/** useWallpaper 返回值 */
export interface UseWallpaperReturn {
    /** 当前壁纸设置 */
    settings: ComputedRef<WallpaperSettings>;
    /** 本地图片元数据 */
    imageData: ComputedRef<WallpaperImageData | null>;
    /** 是否已完成初始化 */
    initialized: ComputedRef<boolean>;
    /** 是否有正在执行的异步操作 */
    loading: Ref<boolean>;
    /** 最近一次操作的错误信息 */
    error: Ref<string | null>;
    /** 当前生效的壁纸 URL（本地图片优先） */
    effectiveUrl: ComputedRef<string>;
    /** 是否已设置壁纸 */
    hasWallpaper: ComputedRef<boolean>;
    /** 当前是否为本地图片壁纸 */
    isLocalImage: ComputedRef<boolean>;
    /** 可直接绑定到壁纸背景层的样式对象 */
    wallpaperStyle: ComputedRef<Record<string, string>>;
    /** 手动初始化 */
    init: () => Promise<void>;
    /** 设置网络壁纸 URL */
    setUrl: (url: string) => Promise<void>;
    /** 上传本地图片并设为壁纸 */
    setLocalImage: (file: File) => Promise<void>;
    /** 直接设置本地图片数据（导入/云同步恢复） */
    setLocalImageData: (data: WallpaperImageData) => Promise<void>;
    /** 设置壁纸透明度 */
    setOpacity: (opacity: number) => Promise<void>;
    /** 设置壁纸模糊度 */
    setBlur: (blur: number) => Promise<void>;
    /** 设置遮罩层透明度 */
    setOverlayOpacity: (overlayOpacity: number) => Promise<void>;
    /** 批量应用壁纸设置 */
    applySettings: (partial: Partial<WallpaperSettings>) => Promise<void>;
    /** 移除当前壁纸，保留视觉参数 */
    removeWallpaper: () => Promise<void>;
    /** 重置为默认壁纸设置 */
    reset: () => Promise<void>;
    /** 手动清理副作用（事件监听、AbortController、watcher） */
    cleanup: () => void;
}

/**
 * 壁纸设置 Composable
 * @param options 配置项
 */
export function useWallpaper(options: UseWallpaperOptions = {}): UseWallpaperReturn {
    const { autoInit = true } = options;
    const store = useWallpaperStore();
    const scope = effectScope();

    const loading = ref(false);
    const error = ref<string | null>(null);

    const pendingControllers = new Set<AbortController>();
    let preloadController: AbortController | null = null;

    /**
     * 跟踪 AbortController，信号触发后自动从集合移除
     */
    function trackController(controller: AbortController): void {
        pendingControllers.add(controller);
        controller.signal.addEventListener(
            'abort',
            () => {
                pendingControllers.delete(controller);
            },
            { once: true }
        );
    }

    /**
     * 取消所有正在进行的异步操作
     */
    function abortPending(): void {
        pendingControllers.forEach(controller => controller.abort());
        pendingControllers.clear();
    }

    /**
     * 在 effectScope 内构建派生状态，确保 scope.stop() 时自动清理
     */
    const derived = scope.run(() => ({
        settings: computed<WallpaperSettings>(() => store.settings),
        imageData: computed<WallpaperImageData | null>(() => store.imageData),
        initialized: computed<boolean>(() => store.initialized),
        effectiveUrl: computed<string>(() => store.effectiveUrl),
        hasWallpaper: computed<boolean>(() => store.hasWallpaper),
        isLocalImage: computed<boolean>(() => !!store.isLocalImage)
    }))!;

    const { settings, imageData, initialized, effectiveUrl, hasWallpaper, isLocalImage } = derived;

    /** 缓存命中时的对象地址（未命中为空串，此时用 effectiveUrl 走网络） */
    const cachedWallpaperUrl = ref('');

    /**
     * 地址是否已确定（缓存查询 + 首次抓取都结束）
     *
     * 为 false 时不给背景层输出 backgroundImage：否则浏览器会先按网络地址
     * 发一次请求，等缓存解析出来再换成 blob:，等于缓存白做。
     */
    const wallpaperReady = ref(false);

    /**
     * 预加载图片，失败时记录错误但不阻断流程
     *
     * 只用于「不走缓存」的地址（本地 data: 图片、以及抓取失败的远程地址），
     * 缓存写入由 mediaCacheService.fetchAndCache 负责。
     */
    function preloadImage(target: string): void {
        preloadController?.abort();
        const controller = new AbortController();
        preloadController = controller;
        const img = new Image();

        img.onload = () => {
            if (controller.signal.aborted) {
                return;
            }
            preloadController = null;
        };

        img.onerror = () => {
            if (controller.signal.aborted) {
                return;
            }
            error.value = '壁纸图片加载失败';
            preloadController = null;
        };

        img.src = target;
    }

    /**
     * 可直接绑定到壁纸背景层的样式对象
     *
     * 优先用缓存解析出的对象地址（blob:）：网络壁纸一旦缓存过，
     * 之后每次打开新标签页都不再发请求；本地图片是 data:，不参与缓存。
     *
     * 解析完成前（wallpaperReady=false）先不输出 backgroundImage：
     * 否则浏览器会先按网络地址请求一遍，缓存就白做了。
     */
    const wallpaperStyle = computed<Record<string, string>>(() => {
        const url = cachedWallpaperUrl.value || effectiveUrl.value;
        const ready = wallpaperReady.value && !!url;
        return {
            backgroundImage: ready ? `url(${url})` : 'none',
            opacity: String(settings.value.opacity),
            filter: `blur(${settings.value.blur}px)`,
            '--wallpaper-overlay-opacity': String(settings.value.overlayOpacity)
        };
    });

    /**
     * 壁纸变化时：先查本地缓存，未命中再抓一次并缓存，抓不到才退回网络地址
     *
     * 「每次打开都请求一遍」的根源是以前直接把 url 塞进 background-image，
     * 走不走缓存完全交给浏览器；现在由我们决定地址，命中缓存就是 blob:。
     */
    scope.run(() => {
        watch(
            effectiveUrl,
            url => {
                preloadController?.abort();
                preloadController = null;
                error.value = null;
                cachedWallpaperUrl.value = '';
                wallpaperReady.value = false;

                if (!url) {
                    wallpaperReady.value = true;
                    return;
                }

                // 本地图片（data:）与相对路径本来就不走网络，直接预加载即可
                if (!mediaCacheService.isCacheableUrl(url)) {
                    wallpaperReady.value = true;
                    preloadImage(url);
                    return;
                }

                void (async () => {
                    const cached = await mediaCacheService.resolve(url);
                    // 期间壁纸已被换掉，丢弃这次结果
                    if (effectiveUrl.value !== url) {
                        return;
                    }
                    if (cached) {
                        cachedWallpaperUrl.value = cached;
                        wallpaperReady.value = true;
                        return;
                    }

                    // 未命中：抓一次并写缓存，成功直接用对象地址，避免二次下载
                    const fetched = await mediaCacheService.fetchAndCache(url, 'wallpaper');
                    if (effectiveUrl.value !== url) {
                        return;
                    }
                    if (fetched) {
                        cachedWallpaperUrl.value = fetched;
                        wallpaperReady.value = true;
                        return;
                    }

                    // 抓不到（跨域被拦等）：退回网络地址，交给浏览器自己加载
                    wallpaperReady.value = true;
                    preloadImage(url);
                })();
            },
            { immediate: true }
        );
    });

    /**
     * 通用异步执行包装器
     * - 维护 loading / error 状态
     * - 跟踪 AbortController，支持取消
     * - 并发操作时 loading 在所有操作完成后才置为 false
     */
    async function runAsync<T>(fn: () => Promise<T>, operationName: string): Promise<T> {
        const controller = new AbortController();
        trackController(controller);
        loading.value = true;
        error.value = null;

        try {
            const result = await fn();
            if (controller.signal.aborted) {
                throw new Error(`${operationName} 已取消`);
            }
            return result;
        } catch (err) {
            if (!controller.signal.aborted) {
                error.value = err instanceof Error ? err.message : String(err);
            }
            throw err;
        } finally {
            pendingControllers.delete(controller);
            loading.value = pendingControllers.size > 0;
        }
    }

    /** 初始化 store */
    async function init(): Promise<void> {
        if (initialized.value) {
            return;
        }
        return runAsync(() => store.init(), '初始化');
    }

    /** 设置网络壁纸 URL */
    async function setUrl(url: string): Promise<void> {
        return runAsync(() => store.setUrl(url), '设置壁纸 URL');
    }

    /**
     * 上传本地图片并设为壁纸
     * 先校验文件类型与大小，再交给 store 持久化。
     */
    async function setLocalImage(file: File): Promise<void> {
        if (!isImageFile(file)) {
            const message = '请选择图片文件';
            error.value = message;
            throw new Error(message);
        }

        if (!validateFileSize(file, DEFAULT_MAX_FILE_SIZE)) {
            const message = `本地图片大小不能超过 ${formatFileSize(DEFAULT_MAX_FILE_SIZE)}`;
            error.value = message;
            throw new Error(message);
        }

        return runAsync(() => store.setLocalImage(file), '上传本地壁纸');
    }

    /** 直接设置本地图片数据 */
    async function setLocalImageData(data: WallpaperImageData): Promise<void> {
        return runAsync(() => store.setLocalImageData(data), '导入本地壁纸');
    }

    /** 设置壁纸透明度 */
    async function setOpacity(opacity: number): Promise<void> {
        return runAsync(() => store.setOpacity(opacity), '设置透明度');
    }

    /** 设置壁纸模糊度 */
    async function setBlur(blur: number): Promise<void> {
        return runAsync(() => store.setBlur(blur), '设置模糊度');
    }

    /** 设置遮罩层透明度 */
    async function setOverlayOpacity(overlayOpacity: number): Promise<void> {
        return runAsync(() => store.setOverlayOpacity(overlayOpacity), '设置遮罩透明度');
    }

    /** 批量应用壁纸设置 */
    async function applySettings(partial: Partial<WallpaperSettings>): Promise<void> {
        return runAsync(() => store.applySettings(partial), '应用壁纸设置');
    }

    /** 移除当前壁纸 */
    async function removeWallpaper(): Promise<void> {
        return runAsync(() => store.removeWallpaper(), '移除壁纸');
    }

    /** 重置为默认壁纸设置 */
    async function reset(): Promise<void> {
        return runAsync(() => store.reset(), '重置壁纸');
    }

    /**
     * 清理所有副作用：
     * - 取消未完成的异步操作与图片预加载
     * - 停止 effectScope，清理其内部的 computed / watch
     */
    function cleanup(): void {
        abortPending();
        preloadController?.abort();
        preloadController = null;
        scope.stop();
    }

    onMounted(() => {
        if (autoInit) {
            init().catch(() => {
                // 自动初始化失败时由 error ref 承载错误，不向上抛
            });
        }
    });

    onUnmounted(() => {
        cleanup();
    });

    return {
        settings,
        imageData,
        initialized,
        loading,
        error,
        effectiveUrl,
        hasWallpaper,
        isLocalImage,
        wallpaperStyle,
        init,
        setUrl,
        setLocalImage,
        setLocalImageData,
        setOpacity,
        setBlur,
        setOverlayOpacity,
        applySettings,
        removeWallpaper,
        reset,
        cleanup
    };
}

export { DEFAULT_WALLPAPER_SETTINGS };
