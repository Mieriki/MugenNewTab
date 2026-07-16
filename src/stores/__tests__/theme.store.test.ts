/**
 * theme.store 单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useThemeStore } from '../theme.store';
import { storageManager } from '@/services/storage.service';
import { loadThemes } from '@/services/config.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { ThemeConfig } from '@/types/config';

vi.mock('@/services/config.service', () => ({
    loadThemes: vi.fn(),
    loadConfig: vi.fn(),
    loadSearchEngines: vi.fn(),
    loadDefaultData: vi.fn(),
    clearConfigCache: vi.fn(),
}));

const mockThemes: ThemeConfig = {
    defaultTheme: 'material-rose',
    themes: [
        {
            id: 'material-rose',
            name: 'Mugen娘经典',
            description: '温柔玫粉，如初春樱花',
            logo: 'image/logo/mugen.png',
            isDark: false,
            colors: {
                '--md-sys-color-primary': '#B14A6B',
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
                '--md-sys-color-surface': '#FFF8F9',
                '--md-sys-color-surface-variant': '#F3DDE2',
                '--md-sys-color-on-surface': '#201A1A',
                '--md-sys-color-on-surface-variant': '#534345',
                '--md-sys-color-background': '#FFF8F9',
                '--md-sys-color-on-background': '#201A1A',
                '--md-sys-color-outline': '#847376',
                '--md-sys-color-error': '#BA1A1A',
                '--md-sys-color-success': '#376B2F',
                '--md-sys-color-inverse-surface': '#201A1A',
                '--md-sys-color-inverse-on-surface': '#F3DDE2',
            },
        },
        {
            id: 'midnight-rose',
            name: '午夜蔷薇',
            description: '深邃红与黑，神秘优雅',
            logo: 'image/logo/mugen.png',
            isDark: true,
            colors: {
                '--md-sys-color-primary': '#8B0000',
                '--md-sys-color-on-primary': '#FFFFFF',
                '--md-sys-color-primary-container': '#2A0000',
                '--md-sys-color-on-primary-container': '#410002',
                '--md-sys-color-secondary': '#2C2C2C',
                '--md-sys-color-on-secondary': '#FFFFFF',
                '--md-sys-color-secondary-container': '#2A0000',
                '--md-sys-color-on-secondary-container': '#EF9A9A',
                '--md-sys-color-tertiary': '#D4AF37',
                '--md-sys-color-on-tertiary': '#1A1A1A',
                '--md-sys-color-tertiary-container': '#3D3000',
                '--md-sys-color-on-tertiary-container': '#FFE082',
                '--md-sys-color-surface': '#1A1A1A',
                '--md-sys-color-surface-variant': '#2C2C2C',
                '--md-sys-color-on-surface': '#E8E8E8',
                '--md-sys-color-on-surface-variant': '#B0B0B0',
                '--md-sys-color-background': '#121212',
                '--md-sys-color-on-background': '#E8E8E8',
                '--md-sys-color-outline': '#424242',
                '--md-sys-color-error': '#EF5350',
                '--md-sys-color-success': '#66BB6A',
                '--md-sys-color-inverse-surface': '#E8E8E8',
                '--md-sys-color-inverse-on-surface': '#1A1A1A',
            },
        },
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
        expect(store.themes).toHaveLength(2);
        expect(store.defaultThemeId).toBe('material-rose');
        expect(store.selectedThemeId).toBe('material-rose');
        expect(store.isDark).toBe(false);
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#B14A6B');
        expect(document.documentElement.style.getPropertyValue('--md-primary')).toBe('#B14A6B');
        expect(document.body.classList.contains('dark-mode')).toBe(false);
    });

    it('初始化时应持久化默认主题到 StorageManager', async () => {
        const store = useThemeStore();
        await store.initialize();

        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBe('material-rose');
        expect(localStorage.getItem(STORAGE_KEYS.SELECTED_THEME)).toBe('material-rose');
    });

    it('应读取并应用已保存的主题', async () => {
        await storageManager.set(STORAGE_KEYS.SELECTED_THEME, 'midnight-rose');

        const store = useThemeStore();
        await store.initialize();

        expect(store.selectedThemeId).toBe('midnight-rose');
        expect(store.isDark).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#8B0000');
        expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('未保存主题且系统偏好深色时应选择首个深色主题', async () => {
        matchMediaMock = createMatchMedia(true);
        window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

        const store = useThemeStore();
        await store.initialize();

        expect(store.systemPrefersDark).toBe(true);
        expect(store.selectedThemeId).toBe('midnight-rose');
        expect(store.isDark).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('setTheme 应应用主题、持久化并更新 body 类', async () => {
        const store = useThemeStore();
        await store.initialize();

        await store.setTheme('midnight-rose');

        expect(store.selectedThemeId).toBe('midnight-rose');
        expect(store.isDark).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);

        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBe('midnight-rose');
    });

    it('setTheme 传入未知主题时应抛出异常且不改变状态', async () => {
        const store = useThemeStore();
        await store.initialize();

        await expect(store.setTheme('unknown-theme')).rejects.toThrow();
        expect(store.selectedThemeId).toBe('material-rose');
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#B14A6B');
    });

    it('setTheme 持久化失败时应回滚状态与 DOM', async () => {
        const store = useThemeStore();
        await store.initialize();

        const setSpy = vi.spyOn(storageManager, 'set').mockRejectedValueOnce(new Error('Storage failed'));

        await expect(store.setTheme('midnight-rose')).rejects.toThrow('Storage failed');

        expect(store.selectedThemeId).toBe('material-rose');
        expect(store.isDark).toBe(false);
        expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#B14A6B');
        expect(document.body.classList.contains('dark-mode')).toBe(false);

        setSpy.mockRestore();
    });

    it('followSystemTheme 应清除持久化并应用系统偏好主题', async () => {
        matchMediaMock = createMatchMedia(true);
        window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

        const store = useThemeStore();
        await store.initialize();
        await store.setTheme('material-rose');

        await store.followSystemTheme();

        expect(store.followSystem).toBe(true);
        expect(store.selectedThemeId).toBe('midnight-rose');
        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBeNull();
    });

    it('followSystemTheme 持久化失败时应回滚', async () => {
        const store = useThemeStore();
        await store.initialize();
        await store.setTheme('midnight-rose');

        const removeSpy = vi.spyOn(storageManager, 'remove').mockRejectedValueOnce(new Error('Remove failed'));

        await expect(store.followSystemTheme()).rejects.toThrow('Remove failed');

        expect(store.selectedThemeId).toBe('midnight-rose');
        expect(store.followSystem).toBe(false);
        removeSpy.mockRestore();
    });

    it('系统深色偏好变化时应自动切换主题（followSystem 模式）', async () => {
        matchMediaMock = createMatchMedia(false);
        window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

        const store = useThemeStore();
        await store.initialize();
        await store.followSystemTheme();
        expect(store.selectedThemeId).toBe('material-rose');

        const darkMatchMedia = createMatchMedia(true);
        window.matchMedia = vi.fn().mockReturnValue(darkMatchMedia);
        const changeEvent = new Event('change') as Event & { matches: boolean };
        changeEvent.matches = true;
        (matchMediaMock.dispatchEvent as ReturnType<typeof vi.fn>)(changeEvent);

        expect(store.systemPrefersDark).toBe(true);
        expect(store.selectedThemeId).toBe('midnight-rose');
    });

    it('cycleTheme 应循环切换到下一个主题并持久化', async () => {
        const store = useThemeStore();
        await store.initialize();

        await store.cycleTheme();

        expect(store.selectedThemeId).toBe('midnight-rose');
        const saved = await storageManager.get(STORAGE_KEYS.SELECTED_THEME);
        expect(saved).toBe('midnight-rose');

        await store.cycleTheme();
        expect(store.selectedThemeId).toBe('material-rose');
    });

    it('refreshThemes 应重新加载配置并保持当前主题', async () => {
        const store = useThemeStore();
        await store.initialize();
        await store.setTheme('midnight-rose');

        vi.mocked(loadThemes).mockResolvedValueOnce({
            ...mockThemes,
            defaultTheme: 'midnight-rose',
        });

        await store.refreshThemes();

        expect(store.defaultThemeId).toBe('midnight-rose');
        expect(store.selectedThemeId).toBe('midnight-rose');
    });

    it('currentTheme 应返回当前主题配置', async () => {
        const store = useThemeStore();
        await store.initialize();

        expect(store.currentTheme?.id).toBe('material-rose');
        expect(store.currentTheme?.isDark).toBe(false);
    });

    it('themeOptions 与 availableThemeIds  getter 应正确暴露主题列表', async () => {
        const store = useThemeStore();
        await store.initialize();

        expect(store.themeOptions).toHaveLength(2);
        expect(store.availableThemeIds).toEqual(['material-rose', 'midnight-rose']);
    });

    it('主题切换应触发 themeChanged 自定义事件', async () => {
        const store = useThemeStore();
        await store.initialize();

        const listener = vi.fn();
        window.addEventListener('themeChanged', listener);

        await store.setTheme('midnight-rose');

        expect(listener).toHaveBeenCalled();
        const event = listener.mock.calls[0][0] as CustomEvent;
        expect(event.detail.themeId).toBe('midnight-rose');

        window.removeEventListener('themeChanged', listener);
    });
});
