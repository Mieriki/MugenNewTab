/**
 * useCurrentTab 单元测试
 *
 * 验证当前活动标签页信息的读取、无效页面过滤、错误处理、自动刷新与清理行为。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useCurrentTab } from '../useCurrentTab';
import { browserApi } from '@/services/browserApi.service';
import type { BrowserNamespace, Tab } from '@/types/browserApi.types';

const originalWindowChrome = (window as unknown as { chrome?: BrowserNamespace }).chrome;
const originalWindowBrowser = (window as unknown as { browser?: BrowserNamespace }).browser;

/** 重置浏览器扩展环境模拟 */
function resetEnv(): void {
    delete (window as unknown as { chrome?: BrowserNamespace }).chrome;
    delete (window as unknown as { browser?: BrowserNamespace }).browser;
    browserApi.resetDetection();
    localStorage.clear();
}

/** 恢复原始浏览器扩展环境 */
function restoreEnv(): void {
    if (originalWindowChrome) {
        (window as unknown as { chrome: BrowserNamespace }).chrome = originalWindowChrome;
    } else {
        delete (window as unknown as { chrome?: BrowserNamespace }).chrome;
    }
    if (originalWindowBrowser) {
        (window as unknown as { browser: BrowserNamespace }).browser = originalWindowBrowser;
    } else {
        delete (window as unknown as { browser?: BrowserNamespace }).browser;
    }
}

/** 在测试组件内调用 composable，触发 onMounted/onUnmounted 生命周期 */
function withSetup<T>(composable: () => T): [T, ReturnType<typeof mount>] {
    let result: T;
    const TestComponent = defineComponent({
        setup() {
            result = composable();
            return {};
        },
        render() {
            return null;
        },
    });
    const wrapper = mount(TestComponent);
    return [result!, wrapper];
}

/**  flush microtasks / promises */
async function flushPromises(): Promise<void> {
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
}

/** 设置 chrome 扩展环境模拟 */
function setupChromeMock(tabs?: Tab[]): void {
    const defaultTabs = tabs ?? [
        { id: 1, title: 'Example', url: 'https://example.com', favIconUrl: 'https://example.com/favicon.ico' },
    ];
    (window as unknown as { chrome: BrowserNamespace }).chrome = {
        storage: {
            local: {
                get: vi.fn(),
                set: vi.fn(),
                remove: vi.fn(),
            },
        },
        tabs: {
            query: vi.fn().mockImplementation((_info: unknown, callback?: (tabs: Tab[]) => void) => {
                if (callback) {
                    callback(defaultTabs);
                }
                return Promise.resolve(defaultTabs);
            }),
        },
    };
    browserApi.resetDetection();
}

describe('useCurrentTab - 基础状态', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('初始状态应为空，且默认使用占位 favicon', () => {
        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        expect(result.tab.value).toBeNull();
        expect(result.title.value).toBe('');
        expect(result.url.value).toBe('');
        expect(result.favicon.value).toContain('data:image/svg+xml');
        expect(result.hasFavicon.value).toBe(false);
        expect(result.isValid.value).toBe(false);
        // 挂载后会立即执行初始查询，因此 isLoading 应为 true
        expect(result.isLoading.value).toBe(true);
        expect(result.error.value).toBeNull();

        wrapper.unmount();
    });

    it('挂载后应自动查询当前活动标签页', async () => {
        setupChromeMock();
        const querySpy = vi.spyOn(browserApi.tabs, 'query');

        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));
        await flushPromises();

        expect(querySpy).toHaveBeenCalledTimes(1);
        expect(querySpy).toHaveBeenCalledWith({ active: true, currentWindow: true });
        expect(result.title.value).toBe('Example');
        expect(result.url.value).toBe('https://example.com');
        expect(result.favicon.value).toBe('https://example.com/favicon.ico');
        expect(result.hasFavicon.value).toBe(true);
        expect(result.isValid.value).toBe(true);
        expect(result.isLoading.value).toBe(false);

        wrapper.unmount();
    });

    it('手动 refresh 应更新标签页信息', async () => {
        setupChromeMock([
            { id: 2, title: 'Manual', url: 'https://manual.test', favIconUrl: 'https://manual.test/icon.png' },
        ]);
        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        expect(result.title.value).toBe('');

        await result.refresh();

        expect(result.title.value).toBe('Manual');
        expect(result.url.value).toBe('https://manual.test');
        expect(result.favicon.value).toBe('https://manual.test/icon.png');

        wrapper.unmount();
    });
});

describe('useCurrentTab - 无效页面过滤', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    const invalidCases: { url: string; label: string }[] = [
        { url: 'chrome://settings', label: 'chrome 内部页' },
        { url: 'chrome-extension://abc/index.html', label: 'chrome 扩展页' },
        { url: 'edge://settings', label: 'edge 内部页' },
        { url: 'about:config', label: 'about 页' },
        { url: 'javascript:alert(1)', label: 'javascript 伪协议' },
        { url: 'data:text/html,test', label: 'data 协议' },
        { url: 'file:///C:/test.html', label: 'file 协议' },
        { url: 'moz-extension://abc/index.html', label: 'firefox 扩展页' },
        { url: '', label: '空 URL' },
        { url: 'not-a-valid-url', label: '非法 URL' },
    ];

    invalidCases.forEach(({ url, label }) => {
        it(`应将 ${label} 标记为无效`, async () => {
            setupChromeMock([{ id: 1, title: 'Invalid', url, favIconUrl: '' }]);
            const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

            await result.refresh();

            expect(result.url.value).toBe(url);
            expect(result.isValid.value).toBe(false);

            wrapper.unmount();
        });
    });

    it('includeInvalid 为 true 时仅检查 URL 非空', async () => {
        setupChromeMock([{ id: 1, title: 'Internal', url: 'chrome://settings', favIconUrl: '' }]);
        const [result, wrapper] = withSetup(() =>
            useCurrentTab({ autoRefresh: false, includeInvalid: true }),
        );

        await result.refresh();

        expect(result.isValid.value).toBe(true);

        wrapper.unmount();
    });

    it('普通 HTTP/HTTPS 页面应视为有效', async () => {
        setupChromeMock([{ id: 1, title: 'Valid', url: 'https://example.com/path', favIconUrl: '' }]);
        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        await result.refresh();

        expect(result.isValid.value).toBe(true);

        wrapper.unmount();
    });
});

describe('useCurrentTab - favicon 处理', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('标签页无 favicon 时应返回默认 SVG', async () => {
        setupChromeMock([{ id: 1, title: 'No Icon', url: 'https://example.com', favIconUrl: '' }]);
        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        await result.refresh();

        expect(result.hasFavicon.value).toBe(false);
        expect(result.favicon.value).toContain('data:image/svg+xml');

        wrapper.unmount();
    });

    it('空白 favicon URL 应视为无 favicon', async () => {
        setupChromeMock([{ id: 1, title: 'Blank Icon', url: 'https://example.com', favIconUrl: '   ' }]);
        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        await result.refresh();

        expect(result.hasFavicon.value).toBe(false);

        wrapper.unmount();
    });
});

describe('useCurrentTab - 错误处理', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('tabs.query 失败时应设置 error 并结束 loading', async () => {
        setupChromeMock();
        vi.spyOn(browserApi.tabs, 'query').mockRejectedValue(new Error('tabs query failed'));

        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        await result.refresh();

        expect(result.error.value).toBeInstanceOf(Error);
        expect(result.error.value?.message).toBe('tabs query failed');
        expect(result.isLoading.value).toBe(false);

        wrapper.unmount();
    });
});

describe('useCurrentTab - 自动刷新与清理', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('visibilitychange 可见时应触发刷新', async () => {
        setupChromeMock();
        const querySpy = vi.spyOn(browserApi.tabs, 'query');

        const [, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: true }));
        await flushPromises();
        expect(querySpy).toHaveBeenCalledTimes(1);

        Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            configurable: true,
        });
        window.dispatchEvent(new Event('visibilitychange'));

        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
        window.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();

        expect(querySpy).toHaveBeenCalledTimes(2);

        wrapper.unmount();
    });

    it('refreshInterval 大于 0 时应定时刷新', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setupChromeMock();
        const querySpy = vi.spyOn(browserApi.tabs, 'query');

        const [, wrapper] = withSetup(() =>
            useCurrentTab({ autoRefresh: true, refreshInterval: 5000 }),
        );
        await flushPromises();
        expect(querySpy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(5000);
        await flushPromises();
        expect(querySpy).toHaveBeenCalledTimes(2);

        vi.advanceTimersByTime(5000);
        await flushPromises();
        expect(querySpy).toHaveBeenCalledTimes(3);

        wrapper.unmount();
        vi.useRealTimers();
    });

    it('组件卸载后应停止定时刷新与事件监听', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setupChromeMock();
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
        const querySpy = vi.spyOn(browserApi.tabs, 'query');

        const [, wrapper] = withSetup(() =>
            useCurrentTab({ autoRefresh: true, refreshInterval: 3000 }),
        );
        await flushPromises();

        wrapper.unmount();

        expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

        vi.advanceTimersByTime(6000);
        expect(querySpy).toHaveBeenCalledTimes(1);

        removeEventListenerSpy.mockRestore();
        vi.useRealTimers();
    });

    it('新的刷新请求应取消上一次 in-flight 请求的状态写入', async () => {
        setupChromeMock();
        const querySpy = vi.spyOn(browserApi.tabs, 'query');
        let resolveFirst: (tabs: Tab[]) => void = () => {};

        querySpy.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    resolveFirst = resolve;
                }),
        );

        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        const firstRefresh = result.refresh();

        // 在第一次请求未完成时触发第二次刷新
        querySpy.mockResolvedValueOnce([
            { id: 2, title: 'Second', url: 'https://second.test', favIconUrl: '' },
        ]);
        await result.refresh();

        expect(result.title.value).toBe('Second');

        // 让第一次请求完成，不应覆盖第二次的结果
        resolveFirst([{ id: 1, title: 'First', url: 'https://first.test', favIconUrl: '' }]);
        await firstRefresh;

        expect(result.title.value).toBe('Second');

        wrapper.unmount();
    });
});

describe('useCurrentTab - 非扩展环境', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('非扩展环境下 tabs.query 返回空数组', async () => {
        const [result, wrapper] = withSetup(() => useCurrentTab({ autoRefresh: false }));

        await result.refresh();

        expect(result.tab.value).toBeNull();
        expect(result.url.value).toBe('');
        expect(result.isValid.value).toBe(false);

        wrapper.unmount();
    });
});
