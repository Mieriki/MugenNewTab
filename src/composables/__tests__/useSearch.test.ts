/**
 * useSearch 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useSearch, clearSuggestionCache, buildSuggestionUrl, type UseSearchOptions } from '../useSearch';

import { STORAGE_KEYS } from '@/types/storage';
import ConfigService from '@/services/config.service';
import type { SearchEngine } from '@/types/config';

const mockEngines: SearchEngine[] = [
    {
        name: 'Google',
        url: 'https://www.google.com/search?q={q}',
        icon: '/image/icons/search.svg',
    },
    {
        name: 'Baidu',
        url: 'https://www.baidu.com/s?wd={q}',
        icon: '/image/icons/search.svg',
    },
];

function createFetchResponse(data: unknown) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => data,
        text: async () => JSON.stringify(data),
    };
}

function createBaiduResponse() {
    const text = 'cb({"g":[{"q":"remote-vue"},{"q":"remote-pinia"}]});';
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => null,
        text: async () => text,
    };
}

function mockFetch(url: string) {
    if (url.includes('/config/searchEngines.json')) {
        return Promise.resolve(createFetchResponse(mockEngines));
    }
    if (url.includes('/config/defaultData.json')) {
        return Promise.resolve(
            createFetchResponse({
                appNavigator: { categories: [], apps: [] },
                systemUiLib: { categories: [], items: [] },
                userUiLib: { categories: [], items: [] },
            })
        );
    }
    if (url.includes('/config/themes.json')) {
        return Promise.resolve(
            createFetchResponse({
                defaultTheme: 'material-rose',
                themes: [],
            })
        );
    }
    if (url.includes('sugrec')) {
        return Promise.resolve(createBaiduResponse());
    }
    return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => null,
        text: async () => '',
    });
}

function setup(options?: UseSearchOptions) {
    setActivePinia(createPinia());
    ConfigService.clearConfigCache();

    let searchRef = null as unknown as ReturnType<typeof useSearch>;

    const wrapper = mount(
        defineComponent({
            setup() {
                searchRef = useSearch(options);
                return {};
            },
            template: '<div data-testid="root" />',
        })
    );

    return { wrapper, search: searchRef };
}

function getHistoryQueries(search: ReturnType<typeof useSearch>) {
    return search.history.value.map((item) => item.query);
}

describe('useSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        localStorage.clear();
        clearSuggestionCache();
        vi.stubGlobal('fetch', vi.fn(mockFetch));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('初始化后加载搜索引擎与持久化状态', async () => {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SEARCH_ENGINE, '1');
        const { search } = setup();

        await flushPromises();

        expect(search.engines.value).toHaveLength(2);
        expect(search.currentEngine.value?.name).toBe('Baidu');
        expect(search.currentEngineIndex.value).toBe(1);
        expect(search.initialized.value).toBe(true);
    });

    it('持久化的搜索引擎索引越界时自动规范化为有效索引', async () => {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SEARCH_ENGINE, '10');
        const { search } = setup();

        await flushPromises();

        expect(search.currentEngine.value?.name).toBe('Baidu');
        expect(localStorage.getItem(STORAGE_KEYS.SELECTED_SEARCH_ENGINE)).toBe('1');
    });

    it('selectEngine 切换并持久化搜索引擎', async () => {
        const { search } = setup();
        await flushPromises();

        await search.selectEngine(1);

        expect(search.currentEngine.value?.name).toBe('Baidu');
        expect(localStorage.getItem(STORAGE_KEYS.SELECTED_SEARCH_ENGINE)).toBe('1');
    });

    it('nextEngine / prevEngine 循环切换搜索引擎', async () => {
        const { search } = setup();
        await flushPromises();

        await search.nextEngine();
        expect(search.currentEngine.value?.name).toBe('Baidu');

        await search.nextEngine();
        expect(search.currentEngine.value?.name).toBe('Google');

        await search.prevEngine();
        expect(search.currentEngine.value?.name).toBe('Baidu');

        await search.prevEngine();
        expect(search.currentEngine.value?.name).toBe('Google');
    });

    it('executeSearch 打开搜索链接并写入历史', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const { search } = setup();
        await flushPromises();

        const result = await search.executeSearch('hello world');

        expect(result).toBe(true);
        expect(openSpy).toHaveBeenCalledWith(
            'https://www.google.com/search?q=hello%20world',
            '_blank'
        );
        expect(search.history.value.some((item) => item.query === 'hello world')).toBe(true);
        expect(search.query.value).toBe('');
        expect(search.suggestions.value).toEqual([]);

        openSpy.mockRestore();
    });

    it('executeSearch 忽略空白关键词', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const { search } = setup();
        await flushPromises();

        const result = await search.executeSearch('   ');

        expect(result).toBe(false);
        expect(openSpy).not.toHaveBeenCalled();

        openSpy.mockRestore();
    });

    it('executeSearch 失败时保留输入框内容', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const { search } = setup();
        await flushPromises();

        // 构造缺少 URL 的无效引擎，使搜索必然失败
        search.engines.value = [{ name: 'Bad', url: '', icon: '' }];
        search.setQuery('abc');
        const result = await search.executeSearch();

        expect(result).toBe(false);
        expect(search.query.value).toBe('abc');
        expect(openSpy).not.toHaveBeenCalled();

        openSpy.mockRestore();
    });

    it('executeSearchWithSuggestion 使用建议文本执行搜索', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const { search } = setup();
        await flushPromises();

        await search.executeSearchWithSuggestion('vue3');

        expect(openSpy).toHaveBeenCalledWith(
            'https://www.google.com/search?q=vue3',
            '_blank'
        );
        expect(search.history.value.some((item) => item.query === 'vue3')).toBe(true);
        expect(search.query.value).toBe('');

        openSpy.mockRestore();
    });

    it('addHistory / removeHistory / clearHistory 管理搜索历史', async () => {
        const { search } = setup();
        await flushPromises();

        await search.addHistory('vue');
        await search.addHistory('pinia');
        expect(getHistoryQueries(search)).toEqual(['pinia', 'vue']);

        await search.removeHistory('vue');
        expect(getHistoryQueries(search)).toEqual(['pinia']);

        await search.clearHistory();
        expect(getHistoryQueries(search)).toEqual([]);
    });

    it('加载搜索建议：合并本地历史与远程结果', async () => {
        const { search } = setup({ debounceMs: 200 });
        await flushPromises();

        await search.addHistory('vue history');
        search.setQuery('vue');

        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();

        expect(search.suggestions.value).toContain('vue history');
        expect(search.suggestions.value).toContain('remote-vue');
        expect(search.suggestions.value).toContain('remote-pinia');
        expect(search.suggestions.value.length).toBeLessThanOrEqual(8);
        expect(search.isLoadingSuggestions.value).toBe(false);
    });

    it('清空关键词时立即清空建议并取消未完成的请求', async () => {
        const { search } = setup({ debounceMs: 200 });
        await flushPromises();

        search.setQuery('vue');
        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();
        expect(search.suggestions.value.length).toBeGreaterThan(0);

        search.setQuery('');
        await flushPromises();

        expect(search.suggestions.value).toEqual([]);
        expect(search.activeSuggestionIndex.value).toBe(-1);
        expect(search.isLoadingSuggestions.value).toBe(false);
    });

    it('组件卸载后取消未完成的建议请求', async () => {
        const { wrapper, search } = setup({ debounceMs: 200 });
        await flushPromises();

        search.setQuery('vue');
        wrapper.unmount();

        await vi.advanceTimersByTimeAsync(300);
        await flushPromises();

        const baiduCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
            ([url]) => String(url).includes('sugrec')
        );
        expect(baiduCalls).toHaveLength(0);
    });

    it('建议键盘导航与选中', () => {
        const { search } = setup();

        search.suggestions.value = ['vue', 'react', 'angular'];

        search.moveSuggestionDown();
        expect(search.activeSuggestionIndex.value).toBe(0);

        search.moveSuggestionDown();
        expect(search.activeSuggestionIndex.value).toBe(1);

        search.moveSuggestionUp();
        expect(search.activeSuggestionIndex.value).toBe(0);

        const selected = search.selectActiveSuggestion();
        expect(selected).toBe('vue');
        expect(search.query.value).toBe('vue');
        expect(search.suggestions.value).toEqual([]);
        expect(search.activeSuggestionIndex.value).toBe(-1);
    });

    it('selectActiveSuggestion 未选中任何建议时返回 null', () => {
        const { search } = setup();
        search.suggestions.value = ['vue', 'react'];

        expect(search.selectActiveSuggestion()).toBeNull();
    });

    it('loadSuggestions 手动触发防抖后的建议加载', async () => {
        const { search } = setup({ debounceMs: 150 });
        await flushPromises();

        search.loadSuggestions('pinia');

        await vi.advanceTimersByTimeAsync(200);
        await flushPromises();

        expect(search.suggestions.value).toContain('remote-pinia');
        expect(search.isLoadingSuggestions.value).toBe(false);
    });

    it('相同关键词第二次加载命中缓存，不重复请求远程接口', async () => {
        const { search } = setup({ debounceMs: 200 });
        await flushPromises();

        search.setQuery('vue');
        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();

        search.setQuery('');
        await flushPromises();

        search.setQuery('vue');
        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();

        const baiduCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
            ([url]) => String(url).includes('sugrec')
        );
        expect(baiduCalls).toHaveLength(1);
        expect(search.suggestions.value).toContain('remote-vue');
    });

    it('缓存过期后重新请求远程接口', async () => {
        const { search } = setup({ debounceMs: 200 });
        await flushPromises();

        search.setQuery('vue');
        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();

        search.setQuery('');
        await flushPromises();

        // 推进超过 5 分钟缓存 TTL
        await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

        search.setQuery('vue');
        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();

        const baiduCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
            ([url]) => String(url).includes('sugrec')
        );
        expect(baiduCalls).toHaveLength(2);
    });

    it('getCompletionCandidate 优先返回当前高亮建议', () => {
        const { search } = setup();
        search.query.value = 'vu';
        search.suggestions.value = ['vue', 'vite'];
        search.activeSuggestionIndex.value = 1;

        expect(search.getCompletionCandidate()).toBe('vite');
    });

    it('getCompletionCandidate 无高亮时返回前缀匹配建议，无匹配返回 null', () => {
        const { search } = setup();
        search.query.value = 'vu';
        search.suggestions.value = ['vue', 'react'];

        expect(search.getCompletionCandidate()).toBe('vue');

        search.query.value = 'x';
        expect(search.getCompletionCandidate()).toBeNull();

        search.query.value = '';
        expect(search.getCompletionCandidate()).toBeNull();
    });

    it('buildSuggestionUrl：dev 使用同源代理路径，生产直连百度', () => {
        expect(buildSuggestionUrl('测试', true)).toBe(
            '/sugrec?prod=pc&wd=%E6%B5%8B%E8%AF%95&cb=cb'
        );
        expect(buildSuggestionUrl('测试', false)).toBe(
            'https://www.baidu.com/sugrec?prod=pc&wd=%E6%B5%8B%E8%AF%95&cb=cb'
        );
    });

    it('加载期间保留旧建议直到新结果到达（SWR，避免列表闪烁）', async () => {
        const { search } = setup({ debounceMs: 200 });
        await flushPromises();

        // 先加载出一份旧建议
        search.setQuery('vue');
        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();
        expect(search.suggestions.value).toContain('remote-vue');
        const previous = [...search.suggestions.value];

        // 控制下一次 sugrec 请求的 resolve 时机
        let resolveRemote: ((value: unknown) => void) | undefined;
        const fetchMock = vi.fn((url: string) => {
            if (String(url).includes('sugrec')) {
                return new Promise((resolve) => {
                    resolveRemote = resolve;
                });
            }
            return mockFetch(url);
        });
        vi.stubGlobal('fetch', fetchMock);

        search.setQuery('pinia');
        await vi.advanceTimersByTimeAsync(250);
        await flushPromises();

        // 远程未返回期间：保留旧建议，且处于加载态
        expect(search.isLoadingSuggestions.value).toBe(true);
        expect(search.suggestions.value).toEqual(previous);

        // 远程返回后一次性替换为合并结果
        resolveRemote?.({
            ok: true,
            text: async () => 'cb({"g":[{"q":"remote-pinia-new"}]});'
        });
        await flushPromises();

        expect(search.suggestions.value).toEqual(['remote-pinia-new']);
        expect(search.isLoadingSuggestions.value).toBe(false);
    });

    it('建议键盘导航循环跳转：末位 ↓ 回首位，首位 ↑ 回末位', () => {
        const { search } = setup();
        search.suggestions.value = ['a', 'b', 'c'];

        // 未选中时按 ↑ 直接跳到最后一项
        search.moveSuggestionUp();
        expect(search.activeSuggestionIndex.value).toBe(2);

        // 最后一项按 ↓ 跳回第一项
        search.moveSuggestionDown();
        expect(search.activeSuggestionIndex.value).toBe(0);

        // 第一项按 ↑ 跳到最后一项
        search.moveSuggestionUp();
        expect(search.activeSuggestionIndex.value).toBe(2);

        // 中间项正常移动
        search.moveSuggestionUp();
        expect(search.activeSuggestionIndex.value).toBe(1);
    });
});
