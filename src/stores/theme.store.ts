/**
 * 主题状态管理（Pinia Store）
 *
 * 职责：
 * - 管理当前主题 ID、深色模式状态、主题列表
 * - 加载并缓存 public/config/themes.json
 * - 将主题 CSS 变量注入 document.documentElement
 * - 监听系统深色偏好变化
 * - 所有变更持久化到 StorageManager（键名 selectedTheme）
 *
 * 与原项目 js/ThemeManager.js 行为保持一致：
 * - 默认主题为 themes.json 中的 defaultTheme
 * - 未保存主题且系统偏好深色时，自动选择首个深色主题
 * - 应用主题时同时注入基础 colors 与派生变量
 * - 深色主题为 body 添加 dark-mode 类
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { storageManager } from '@/services/storage.service';
import { loadThemes } from '@/services/config.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { Theme } from '@/types/config';
import { adjustColor, hexToRgba } from '@/utils/color.util';

/** 派生 CSS 变量名集合 */
const DERIVED_VARIABLES = [
    '--md-primary',
    '--md-primary-dark',
    '--md-primary-light',
    '--md-primary-container',
    '--md-secondary',
    '--md-secondary-container',
    '--md-background',
    '--md-surface',
    '--md-surface-variant',
    '--md-surface-2',
    '--md-on-primary',
    '--md-on-background',
    '--md-on-surface',
    '--md-outline',
    '--md-shadow',
] as const;

/** 获取系统深色偏好媒体查询对象 */
function getDarkModeMediaQuery(): MediaQueryList | null {
    if (typeof window === 'undefined' || !window.matchMedia) {
        return null;
    }
    return window.matchMedia('(prefers-color-scheme: dark)');
}

export const useThemeStore = defineStore('theme', () => {
    // State
    const themes = ref<Theme[]>([]);
    const defaultThemeId = ref<string>('material-rose');
    const selectedThemeId = ref<string | null>(null);
    const systemPrefersDark = ref<boolean>(false);
    const followSystem = ref<boolean>(false);
    const isReady = ref<boolean>(false);
    const error = ref<string | null>(null);

    // Getters
    const currentTheme = computed<Theme | undefined>(() => {
        const id = selectedThemeId.value || defaultThemeId.value;
        return themes.value.find(theme => theme.id === id);
    });

    const isDark = computed<boolean>(() => {
        if (currentTheme.value) {
            return !!currentTheme.value.isDark;
        }
        return systemPrefersDark.value;
    });

    const themeOptions = computed<Theme[]>(() => themes.value);

    const availableThemeIds = computed<string[]>(() => themes.value.map(t => t.id));

    // Helpers
    /**
     * 获取默认主题 ID
     * 若未保存主题且系统偏好深色，返回第一个可用的深色主题；否则返回配置 defaultTheme
     */
    function resolveDefaultThemeId(): string {
        if (systemPrefersDark.value) {
            const firstDark = themes.value.find(theme => theme.isDark);
            if (firstDark) {
                return firstDark.id;
            }
        }
        return defaultThemeId.value;
    }

    /**
     * 计算并注入派生 CSS 变量
     */
    function injectDerivedVariables(theme: Theme): void {
        if (typeof document === 'undefined') {
            return;
        }

        const root = document.documentElement;
        const primary = theme.colors['--md-sys-color-primary'];
        const surface = theme.colors['--md-sys-color-surface'];

        root.style.setProperty('--md-primary', primary);
        root.style.setProperty('--md-primary-dark', adjustColor(primary, -15));
        root.style.setProperty('--md-primary-light', adjustColor(primary, 15));
        root.style.setProperty('--md-primary-container', theme.colors['--md-sys-color-primary-container']);
        root.style.setProperty('--md-secondary', theme.colors['--md-sys-color-secondary']);
        root.style.setProperty('--md-secondary-container', theme.colors['--md-sys-color-secondary-container']);
        root.style.setProperty('--md-background', surface);
        root.style.setProperty('--md-surface', hexToRgba(surface, 0.85));
        root.style.setProperty('--md-surface-variant', theme.colors['--md-sys-color-surface-variant']);
        root.style.setProperty('--md-surface-2', hexToRgba(surface, 0.7));
        root.style.setProperty('--md-on-primary', theme.colors['--md-sys-color-on-primary']);
        root.style.setProperty('--md-on-background', theme.colors['--md-sys-color-on-surface']);
        root.style.setProperty('--md-on-surface', theme.colors['--md-sys-color-on-surface-variant']);
        root.style.setProperty('--md-outline', theme.colors['--md-sys-color-surface-variant']);
        root.style.setProperty('--md-shadow', hexToRgba(primary, 0.15));
    }

    /**
     * 注入主题基础颜色变量
     */
    function injectBaseVariables(theme: Theme): void {
        if (typeof document === 'undefined') {
            return;
        }
        const root = document.documentElement;
        Object.entries(theme.colors).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }

    /**
     * 清除所有注入的 CSS 变量
     */
    function clearInjectedVariables(): void {
        if (typeof document === 'undefined') {
            return;
        }
        const root = document.documentElement;
        Object.keys(currentTheme.value?.colors ?? {}).forEach(key => {
            root.style.removeProperty(key);
        });
        DERIVED_VARIABLES.forEach(key => {
            root.style.removeProperty(key);
        });
    }

    /**
     * 更新 body 的 dark-mode 类
     */
    function updateBodyClass(dark: boolean): void {
        if (typeof document === 'undefined') {
            return;
        }
        if (dark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    /**
     * 应用指定主题到 DOM 与状态（不持久化）
     */
    function applyThemeToDom(themeId: string): Theme | null {
        const theme = themes.value.find(t => t.id === themeId);
        if (!theme) {
            console.error(`ThemeStore: 找不到主题 ${themeId}`);
            return null;
        }

        injectBaseVariables(theme);
        injectDerivedVariables(theme);
        updateBodyClass(!!theme.isDark);
        selectedThemeId.value = theme.id;

        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { themeId: theme.id, theme } }));
        return theme;
    }

    /**
     * 加载主题配置与已保存主题
     * 应用默认或已保存主题，并启动系统深色偏好监听
     */
    async function initialize(): Promise<void> {
        error.value = null;

        try {
            const config = await loadThemes();
            if (config) {
                themes.value = config.themes;
                defaultThemeId.value = config.defaultTheme || config.themes[0]?.id || 'material-rose';
            }

            const mediaQuery = getDarkModeMediaQuery();
            if (mediaQuery) {
                systemPrefersDark.value = mediaQuery.matches;
                mediaQuery.addEventListener('change', handleSystemDarkChange);
            }

            const savedTheme = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
            const hasSavedTheme = typeof savedTheme === 'string';
            const initialThemeId = hasSavedTheme
                ? savedTheme
                : resolveDefaultThemeId();

            applyThemeToDom(initialThemeId);

            // 首次使用默认主题时同步持久化，保证首屏与 StorageManager 一致
            if (!hasSavedTheme) {
                try {
                    await storageManager.set(STORAGE_KEYS.SELECTED_THEME, initialThemeId);
                } catch (err) {
                    console.warn('ThemeStore: 持久化默认主题失败', err);
                }
            }

            isReady.value = true;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error.value = message;
            console.error('ThemeStore: 初始化失败', message);
            throw err;
        }
    }

    /**
     * 主动设置并持久化当前主题
     * 写操作返回前已完成持久化；失败时回滚本地状态与 DOM
     */
    async function setTheme(themeId: string): Promise<void> {
        const previousThemeId = selectedThemeId.value;
        const previousFollowSystem = followSystem.value;

        const theme = applyThemeToDom(themeId);
        if (!theme) {
            throw new Error(`ThemeStore: 无法应用未知主题 ${themeId}`);
        }

        followSystem.value = false;

        try {
            await storageManager.set(STORAGE_KEYS.SELECTED_THEME, themeId);
        } catch (err) {
            // 持久化失败：回滚本地状态与 DOM
            followSystem.value = previousFollowSystem;
            if (previousThemeId) {
                applyThemeToDom(previousThemeId);
            } else {
                clearInjectedVariables();
                selectedThemeId.value = previousThemeId;
            }
            throw err;
        }
    }

    /**
     * 跟随系统深色偏好
     * 清除持久化主题，后续系统偏好变化时自动切换
     */
    async function followSystemTheme(): Promise<void> {
        const previousThemeId = selectedThemeId.value;
        const previousFollowSystem = followSystem.value;

        followSystem.value = true;
        const targetId = resolveDefaultThemeId();
        applyThemeToDom(targetId);

        try {
            await storageManager.remove(STORAGE_KEYS.SELECTED_THEME);
        } catch (err) {
            // 持久化失败：回滚
            followSystem.value = previousFollowSystem;
            if (previousThemeId) {
                applyThemeToDom(previousThemeId);
            } else {
                clearInjectedVariables();
                selectedThemeId.value = previousThemeId;
            }
            throw err;
        }
    }

    /**
     * 系统深色偏好变化处理器
     */
    function handleSystemDarkChange(event: MediaQueryListEvent): void {
        systemPrefersDark.value = event.matches;
        if (followSystem.value || !selectedThemeId.value) {
            const targetId = resolveDefaultThemeId();
            applyThemeToDom(targetId);
        }
    }

    /**
     * 手动刷新主题配置（重新加载 themes.json）
     */
    async function refreshThemes(): Promise<void> {
        const config = await loadThemes();
        if (config) {
            themes.value = config.themes;
            defaultThemeId.value = config.defaultTheme || config.themes[0]?.id || 'material-rose';
        }
        const currentId = selectedThemeId.value || defaultThemeId.value;
        applyThemeToDom(currentId);
    }

    /**
     * 切换为下一个主题（循环）
     */
    async function cycleTheme(): Promise<void> {
        if (themes.value.length === 0) {
            return;
        }
        const currentIndex = themes.value.findIndex(t => t.id === selectedThemeId.value);
        const nextIndex = currentIndex === -1
            ? 0
            : (currentIndex + 1) % themes.value.length;
        await setTheme(themes.value[nextIndex].id);
    }

    return {
        // State
        themes,
        defaultThemeId,
        selectedThemeId,
        systemPrefersDark,
        followSystem,
        isReady,
        error,
        // Getters
        currentTheme,
        isDark,
        themeOptions,
        availableThemeIds,
        // Actions
        initialize,
        setTheme,
        followSystemTheme,
        refreshThemes,
        cycleTheme,
        resolveDefaultThemeId,
    };
});
