/**
 * useTheme Composable 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { BrowserAPI } from '@/services/browserApi.service';
import { useTheme } from '../useTheme';
import type { UseThemeReturn } from '../useTheme';
import type { ThemeConfig } from '@/types/config';

/** 构造最小可用调色板 */
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

/** 两个主题族，每族明/暗各一个变体 */
const mockThemes: ThemeConfig = {
    defaultTheme: 'material-rose-light',
    legacyIds: {
        'material-rose': 'material-rose-light',
        'midnight-rose': 'material-rose-dark',
        'azure-sky': 'azure-sky-light',
    },
    themes: [
        {
            id: 'material-rose-light',
            family: 'material-rose',
            mode: 'light',
            isDark: false,
            name: 'Material Rose',
            description: '默认浅色主题',
            logo: 'image/logo/mugen.png',
            colors: makeColors('#B14A6B', '#FFF8F9', '#201A1A'),
        },
        {
            id: 'material-rose-dark',
            family: 'material-rose',
            mode: 'dark',
            isDark: true,
            name: 'Material Rose',
            description: '默认深色主题',
            logo: 'image/logo/mugen.png',
            colors: makeColors('#E8A2B4', '#1D191A', '#EEECED'),
        },
        {
            id: 'azure-sky-light',
            family: 'azure-sky',
            mode: 'light',
            isDark: false,
            name: 'Azure Sky',
            description: '蓝色主题',
            logo: 'image/logo/mugen.png',
            colors: makeColors('#409EFF', '#FFFFFF', '#303133'),
        },
        {
            id: 'azure-sky-dark',
            family: 'azure-sky',
            mode: 'dark',
            isDark: true,
            name: 'Azure Sky',
            description: '蓝色深色主题',
            logo: 'image/logo/mugen.png',
            colors: makeColors('#8AB4F8', '#101418', '#E3E3E3'),
        },
    ],
};

vi.mock('@/services/config.service', () => ({
    loadThemes: vi.fn(() => Promise.resolve(mockThemes)),
    loadSearchEngines: vi.fn(),
    loadDefaultData: vi.fn(),
    clearConfigCache: vi.fn(),
    default: {
        loadThemes: vi.fn(() => Promise.resolve(mockThemes)),
        loadSearchEngines: vi.fn(),
        loadDefaultData: vi.fn(),
        clearConfigCache: vi.fn(),
    },
}));

/** 创建可派发 change 事件的 MediaQueryList 模拟 */
function createMediaQueryList(matches: boolean): MediaQueryList {
    const listeners = new Set<EventListenerOrEventListenerObject>();
    return {
        matches,
        media: '(prefers-color-scheme: dark)',
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
        onchange: null,
    } as unknown as MediaQueryList;
}

let currentMatchMedia: MediaQueryList | null = null;

function setupMatchMedia(matches: boolean): MediaQueryList {
    currentMatchMedia = createMediaQueryList(matches);
    window.matchMedia = vi.fn().mockReturnValue(currentMatchMedia);
    return currentMatchMedia;
}

function flushPromises(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function useSetup(options: { autoInit?: boolean } = {}) {
    let result!: UseThemeReturn;
    const wrapper = mount(
        defineComponent({
            setup() {
                result = useTheme(options);
                return {};
            },
            template: '<div></div>'
        })
    );
    return { result, wrapper };
}

describe('useTheme', () => {
    const wrappers: ReturnType<typeof mount>[] = [];

    beforeEach(() => {
        localStorage.clear();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        setActivePinia(createPinia());
        setupMatchMedia(false);
        wrappers.length = 0;
    });

    afterEach(() => {
        wrappers.forEach(w => {
            if (w.exists?.()) {
                w.unmount();
            }
        });
        wrappers.length = 0;
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
        currentMatchMedia = null;
    });

    it('挂载后自动初始化并暴露状态', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        expect(result.isInitializing.value).toBe(true);

        await nextTick();
        await flushPromises();

        expect(result.isReady.value).toBe(true);
        expect(result.isInitializing.value).toBe(false);
        expect(result.themes.value).toHaveLength(4);
        expect(result.currentTheme.value?.id).toBe('material-rose-light');
        expect(result.selectedThemeId.value).toBe('material-rose-light');
        expect(result.isDark.value).toBe(false);
        expect(result.currentMode.value).toBe('light');
        expect(result.themeFamilies.value).toHaveLength(2);
        expect(result.availableThemeIds.value).toEqual([
            'material-rose-light',
            'material-rose-dark',
            'azure-sky-light',
            'azure-sky-dark',
        ]);
    });

    it('autoInit: false 时手动初始化', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        expect(result.isReady.value).toBe(false);
        expect(result.isInitializing.value).toBe(false);

        await result.initialize();

        expect(result.isReady.value).toBe(true);
        expect(result.themes.value).toHaveLength(4);
    });

    it('setTheme 切换并持久化主题', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky-light');

        expect(result.selectedThemeId.value).toBe('azure-sky-light');
        expect(result.currentTheme.value?.id).toBe('azure-sky-light');
        expect(result.currentFamilyId.value).toBe('azure-sky');
        expect(localStorage.getItem('selectedTheme')).toContain('azure-sky-light');
    });

    it('setMode 在同族内切换明暗', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky-light');
        await result.setMode('dark');

        expect(result.selectedThemeId.value).toBe('azure-sky-dark');
        expect(result.currentFamilyId.value).toBe('azure-sky');
        expect(result.isDark.value).toBe(true);

        await result.setMode('light');
        expect(result.selectedThemeId.value).toBe('azure-sky-light');
        expect(result.isDark.value).toBe(false);
    });

    it('cycleTheme 按主题族顺序循环并保持明暗模式', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.cycleTheme();
        expect(result.selectedThemeId.value).toBe('azure-sky-light');

        await result.cycleTheme();
        expect(result.selectedThemeId.value).toBe('material-rose-light');

        await result.cycleTheme();
        expect(result.selectedThemeId.value).toBe('azure-sky-light');
    });

    it('nextTheme 是 cycleTheme 的别名', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.nextTheme();
        expect(result.selectedThemeId.value).toBe('azure-sky-light');
    });

    it('previousTheme 切换到上一个主题族', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.previousTheme();
        expect(result.selectedThemeId.value).toBe('azure-sky-light');
    });

    it('followSystemTheme 保留主题族、只切到系统对应的明暗', async () => {
        setupMatchMedia(true);
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky-light');
        await result.followSystemTheme();

        expect(result.isFollowingSystem.value).toBe(true);
        expect(result.selectedThemeId.value).toBe('azure-sky-dark');
        expect(localStorage.getItem('selectedTheme')).toBeNull();
    });

    it('toggleFollowSystem 在跟随与固定主题间切换', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        expect(result.isFollowingSystem.value).toBe(false);

        await result.toggleFollowSystem();
        expect(result.isFollowingSystem.value).toBe(true);

        await result.toggleFollowSystem();
        expect(result.isFollowingSystem.value).toBe(false);
    });

    it('系统偏好变化时跟随系统主题自动切换', async () => {
        const mql = setupMatchMedia(false);
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.followSystemTheme();
        expect(result.selectedThemeId.value).toBe('material-rose-light');

        // 模拟系统切换到深色
        const event = new Event('change') as MediaQueryListEvent;
        Object.defineProperty(event, 'matches', { value: true });
        mql.dispatchEvent(event);

        await flushPromises();

        expect(result.systemPrefersDark.value).toBe(true);
        expect(result.selectedThemeId.value).toBe('material-rose-dark');
    });

    it('refreshThemes 重新加载配置并应用当前主题', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky-light');
        await result.refreshThemes();

        expect(result.selectedThemeId.value).toBe('azure-sky-light');
        expect(result.themes.value).toHaveLength(4);
    });

    it('组件卸载后 initialize 被中断且不再更新状态', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        wrapper.unmount();
        await result.initialize();

        expect(result.isReady.value).toBe(false);
        expect(result.isInitializing.value).toBe(false);
    });

    it('组件卸载后方法调用不执行 store 操作', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky-light');
        wrapper.unmount();

        const before = result.selectedThemeId.value;
        await result.setTheme('material-rose-dark');

        expect(result.selectedThemeId.value).toBe(before);
    });
});
