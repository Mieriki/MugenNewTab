/**
 * 当前活动标签页信息 Composable
 *
 * 封装 browserApi.tabs.query，读取当前窗口活动标签页的标题、URL 与 favicon。
 * 支持自动刷新（页面可见性变化 / 定时轮询）与手动刷新，并在组件卸载时清理
 * 事件监听、定时器与 AbortController。
 *
 * 使用场景：扩展 popup 快速添加当前站点时，自动填充标题、URL 与图标。
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { browserApi } from '@/services/browserApi.service';
import type { Tab } from '@/types/browserApi.types';

/** useCurrentTab 配置项 */
export interface UseCurrentTabOptions {
    /**
     * 是否在页面可见性变化时自动刷新。
     * 在 popup 场景中建议开启，用户切换标签页后再次打开 popup 可拿到最新页签。
     * 默认 true。
     */
    autoRefresh?: boolean;

    /**
     * 自动轮询间隔（毫秒）。
     * 设置为 0 时不启用定时轮询。
     * 默认 0。
     */
    refreshInterval?: number;

    /**
     * 是否将浏览器内部页面（chrome://、about: 等）也视为有效页签。
     * 默认 false，即过滤掉无效页面。
     */
    includeInvalid?: boolean;
}

/** useCurrentTab 返回值 */
export interface UseCurrentTabReturn {
    /** 原始标签页对象 */
    tab: Ref<Tab | null>;
    /** 标签页标题（已 trim） */
    title: ComputedRef<string>;
    /** 标签页 URL（已 trim） */
    url: ComputedRef<string>;
    /** 当前应显示的 favicon URL；原页面无 favicon 时返回默认 SVG */
    favicon: ComputedRef<string>;
    /** 原页面是否提供了有效 favicon URL */
    hasFavicon: ComputedRef<boolean>;
    /** 当前标签页是否为有效页面 */
    isValid: ComputedRef<boolean>;
    /** 是否正在查询标签页 */
    isLoading: Ref<boolean>;
    /** 最近一次查询错误 */
    error: Ref<Error | null>;
    /** 手动刷新当前标签页信息 */
    refresh: () => Promise<void>;
}

/** 默认 favicon：简洁的页面/标签图标 SVG（Material Design 风格，24x24 viewBox） */
const DEFAULT_FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';

/** 默认 favicon Data URL */
const DEFAULT_FAVICON = `data:image/svg+xml,${encodeURIComponent(DEFAULT_FAVICON_SVG)}`;

/** 应被过滤的浏览器内部协议集合 */
const INVALID_PROTOCOLS = new Set([
    'chrome:',
    'chrome-extension:',
    'edge:',
    'about:',
    'javascript:',
    'data:',
    'file:',
    'moz-extension:',
    'ms-browser-extension:',
]);

/**
 * 校验 URL 是否为有效页面
 * - 空字符串 / 无法解析为 URL 视为无效
 * - 浏览器内部协议（chrome://、about:、javascript: 等）视为无效
 */
function isValidTabUrl(url: string | undefined): boolean {
    if (!url) {
        return false;
    }
    try {
        const parsed = new URL(url.trim());
        return !INVALID_PROTOCOLS.has(parsed.protocol);
    } catch {
        return false;
    }
}

/** 规范化 favicon URL，过滤空字符串 */
function normalizeFaviconUrl(favIconUrl: string | undefined): string {
    if (!favIconUrl) {
        return '';
    }
    const trimmed = favIconUrl.trim();
    return trimmed.length > 0 ? trimmed : '';
}

/**
 * 当前活动标签页 Composable
 *
 * @param options 配置项
 * @returns 标签页信息与刷新方法
 */
export function useCurrentTab(options: UseCurrentTabOptions = {}): UseCurrentTabReturn {
    const { autoRefresh = true, refreshInterval = 0, includeInvalid = false } = options;

    const tab = ref<Tab | null>(null);
    const isLoading = ref(false);
    const error = ref<Error | null>(null);
    const abortController = ref<AbortController | null>(null);

    const title = computed(() => tab.value?.title?.trim() ?? '');
    const url = computed(() => tab.value?.url?.trim() ?? '');
    const rawFavicon = computed(() => normalizeFaviconUrl(tab.value?.favIconUrl));
    const hasFavicon = computed(() => rawFavicon.value.length > 0);
    const favicon = computed(() => (hasFavicon.value ? rawFavicon.value : DEFAULT_FAVICON));
    const isValid = computed(() => {
        if (includeInvalid) {
            return url.value.length > 0;
        }
        return isValidTabUrl(tab.value?.url);
    });

    /**
     * 手动刷新当前活动标签页信息。
     * 新的刷新请求会取消上一次仍在进行中的请求，避免旧结果覆盖新结果。
     */
    async function refresh(): Promise<void> {
        if (abortController.value) {
            abortController.value.abort();
        }

        const controller = new AbortController();
        abortController.value = controller;

        isLoading.value = true;
        error.value = null;

        try {
            if (controller.signal.aborted) {
                throw new Error('请求已取消');
            }

            const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });

            if (controller.signal.aborted) {
                return;
            }

            tab.value = tabs && tabs.length > 0 ? tabs[0] : null;
        } catch (err) {
            if (controller.signal.aborted) {
                return;
            }
            error.value = err instanceof Error ? err : new Error(String(err));
        } finally {
            if (abortController.value === controller) {
                isLoading.value = false;
                abortController.value = null;
            }
        }
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    /** 页面可见性变化处理：变为可见时刷新 */
    function handleVisibilityChange(): void {
        if (document.visibilityState === 'visible') {
            refresh().catch(() => {
                // 自动刷新失败不抛出，避免未捕获异常
            });
        }
    }

    /** 启动自动刷新：监听 visibilitychange 与可选的定时轮询 */
    function startAutoRefresh(): void {
        if (typeof window === 'undefined') {
            return;
        }
        window.addEventListener('visibilitychange', handleVisibilityChange);

        if (refreshInterval > 0) {
            intervalId = setInterval(() => {
                refresh().catch(() => {
                    // 自动刷新失败不抛出
                });
            }, refreshInterval);
        }
    }

    /** 停止自动刷新：移除事件监听与定时器 */
    function stopAutoRefresh(): void {
        if (typeof window === 'undefined') {
            return;
        }
        window.removeEventListener('visibilitychange', handleVisibilityChange);

        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    onMounted(() => {
        refresh().catch(() => {
            // 初始查询失败不阻塞挂载
        });

        if (autoRefresh) {
            startAutoRefresh();
        }
    });

    onUnmounted(() => {
        stopAutoRefresh();

        if (abortController.value) {
            abortController.value.abort();
            abortController.value = null;
        }
    });

    return {
        tab,
        title,
        url,
        favicon,
        hasFavicon,
        isValid,
        isLoading,
        error,
        refresh,
    };
}

export type { Tab };
