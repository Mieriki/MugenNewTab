/**
 * useSearch 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useSearch, type UseSearchOptions } from '../useSearch';

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
    if (url.includes('baidu.com/sugrec')) {
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
        expect(search.query.value).toBe('hello world');
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
            ([url]) => String(url).includes('baidu.com/sugrec')
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
});
