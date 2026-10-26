/**
 * theme.store 单元测试
 *
 * 主题配置采用「主题族 + 明/暗变体」结构：每族有 `<family>-light` / `<family>-dark`
 * 两个变体，legacyIds 记录旧版裸 ID 的迁移目标。
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useThemeStore } from '../theme.store';
import { storageManager } from '@/services/storage.service';
import { loadThemes } from '@/services/config.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { Theme, ThemeConfig } from '@/types/config';

vi.mock('@/services/config.service', () => ({
    loadThemes: vi.fn(),
    loadConfig: vi.fn(),
    loadSearchEngines: vi.fn(),
    loadDefaultData: vi.fn(),
    clearConfigCache: vi.fn(),
}));

/** 构造一份最小可用的调色板，只关心 primary / surface 等少数键 */
function makeColors(primary: string, surface: string, onSurface: string): Record<string, string> {
    return {
        '--md-sys-color-primary': primary,
        '--md-sys-color-on-primary': '#FFFFFF',
        '--md-sys-color-primary-container': '#FFD8E1',
        '--md-sys-color-on-primary-container': '#3D001F',
        '--md-sys-color-secondary': '#7D5F65',
        '--md-sys-color-on-secondary': '#FFFFFF',
        '--md-sys-color-secondary-container': '#FFD8E1',
        '--md-sys-color-on-secondary-container': '#2A1519',
        '--md-sys-color-tertiary': '#8B6E3D',
        '--md-sys-color-on-tertiary': '#FFFFFF',
        '--md-sys-color-tertiary-container': '#FFDEA7',
        '--md-sys-color-on-tertiary-container': '#2A1800',
        '--md-sys-color-surface': surface,
        '--md-sys-color-surface-variant': '#F3DDE2',
        '--md-sys-color-on-surface': onSurface,
        '--md-sys-color-on-surface-variant': '#534345',
        '--md-sys-color-background': surface,
        '--md-sys-color-on-background': onSurface,
        '--md-sys-color-outline': '#847376',
        '--md-sys-color-error': '#BA1A1A',
        '--md-sys-color-success': '#376B2F',
        '--md-sys-color-inverse-surface': onSurface,
        '--md-sys-color-inverse-on-surface': surface,
    };
}

function makeTheme(
    id: string,
    family: string,
    mode: 'light' | 'dark',
    name: string,
    primary: string,
    surface: string,
    onSurface: string,
): Theme {
    return {
        id,
        family,
        mode,
        isDark: mode === 'dark',
        name,
        description: `${name}描述`,
        logo: 'image/logo/mugen.png',
        colors: makeColors(primary, surface, onSurface),
    };
}

const mockThemes: ThemeConfig = {
    defaultTheme: 'material-rose-light',
    legacyIds: {
        'material-rose': 'material-rose-light',
        'midnight-rose': 'midnight-rose-dark',
    },
    themes: [
        makeTheme('material-rose-light', 'material-rose', 'light', 'Mugen娘经典', '#B14A6B', '#FFF8F9', '#201A1A'),
        makeTheme('material-rose-dark', 'material-rose', 'dark', 'Mugen娘经典', '#E8A2B4', '#1D191A', '#EEECED'),
        makeTheme('midnight-rose-light', 'midnight-rose', 'light', '午夜蔷薇', '#B3261E', '#FFF8F8', '#1A1110'),
        makeTheme('midnight-rose-dark', 'midnight-rose', 'dark', '午夜蔷薇', '#8B0000', '#1A1A1A', '#E8E8E8'),
    ],
};

function createMatchMedia(matches: boolean): MediaQueryList {
    const listeners = new Set<EventListenerOrEventListenerObject>();
    return {
        matches,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
            if (type === 'change') {
                listeners.add(listener);
            }
        }),
        removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
            if (type === 'change') {
                listeners.delete(listener);
            }
        }),
        dispatchEvent: vi.fn((event: Event) => {
            listeners.forEach(listener => {
                if (typeof listener === 'function') {
                    listener(event);
                } else {
                    listener.handleEvent(event);
                }
            });
            return true;
        }),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    } as unknown as MediaQueryList;
}

describe('useThemeStore', () => {
    let matchMediaMock: MediaQueryList;

    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
        document.documentElement.removeAttribute('style');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');

        vi.mocked(loadThemes).mockResolvedValue(mockThemes);

        matchMediaMock = createMatchMedia(false);
        window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('初始化后应加载主题列表并应用默认主题', async () => {
        const store = useThemeStore();
        await store.initialize();

        expect(store.isReady).toBe(true);
        expect(store.themes).toHaveLength(4);
        expect(store.defaultThemeId).toBe('material-rose-light');
        expect(store.selectedThemeId).toBe('material-rose-light');
        expect(store.isDark).toBe(false);
        expect(store.currentMode).toBe('light');
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#B14A6B');
        expect(document.documentElement.style.getPropertyValue('--md-primary')).toBe('#B14A6B');
        expect(document.documentElement.getAttribute('data-theme')).toBe('material-rose-light');
        expect(document.body.classList.contains('dark-mode')).toBe(false);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
        // RGB 三元组要跟随主题，供 rgba(var(--md-sys-color-surface-rgb), .9) 这类混色使用
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-surface-rgb'))
            .toBe('255, 248, 249');
    });

    it('初始化时应持久化默认主题到 StorageManager', async () => {
        const store = useThemeStore();
        await store.initialize();

        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBe('material-rose-light');
        // 首屏同步镜像也要写进去，theme-preload.js 才能提前上色
        expect(storageManager.getSync(STORAGE_KEYS.SELECTED_THEME)).toBe('material-rose-light');
    });

    it('应读取并应用已保存的主题', async () => {
        await storageManager.set(STORAGE_KEYS.SELECTED_THEME, 'midnight-rose-dark');

        const store = useThemeStore();
        await store.initialize();

        expect(store.selectedThemeId).toBe('midnight-rose-dark');
        expect(store.isDark).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#8B0000');
        expect(document.body.classList.contains('dark-mode')).toBe(true);
        // html 上也要有：组件里的深色覆盖写的是 `:global(html.dark-mode) .child`
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    });

    it('旧版裸 ID 应按 legacyIds 迁移到对应变体并写回存储', async () => {
        await storageManager.set(STORAGE_KEYS.SELECTED_THEME, 'midnight-rose');

        const store = useThemeStore();
        await store.initialize();

        expect(store.selectedThemeId).toBe('midnight-rose-dark');
        expect(store.isDark).toBe(true);
        expect(await storageManager.get(STORAGE_KEYS.SELECTED_THEME)).toBe('midnight-rose-dark');
    });

    it('未保存主题且系统偏好深色时应用默认主题族的深色变体', async () => {
        matchMediaMock = createMatchMedia(true);
        window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

        const store = useThemeStore();
        await store.initialize();

        expect(store.systemPrefersDark).toBe(true);
        // 默认族不变，只换成深色那一半
        expect(store.selectedThemeId).toBe('material-rose-dark');
        expect(store.isDark).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('themeFamilies 应把同族明暗变体合并为一项', async () => {
        const store = useThemeStore();
        await store.initialize();

        expect(store.themeFamilies).toHaveLength(2);
        const rose = store.themeFamilies[0];
        expect(rose.id).toBe('material-rose');
        expect(rose.name).toBe('Mugen娘经典');
        expect(rose.light?.id).toBe('material-rose-light');
        expect(rose.dark?.id).toBe('material-rose-dark');
        expect(store.currentFamilyId).toBe('material-rose');
    });

    it('setMode 应在同族内切换明暗并持久化', async () => {
        const store = useThemeStore();
        await store.initialize();

        await store.setMode('dark');

        expect(store.selectedThemeId).toBe('material-rose-dark');
        expect(store.currentFamilyId).toBe('material-rose');
        expect(store.isDark).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);
        expect(await storageManager.get(STORAGE_KEYS.SELECTED_THEME)).toBe('material-rose-dark');

        await store.setMode('light');

        expect(store.selectedThemeId).toBe('material-rose-light');
        expect(store.isDark).toBe(false);
    });

    it('setMode 传入当前已生效的模式时不做任何变更', async () => {
        const store = useThemeStore();
        await store.initialize();

        const setSpy = vi.spyOn(storageManager, 'set');
        await store.setMode('light');

        expect(store.selectedThemeId).toBe('material-rose-light');
        expect(setSpy).not.toHaveBeenCalled();
        setSpy.mockRestore();
    });

    it('normalizeThemeId 应处理直接命中 / 迁移 / 族名兜底', async () => {
        const store = useThemeStore();
        await store.initialize();

        expect(store.normalizeThemeId('material-rose-dark')).toBe('material-rose-dark');
        expect(store.normalizeThemeId('material-rose')).toBe('material-rose-light');
        // 族名兜底：按当前系统模式取变体（此处为明亮）
        expect(store.normalizeThemeId('midnight-rose')).toBe('midnight-rose-dark');
        expect(store.normalizeThemeId('不存在')).toBeNull();
        expect(store.normalizeThemeId(null)).toBeNull();
    });

    it('setTheme 应应用主题、持久化并更新 body 类', async () => {
        const store = useThemeStore();
        await store.initialize();

        await store.setTheme('midnight-rose-dark');

        expect(store.selectedThemeId).toBe('midnight-rose-dark');
        expect(store.isDark).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);

        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBe('midnight-rose-dark');
    });

    it('setTheme 传入未知主题时应抛出异常且不改变状态', async () => {
        const store = useThemeStore();
        await store.initialize();

        await expect(store.setTheme('unknown-theme')).rejects.toThrow();
        expect(store.selectedThemeId).toBe('material-rose-light');
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#B14A6B');
    });

    it('setTheme 持久化失败时应回滚状态与 DOM', async () => {
        const store = useThemeStore();
        await store.initialize();

        const setSpy = vi.spyOn(storageManager, 'set').mockRejectedValueOnce(new Error('Storage failed'));

        await expect(store.setTheme('midnight-rose-dark')).rejects.toThrow('Storage failed');

        expect(store.selectedThemeId).toBe('material-rose-light');
        expect(store.isDark).toBe(false);
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#B14A6B');
        expect(document.body.classList.contains('dark-mode')).toBe(false);

        setSpy.mockRestore();
    });

    it('followSystemTheme 应清除持久化并保留当前主题族、切到系统模式', async () => {
        matchMediaMock = createMatchMedia(true);
        window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

        const store = useThemeStore();
        await store.initialize();
        await store.setTheme('material-rose-light');

        await store.followSystemTheme();

        expect(store.followSystem).toBe(true);
        expect(store.selectedThemeId).toBe('material-rose-dark');
        expect(store.currentFamilyId).toBe('material-rose');
        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBeNull();
    });

    it('followSystemTheme 持久化失败时应回滚', async () => {
        const store = useThemeStore();
        await store.initialize();
        await store.setTheme('midnight-rose-dark');

        const removeSpy = vi.spyOn(storageManager, 'remove').mockRejectedValueOnce(new Error('Remove failed'));

        await expect(store.followSystemTheme()).rejects.toThrow('Remove failed');

        expect(store.selectedThemeId).toBe('midnight-rose-dark');
        expect(store.followSystem).toBe(false);
        removeSpy.mockRestore();
    });

    it('系统深色偏好变化时应保持主题族、只切换明暗', async () => {
        matchMediaMock = createMatchMedia(false);
        window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

        const store = useThemeStore();
        await store.initialize();
        await store.followSystemTheme();
        expect(store.selectedThemeId).toBe('material-rose-light');

        const darkMatchMedia = createMatchMedia(true);
        window.matchMedia = vi.fn().mockReturnValue(darkMatchMedia);
        const changeEvent = new Event('change') as Event & { matches: boolean };
        changeEvent.matches = true;
        (matchMediaMock.dispatchEvent as ReturnType<typeof vi.fn>)(changeEvent);

        expect(store.systemPrefersDark).toBe(true);
        expect(store.selectedThemeId).toBe('material-rose-dark');
    });

    it('cycleTheme 应循环切换到下一个主题族并保持明暗模式', async () => {
        const store = useThemeStore();
        await store.initialize();

        await store.cycleTheme();

        expect(store.selectedThemeId).toBe('midnight-rose-light');
        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBe('midnight-rose-light');

        await store.cycleTheme();
        expect(store.selectedThemeId).toBe('material-rose-light');
    });

    it('cycleTheme 在深色模式下应切到下一族的深色变体', async () => {
        const store = useThemeStore();
        await store.initialize();
        await store.setMode('dark');

        await store.cycleTheme();

        expect(store.selectedThemeId).toBe('midnight-rose-dark');
    });

    it('refreshThemes 应重新加载配置并保持当前主题', async () => {
        const store = useThemeStore();
        await store.initialize();
        await store.setTheme('midnight-rose-dark');

        vi.mocked(loadThemes).mockResolvedValueOnce({
            ...mockThemes,
            defaultTheme: 'midnight-rose-dark',
        });

        await store.refreshThemes();

        expect(store.defaultThemeId).toBe('midnight-rose-dark');
        expect(store.selectedThemeId).toBe('midnight-rose-dark');
    });

    it('currentTheme 应返回当前主题配置', async () => {
        const store = useThemeStore();
        await store.initialize();

        expect(store.currentTheme?.id).toBe('material-rose-light');
        expect(store.currentTheme?.mode).toBe('light');
    });

    it('themeOptions 与 availableThemeIds getter 应正确暴露主题列表', async () => {
        const store = useThemeStore();
        await store.initialize();

        expect(store.themeOptions).toHaveLength(4);
        expect(store.availableThemeIds).toEqual([
            'material-rose-light',
            'material-rose-dark',
            'midnight-rose-light',
            'midnight-rose-dark',
        ]);
    });

    it('兼容缺少 family / mode 的旧配置（按 id 与 isDark 兜底）', async () => {
        vi.mocked(loadThemes).mockResolvedValueOnce({
            defaultTheme: 'legacy-light',
            themes: [
                {
                    id: 'legacy-light',
                    name: '旧亮色',
                    description: '旧配置',
                    logo: 'image/logo/mugen.png',
                    colors: makeColors('#B14A6B', '#FFF8F9', '#201A1A'),
                },
                {
                    id: 'legacy-dark',
                    name: '旧深色',
                    description: '旧配置',
                    logo: 'image/logo/mugen.png',
                    isDark: true,
                    colors: makeColors('#E8A2B4', '#1D191A', '#EEECED'),
                },
            ],
        });

        const store = useThemeStore();
        await store.initialize();

        expect(store.selectedThemeId).toBe('legacy-light');
        expect(store.currentMode).toBe('light');
        // 没有 family 字段时，每个 id 自成一族
        expect(store.themeFamilies).toHaveLength(2);
        expect(store.currentFamilyId).toBe('legacy-light');

        await store.setTheme('legacy-dark');
        expect(store.isDark).toBe(true);
        expect(store.currentMode).toBe('dark');
    });

    it('主题切换应触发 themeChanged 自定义事件', async () => {
        const store = useThemeStore();
        await store.initialize();

        const listener = vi.fn();
        window.addEventListener('themeChanged', listener);

        await store.setTheme('midnight-rose-dark');

        expect(listener).toHaveBeenCalled();
        const event = listener.mock.calls[0][0] as CustomEvent;
        expect(event.detail.themeId).toBe('midnight-rose-dark');

        window.removeEventListener('themeChanged', listener);
    });
});
