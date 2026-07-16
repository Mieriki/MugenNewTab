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

const mockThemes: ThemeConfig = {
    defaultTheme: 'material-rose',
    themes: [
        {
            id: 'material-rose',
            name: 'Material Rose',
            description: '默认浅色主题',
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
            name: 'Midnight Rose',
            description: '深色主题',
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
        {
            id: 'azure-sky',
            name: 'Azure Sky',
            description: '蓝色主题',
            logo: 'image/logo/mugen.png',
            isDark: false,
            colors: {
                '--md-sys-color-primary': '#409EFF',
                '--md-sys-color-on-primary': '#FFFFFF',
                '--md-sys-color-primary-container': '#ECF5FF',
                '--md-sys-color-on-primary-container': '#2C3E50',
                '--md-sys-color-secondary': '#B3E5FC',
                '--md-sys-color-on-secondary': '#FFFFFF',
                '--md-sys-color-secondary-container': '#F5F7FA',
                '--md-sys-color-on-secondary-container': '#303133',
                '--md-sys-color-tertiary': '#67C23A',
                '--md-sys-color-on-tertiary': '#FFFFFF',
                '--md-sys-color-tertiary-container': '#F0F9EB',
                '--md-sys-color-on-tertiary-container': '#2E7D32',
                '--md-sys-color-surface': '#FFFFFF',
                '--md-sys-color-surface-variant': '#F5F7FA',
                '--md-sys-color-on-surface': '#303133',
                '--md-sys-color-on-surface-variant': '#606266',
                '--md-sys-color-background': '#F5F7FA',
                '--md-sys-color-on-background': '#303133',
                '--md-sys-color-outline': '#DCDFE6',
                '--md-sys-color-error': '#F56C6C',
                '--md-sys-color-success': '#67C23A',
                '--md-sys-color-inverse-surface': '#303133',
                '--md-sys-color-inverse-on-surface': '#FFFFFF',
            },
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
        expect(result.themes.value).toHaveLength(3);
        expect(result.currentTheme.value?.id).toBe('material-rose');
        expect(result.selectedThemeId.value).toBe('material-rose');
        expect(result.isDark.value).toBe(false);
        expect(result.availableThemeIds.value).toEqual([
            'material-rose',
            'midnight-rose',
            'azure-sky',
        ]);
    });

    it('autoInit: false 时手动初始化', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        expect(result.isReady.value).toBe(false);
        expect(result.isInitializing.value).toBe(false);

        await result.initialize();

        expect(result.isReady.value).toBe(true);
        expect(result.themes.value).toHaveLength(3);
    });

    it('setTheme 切换并持久化主题', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky');

        expect(result.selectedThemeId.value).toBe('azure-sky');
        expect(result.currentTheme.value?.id).toBe('azure-sky');
        expect(localStorage.getItem('selectedTheme')).toContain('azure-sky');
    });

    it('cycleTheme 按顺序循环切换主题', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.cycleTheme();
        expect(result.selectedThemeId.value).toBe('midnight-rose');

        await result.cycleTheme();
        expect(result.selectedThemeId.value).toBe('azure-sky');

        await result.cycleTheme();
        expect(result.selectedThemeId.value).toBe('material-rose');
    });

    it('nextTheme 是 cycleTheme 的别名', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.nextTheme();
        expect(result.selectedThemeId.value).toBe('midnight-rose');
    });

    it('previousTheme 切换到上一个主题', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.previousTheme();
        expect(result.selectedThemeId.value).toBe('azure-sky');
    });

    it('followSystemTheme 启用系统跟随并选择深色主题', async () => {
        setupMatchMedia(true);
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky');
        await result.followSystemTheme();

        expect(result.isFollowingSystem.value).toBe(true);
        expect(result.selectedThemeId.value).toBe('midnight-rose');
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
        expect(result.selectedThemeId.value).toBe('material-rose');

        // 模拟系统切换到深色
        const event = new Event('change') as MediaQueryListEvent;
        Object.defineProperty(event, 'matches', { value: true });
        mql.dispatchEvent(event);

        await flushPromises();

        expect(result.systemPrefersDark.value).toBe(true);
        expect(result.selectedThemeId.value).toBe('midnight-rose');
    });

    it('refreshThemes 重新加载配置并应用当前主题', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        await result.setTheme('azure-sky');
        await result.refreshThemes();

        expect(result.selectedThemeId.value).toBe('azure-sky');
        expect(result.themes.value).toHaveLength(3);
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

        await result.setTheme('azure-sky');
        wrapper.unmount();

        const before = result.selectedThemeId.value;
        await result.setTheme('midnight-rose');

        expect(result.selectedThemeId.value).toBe(before);
    });
});
