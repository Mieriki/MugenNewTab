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

    /**
     * 可直接绑定到壁纸背景层的样式对象
     */
    const wallpaperStyle = computed<Record<string, string>>(() => ({
        backgroundImage: effectiveUrl.value ? `url(${effectiveUrl.value})` : 'none',
        opacity: String(settings.value.opacity),
        filter: `blur(${settings.value.blur}px)`,
        '--wallpaper-overlay-opacity': String(settings.value.overlayOpacity)
    }));

    /**
     * 预加载生效的壁纸图片，加载失败时记录错误但不阻断流程
     */
    scope.run(() => {
        watch(
            effectiveUrl,
            url => {
                preloadController?.abort();
                preloadController = null;
                error.value = null;

                if (!url) {
                    return;
                }

                const controller = new AbortController();
                preloadController = controller;
                const img = new Image();

                img.onload = () => {
                    if (!controller.signal.aborted) {
                        preloadController = null;
                    }
                };

                img.onerror = () => {
                    if (!controller.signal.aborted) {
                        error.value = '壁纸图片加载失败';
                        preloadController = null;
                    }
                };

                img.src = url;
            },
            { immediate: false }
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
