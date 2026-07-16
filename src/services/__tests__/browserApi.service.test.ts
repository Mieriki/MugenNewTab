/**
 * browserApi.service 单元测试
 * 验证非扩展环境降级、扩展环境 Promise/callback 封装、tabs 与 runtime 行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { browserApi, isExtension, browserType } from '../browserApi.service';
import type { BrowserNamespace, Tab } from '@/types/browserApi.types';

const originalWindowBrowser = (window as unknown as { browser?: BrowserNamespace }).browser;
const originalWindowChrome = (window as unknown as { chrome?: BrowserNamespace }).chrome;

function resetEnv(): void {
    delete (window as unknown as { browser?: BrowserNamespace }).browser;
    delete (window as unknown as { chrome?: BrowserNamespace }).chrome;
    browserApi.resetDetection();
    window.localStorage.clear();
}

function restoreEnv(): void {
    if (originalWindowBrowser) {
        (window as unknown as { browser: BrowserNamespace }).browser = originalWindowBrowser;
    } else {
        delete (window as unknown as { browser?: BrowserNamespace }).browser;
    }
    if (originalWindowChrome) {
        (window as unknown as { chrome: BrowserNamespace }).chrome = originalWindowChrome;
    } else {
        delete (window as unknown as { chrome?: BrowserNamespace }).chrome;
    }
}

describe('browserApi.service - 环境检测', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('非扩展环境应返回 isExtension = false', () => {
        expect(isExtension()).toBe(false);
        expect(browserType()).toBe('none');
    });

    it('存在 chrome.storage.local 时应识别为扩展环境', () => {
        const chromeMock: BrowserNamespace = {
            storage: {
                local: {
                    get: vi.fn(),
                    set: vi.fn(),
                    remove: vi.fn()
                }
            },
            runtime: {
                getURL: vi.fn((path: string) => `chrome-extension://test/${path}`)
            }
        };
        (window as unknown as { chrome: BrowserNamespace }).chrome = chromeMock;
        browserApi.resetDetection();

        expect(isExtension()).toBe(true);
        expect(browserType()).toBe('chrome');
    });

    it('存在 browser.storage.local 时应识别为 Firefox 环境', () => {
        const browserMock: BrowserNamespace = {
            storage: {
                local: {
                    get: vi.fn(),
                    set: vi.fn(),
                    remove: vi.fn()
                }
            },
            runtime: {
                getURL: vi.fn((path: string) => `moz-extension://test/${path}`)
            }
        };
        (window as unknown as { browser: BrowserNamespace }).browser = browserMock;
        browserApi.resetDetection();

        expect(isExtension()).toBe(true);
        expect(browserType()).toBe('firefox');
    });
});

describe('browserApi.service - localStorage 降级', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('get 应读取并解析 JSON 值', async () => {
        window.localStorage.setItem('test_key', JSON.stringify({ value: 42 }));
        const result = await browserApi.storage.local.get('test_key');
        expect(result).toEqual({ test_key: { value: 42 } });
    });

    it('get 读取不存在的键应返回空对象', async () => {
        const result = await browserApi.storage.local.get('missing_key');
        expect(result).toEqual({});
    });

    it('get(null) 应返回全部 localStorage', async () => {
        window.localStorage.setItem('a', '1');
        window.localStorage.setItem('b', JSON.stringify({ x: 2 }));
        const result = await browserApi.storage.local.get(null);
        expect(result.a).toBe(1);
        expect(result.b).toEqual({ x: 2 });
    });

    it('set 应写入 JSON 字符串', async () => {
        await browserApi.storage.local.set({ foo: { bar: 'baz' } });
        expect(window.localStorage.getItem('foo')).toBe(JSON.stringify({ bar: 'baz' }));
    });

    it('set 字符串值应直接写入', async () => {
        await browserApi.storage.local.set({ plain: 'hello' });
        expect(window.localStorage.getItem('plain')).toBe('hello');
    });

    it('remove 应删除指定键', async () => {
        window.localStorage.setItem('del_key', 'value');
        await browserApi.storage.local.remove('del_key');
        expect(window.localStorage.getItem('del_key')).toBeNull();
    });

    it('remove 数组键应批量删除', async () => {
        window.localStorage.setItem('k1', '1');
        window.localStorage.setItem('k2', '2');
        await browserApi.storage.local.remove(['k1', 'k2']);
        expect(window.localStorage.getItem('k1')).toBeNull();
        expect(window.localStorage.getItem('k2')).toBeNull();
    });
});

describe('browserApi.service - Chrome callback 封装', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('storage.local.get 应将回调结果包装为 Promise', async () => {
        const getMock = vi.fn((_key: unknown, callback: (result: Record<string, unknown>) => void) => {
            callback({ test: { value: 1 } });
        });
        (window as unknown as { chrome: BrowserNamespace }).chrome = {
            storage: { local: { get: getMock } }
        };
        browserApi.resetDetection();

        const result = await browserApi.storage.local.get('test');
        expect(result).toEqual({ test: { value: 1 } });
        expect(getMock).toHaveBeenCalledWith('test', expect.any(Function));
    });

    it('storage.local.set 应包装回调', async () => {
        const setMock = vi.fn((_items: Record<string, unknown>, callback: () => void) => {
            callback();
        });
        (window as unknown as { chrome: BrowserNamespace }).chrome = {
            storage: { local: { set: setMock } }
        };
        browserApi.resetDetection();

        await browserApi.storage.local.set({ foo: 'bar' });
        expect(setMock).toHaveBeenCalledWith({ foo: 'bar' }, expect.any(Function));
    });

    it('runtime.lastError 应 reject Promise', async () => {
        const getMock = vi.fn((_key: unknown, callback: (result: Record<string, unknown>) => void) => {
            callback({});
        });
        const runtimeMock = {
            lastError: { message: 'test error' }
        };
        (window as unknown as { chrome: BrowserNamespace }).chrome = {
            storage: { local: { get: getMock } },
            runtime: runtimeMock
        };
        browserApi.resetDetection();

        await expect(browserApi.storage.local.get('x')).rejects.toThrow('test error');
    });

    it('tabs.query 非扩展环境应返回空数组', async () => {
        const result = await browserApi.tabs.query({ active: true, currentWindow: true });
        expect(result).toEqual([]);
    });

    it('tabs.query Chrome 回调应被包装', async () => {
        const queryMock = vi.fn((_info: unknown, callback: (tabs: Tab[]) => void) => {
            callback([{ id: 1 }]);
        });
        (window as unknown as { chrome: BrowserNamespace }).chrome = {
            storage: { local: { get: vi.fn() } },
            tabs: { query: queryMock }
        };
        browserApi.resetDetection();

        const result = await browserApi.tabs.query({ active: true });
        expect(result).toEqual([{ id: 1 }]);
    });

    it('runtime.getURL 扩展环境应调用原生方法', () => {
        const getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
        (window as unknown as { chrome: BrowserNamespace }).chrome = {
            storage: { local: { get: vi.fn() } },
            runtime: { getURL }
        };
        browserApi.resetDetection();

        expect(browserApi.runtime.getURL('image/icon.svg')).toBe('chrome-extension://test/image/icon.svg');
    });
});

describe('browserApi.service - Firefox Promise 原生支持', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('storage.local.get 应直接使用原生 Promise', async () => {
        const getMock = vi.fn().mockResolvedValue({ foo: 'bar' });
        (window as unknown as { browser: BrowserNamespace }).browser = {
            storage: { local: { get: getMock } }
        };
        browserApi.resetDetection();

        const result = await browserApi.storage.local.get('foo');
        expect(result).toEqual({ foo: 'bar' });
        expect(getMock).toHaveBeenCalledWith('foo');
    });

    it('tabs.query 应直接使用原生 Promise', async () => {
        const queryMock = vi.fn().mockResolvedValue([{ id: 2, url: 'https://example.com' }]);
        (window as unknown as { browser: BrowserNamespace }).browser = {
            storage: { local: { get: vi.fn() } },
            tabs: { query: queryMock }
        };
        browserApi.resetDetection();

        const result = await browserApi.tabs.query({ active: true, currentWindow: true });
        expect(result).toEqual([{ id: 2, url: 'https://example.com' }]);
    });
});

describe('browserApi.service - runtime.getURL 降级', () => {
    beforeEach(resetEnv);
    afterEach(restoreEnv);

    it('非扩展环境应原样返回路径', () => {
        expect(browserApi.runtime.getURL('config/themes.json')).toBe('config/themes.json');
    });
});
