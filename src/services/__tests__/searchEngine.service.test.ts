/**
 * SearchEngineService 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SearchEngine } from '@/types/config';

const mockEngines: SearchEngine[] = [
    {
        name: 'Google',
        url: 'https://www.google.com/search?q={q}',
        icon: '/image/icons/search.svg'
    },
    {
        name: 'Baidu',
        url: 'https://www.baidu.com/s?wd={q}',
        icon: '/image/icons/search.svg'
    }
];

function createFetchMock(data: unknown) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(data)
    });
}

describe('SearchEngineService', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('fetch', createFetchMock(mockEngines));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('应异步加载并返回所有搜索引擎', async () => {
        const { getAllSearchEngines } = await import('../searchEngine.service');
        const engines = await getAllSearchEngines();

        expect(engines).toHaveLength(2);
        expect(engines[0].name).toBe('Google');
        expect(engines[1].name).toBe('Baidu');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('重复调用应使用缓存，不再重复请求', async () => {
        const { getAllSearchEngines } = await import('../searchEngine.service');
        await getAllSearchEngines();
        await getAllSearchEngines();

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('getDefault 应返回配置列表中的第一个搜索引擎', async () => {
        const { getDefaultSearchEngine } = await import('../searchEngine.service');
        const engine = await getDefaultSearchEngine();

        expect(engine).toEqual(mockEngines[0]);
    });

    it('getByIndex 应根据索引返回对应搜索引擎', async () => {
        const { getSearchEngineByIndex } = await import('../searchEngine.service');
        const engine = await getSearchEngineByIndex(1);

        expect(engine).toEqual(mockEngines[1]);
    });

    it('getByIndex 在索引越界时应返回 null', async () => {
        const { getSearchEngineByIndex } = await import('../searchEngine.service');
        const engine = await getSearchEngineByIndex(10);

        expect(engine).toBeNull();
    });

    it('buildSearchUrl 应使用 encodeURIComponent 替换 {q}', async () => {
        const { buildSearchUrl } = await import('../searchEngine.service');
        const url = buildSearchUrl(mockEngines[0], 'hello world');

        expect(url).toBe('https://www.google.com/search?q=hello%20world');
    });

    it('buildSearchUrl 在引擎无效时应返回 null', async () => {
        const { buildSearchUrl } = await import('../searchEngine.service');
        const url = buildSearchUrl({ name: '', url: '', icon: '' }, 'test');

        expect(url).toBeNull();
    });

    it('search 应在新标签页打开构建后的搜索 URL', async () => {
        const { searchWithEngine } = await import('../searchEngine.service');
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

        searchWithEngine(mockEngines[0], 'test query');

        expect(openSpy).toHaveBeenCalledWith(
            'https://www.google.com/search?q=test%20query',
            '_blank'
        );

        openSpy.mockRestore();
    });

    it('search 在 URL 构建失败时不应调用 window.open', async () => {
        const { searchWithEngine } = await import('../searchEngine.service');
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

        searchWithEngine({ name: 'Invalid', url: '', icon: '' }, 'test');

        expect(openSpy).not.toHaveBeenCalled();

        openSpy.mockRestore();
    });

    it('配置项缺少图标时应使用系统默认搜索图标补齐', async () => {
        vi.stubGlobal(
            'fetch',
            createFetchMock([
                { name: 'NoIcon', url: 'https://example.com?q={q}' }
            ])
        );

        const { getAllSearchEngines } = await import('../searchEngine.service');
        const engines = await getAllSearchEngines();

        expect(engines[0].icon).toBe('/image/icons/search.svg');
    });

    it('加载失败时应返回空数组并记录错误', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const { getAllSearchEngines } = await import('../searchEngine.service');
        const engines = await getAllSearchEngines();

        expect(engines).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });
});
