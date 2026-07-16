/**
 * useTheme
 * 封装 theme store，为组件提供初始化、切换主题、跟随系统、循环主题等能力。
 *
 * 设计要点：
 * - 在组件 setup 中调用，默认自动完成 store 初始化。
 * - 暴露响应式状态与可直接绑定到主题选择器的方法。
 * - 使用 AbortController 跟踪异步操作，组件卸载时取消未完成的初始化。
 * - 防止重复初始化，并发调用会复用同一 Promise。
 */

import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useThemeStore } from '@/stores/theme.store';
import type { Theme } from '@/types/config';

/** Composable 配置项 */
export interface UseThemeOptions {
    /** 是否在组件挂载后自动初始化主题，默认 true */
    autoInit?: boolean;
}

/** useTheme 返回值 */
export interface UseThemeReturn {
    /** 所有可用主题列表 */
    themes: ComputedRef<Theme[]>;
    /** 当前生效的主题 */
    currentTheme: ComputedRef<Theme | undefined>;
    /** 当前选中的主题 ID */
    selectedThemeId: ComputedRef<string | null>;
    /** 默认主题 ID */
    defaultThemeId: ComputedRef<string>;
    /** 当前是否为深色主题 */
    isDark: ComputedRef<boolean>;
    /** store 是否已完成初始化 */
    isReady: ComputedRef<boolean>;
    /** 是否正在初始化中 */
    isInitializing: Ref<boolean>;
    /** 初始化错误信息 */
    initError: Ref<string | null>;
    /** 是否正在跟随系统深色偏好 */
    isFollowingSystem: ComputedRef<boolean>;
    /** 系统当前是否偏好深色 */
    systemPrefersDark: ComputedRef<boolean>;
    /** 主题选项（与 themes 一致，供选择器使用） */
    themeOptions: ComputedRef<Theme[]>;
    /** 所有可用主题 ID 列表 */
    availableThemeIds: ComputedRef<string[]>;
    /** store 内部错误信息 */
    storeError: ComputedRef<string | null>;

    /** 手动初始化主题 */
    initialize: () => Promise<void>;
    /** 切换并持久化指定主题 */
    setTheme: (themeId: string) => Promise<void>;
    /** 跟随系统深色偏好 */
    followSystemTheme: () => Promise<void>;
    /** 切换跟随系统状态 */
    toggleFollowSystem: () => Promise<void>;
    /** 切换到下一个主题（循环） */
    cycleTheme: () => Promise<void>;
    /** cycleTheme 的别名 */
    nextTheme: () => Promise<void>;
    /** 切换到上一个主题（循环） */
    previousTheme: () => Promise<void>;
    /** 重新加载主题配置 */
    refreshThemes: () => Promise<void>;
    /** 获取当前应使用的默认主题 ID */
    resolveDefaultThemeId: () => string;
}

/**
 * 主题相关组合式函数
 * @param options 配置项
 */
export function useTheme(options: UseThemeOptions = {}): UseThemeReturn {
    const { autoInit = true } = options;

    const store = useThemeStore();
    const abortController = new AbortController();
    const { signal } = abortController;

    const isInitializing = ref(false);
    const initError = ref<string | null>(null);
    let initPromise: Promise<void> | null = null;

    /**
     * 初始化主题配置与已保存主题
     * 重复调用会复用同一 Promise；组件卸载后调用将直接 resolve。
     */
    async function initialize(): Promise<void> {
        if (initPromise) {
            return initPromise;
        }

        if (signal.aborted) {
            return;
        }

        isInitializing.value = true;
        initError.value = null;

        initPromise = (async () => {
            try {
                await store.initialize();

                if (signal.aborted) {
                    return;
                }
            } catch (err) {
                if (signal.aborted) {
                    return;
                }
                const message = err instanceof Error ? err.message : String(err);
                initError.value = message;
                throw err;
            } finally {
                if (!signal.aborted) {
                    isInitializing.value = false;
                }
            }
        })();

        try {
            await initPromise;
        } finally {
            initPromise = null;
        }
    }

    /**
     * 切换并持久化指定主题
     */
    function setTheme(themeId: string): Promise<void> {
        if (signal.aborted) {
            return Promise.resolve();
        }
        return store.setTheme(themeId);
    }

    /**
     * 跟随系统深色偏好
     */
    function followSystemTheme(): Promise<void> {
        if (signal.aborted) {
            return Promise.resolve();
        }
        return store.followSystemTheme();
    }

    /**
     * 切换跟随系统状态：已跟随则切回默认主题，否则启用跟随
     */
    async function toggleFollowSystem(): Promise<void> {
        if (signal.aborted) {
            return;
        }
        if (store.followSystem) {
            await store.setTheme(store.resolveDefaultThemeId());
        } else {
            await store.followSystemTheme();
        }
    }

    /**
     * 切换到下一个主题（循环）
     */
    function cycleTheme(): Promise<void> {
        if (signal.aborted) {
            return Promise.resolve();
        }
        return store.cycleTheme();
    }

    /**
     * cycleTheme 的别名
     */
    function nextTheme(): Promise<void> {
        return cycleTheme();
    }

    /**
     * 切换到上一个主题（循环）
     */
    function previousTheme(): Promise<void> {
        if (signal.aborted) {
            return Promise.resolve();
        }
        const themes = store.themes;
        if (themes.length === 0) {
            return Promise.resolve();
        }

        const currentIndex = themes.findIndex(t => t.id === store.selectedThemeId);
        const previousIndex =
            currentIndex === -1
                ? themes.length - 1
                : (currentIndex - 1 + themes.length) % themes.length;

        return store.setTheme(themes[previousIndex].id);
    }

    /**
     * 重新加载主题配置并应用当前主题
     */
    function refreshThemes(): Promise<void> {
        if (signal.aborted) {
            return Promise.resolve();
        }
        return store.refreshThemes();
    }

    onMounted(() => {
        if (autoInit) {
            initialize().catch(() => {
                // 自动初始化失败时由 initError ref 承载错误，不向上抛
            });
        }
    });

    onUnmounted(() => {
        abortController.abort();
    });

    return {
        // 状态
        themes: computed(() => store.themes),
        currentTheme: computed(() => store.currentTheme),
        selectedThemeId: computed(() => store.selectedThemeId),
        defaultThemeId: computed(() => store.defaultThemeId),
        isDark: computed(() => store.isDark),
        isReady: computed(() => store.isReady),
        isInitializing,
        initError,
        isFollowingSystem: computed(() => store.followSystem),
        systemPrefersDark: computed(() => store.systemPrefersDark),
        themeOptions: computed(() => store.themeOptions),
        availableThemeIds: computed(() => store.availableThemeIds),
        storeError: computed(() => store.error),

        // 方法
        initialize,
        setTheme,
        followSystemTheme,
        toggleFollowSystem,
        cycleTheme,
        nextTheme,
        previousTheme,
        refreshThemes,
        resolveDefaultThemeId: store.resolveDefaultThemeId,
    };
}

export default useTheme;
