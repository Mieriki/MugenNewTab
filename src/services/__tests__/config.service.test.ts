import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserAPI } from '@/services/browserApi.service';
import {
    loadConfig,
    loadThemes,
    loadSearchEngines,
    loadDefaultData,
    clearConfigCache,
} from '@/services/config.service';
import type { ThemeConfig, SearchEngine } from '@/types/config';

describe('ConfigService', () => {
    beforeEach(() => {
        clearConfigCache();
        vi.restoreAllMocks();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
    });

    it('应能加载并缓存主题配置', async () => {
        const mockData: ThemeConfig = {
            defaultTheme: 'material-rose',
            themes: [
                {
                    id: 'material-rose',
                    name: 'Mugen娘经典',
                    description: '温柔玫粉',
                    logo: 'image/logo/mugen.png',
                    colors: { '--md-sys-color-primary': '#B14A6B' },
                },
            ],
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockData,
        }));

        const first = await loadThemes();
        expect(first).toEqual(mockData);

        const second = await loadThemes();
        expect(second).toEqual(mockData);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('/config/themes.json');
    });

    it('loadConfig 应返回 null 并在控制台报错', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        }));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await loadConfig<unknown>('missing');

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('clearConfigCache 应能清空指定缓存', async () => {
        const mockData: SearchEngine[] = [{ name: 'Test', url: 'https://test/?q={q}', icon: '' }];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockData,
        }));

        await loadSearchEngines();
        clearConfigCache('searchEngines');
        await loadSearchEngines();

        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('clearConfigCache 不传参数应清空全部缓存', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        }));

        await loadThemes();
        clearConfigCache();
        await loadThemes();

        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('扩展环境应使用 runtime.getURL 构造路径', async () => {
        const getURL = vi.fn().mockReturnValue('chrome-extension://abc/config/');
        (window as unknown as { chrome?: { runtime?: { getURL: typeof getURL }; storage?: { local?: unknown } } }).chrome = {
            runtime: { getURL },
            storage: { local: {} },
        };
        BrowserAPI.resetDetection();

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        }));

        await loadDefaultData();

        expect(getURL).toHaveBeenCalledWith('config/');
        expect(fetch).toHaveBeenCalledWith('chrome-extension://abc/config/defaultData.json');

        delete (window as unknown as { chrome?: unknown }).chrome;
        BrowserAPI.resetDetection();
    });
});
