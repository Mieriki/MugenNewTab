/**
 * useUpdateCheck 单元测试
 *
 * 覆盖：版本号比较、安装包挑选、检查节流、忽略版本、失败静默。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEYS } from '@/types/storage';
import {
    compareVersions,
    pickDownloadUrl,
    parseLatestJson,
    parseReleaseApi,
    useUpdateCheck,
    type LatestRelease,
} from '../useUpdateCheck';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    set: vi.fn(),
}));

vi.mock('@/services/storage.service', () => ({
    storageManager: {
        get: mocks.get,
        set: mocks.set,
    },
}));

/** 构造一份 Release 数据 */
function makeRelease(version: string): LatestRelease {
    return {
        version,
        downloadUrl: `https://example.com/mugen-${version}.xpi`,
        releaseUrl: `https://example.com/releases/${version}`,
    };
}

/** 让某个存储键返回指定值 */
function mockStorage(entries: Record<string, unknown>): void {
    mocks.get.mockImplementation(async (key: string) => entries[key] ?? null);
}

beforeEach(() => {
    mocks.get.mockReset();
    mocks.set.mockReset();
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('compareVersions', () => {
    it('逐段按数值比较，不会退化成字符串比较', () => {
        expect(compareVersions('1.0.0.109', '1.0.0.108')).toBe(1);
        expect(compareVersions('1.0.0.9', '1.0.0.10')).toBe(-1);
    });

    it('段数不同时缺位补 0', () => {
        expect(compareVersions('1.0.0', '1.0.0.0')).toBe(0);
        expect(compareVersions('1.0.1', '1.0')).toBe(1);
    });

    it('相同版本返回 0', () => {
        expect(compareVersions('1.0.0.108', '1.0.0.108')).toBe(0);
    });
});

describe('pickDownloadUrl', () => {
    const assets = [
        { name: 'mugennewtab-1.0.0.109.xpi', browser_download_url: 'https://example.com/a.xpi' },
        { name: 'mugen_newtab-chromium.zip', browser_download_url: 'https://example.com/a.zip' },
    ];

    it('Firefox 优先取 xpi', () => {
        expect(pickDownloadUrl(assets, 'firefox')).toBe('https://example.com/a.xpi');
    });

    it('Chromium 系优先取 chromium zip', () => {
        expect(pickDownloadUrl(assets, 'chrome')).toBe('https://example.com/a.zip');
    });

    it('没有匹配资产时返回 null', () => {
        expect(pickDownloadUrl([], 'chrome')).toBeNull();
    });

    it('只有 xpi 时 Chromium 侧兜底取 xpi', () => {
        expect(pickDownloadUrl([assets[0]], 'chrome')).toBe('https://example.com/a.xpi');
    });
});

describe('parseLatestJson', () => {
    const payload = {
        version: '1.0.0.109',
        release: 'https://github.com/x/y/releases/tag/v1.0.0.109',
        firefox: 'https://github.com/x/y/releases/download/v1.0.0.109/a.xpi',
        chromium: 'https://github.com/x/y/releases/download/v1.0.0.109/a.zip',
    };

    it('Firefox 取 firefox 字段', () => {
        expect(parseLatestJson(payload, 'firefox')?.downloadUrl).toBe(payload.firefox);
    });

    it('Chromium 系取 chromium 字段', () => {
        expect(parseLatestJson(payload, 'chrome')?.downloadUrl).toBe(payload.chromium);
    });

    it('缺少对应安装包时回退到 Release 页面', () => {
        const partial = { version: '1.0.0.109', release: 'https://example.com/r' };
        expect(parseLatestJson(partial, 'chrome')?.downloadUrl).toBe('https://example.com/r');
    });

    it('没有 version 时返回 null', () => {
        expect(parseLatestJson({ release: 'https://example.com/r' }, 'chrome')).toBeNull();
        expect(parseLatestJson(null, 'chrome')).toBeNull();
    });
});

describe('parseReleaseApi', () => {
    const payload = {
        tag_name: 'v1.0.0.109',
        html_url: 'https://github.com/x/y/releases/tag/v1.0.0.109',
        assets: [
            { name: 'mugennewtab-1.0.0.109.xpi', browser_download_url: 'https://example.com/a.xpi' },
            { name: 'mugen_newtab-chromium.zip', browser_download_url: 'https://example.com/a.zip' },
        ],
    };

    it('去掉 tag 前缀 v 并按浏览器挑包', () => {
        const parsed = parseReleaseApi(payload, 'firefox');
        expect(parsed?.version).toBe('1.0.0.109');
        expect(parsed?.downloadUrl).toBe('https://example.com/a.xpi');
    });

    it('无可用资产时回退到 Release 页面', () => {
        const parsed = parseReleaseApi({ ...payload, assets: [] }, 'chrome');
        expect(parsed?.downloadUrl).toBe(payload.html_url);
    });
});

describe('useUpdateCheck', () => {
    it('读不到当前版本（非扩展环境）时不发请求', async () => {
        const fetchLatest = vi.fn(async () => makeRelease('9.9.9'));
        const check = useUpdateCheck({ currentVersion: null, fetchLatest });

        await check.check();

        expect(fetchLatest).not.toHaveBeenCalled();
        expect(check.hasUpdate.value).toBe(false);
    });

    it('发现更高版本时 hasUpdate / visible 为真', async () => {
        const check = useUpdateCheck({
            currentVersion: '1.0.0.108',
            fetchLatest: async () => makeRelease('1.0.0.109'),
        });

        await check.check();

        expect(check.latestVersion.value).toBe('1.0.0.109');
        expect(check.hasUpdate.value).toBe(true);
        expect(check.visible.value).toBe(true);
    });

    it('版本相同或更低时不提示', async () => {
        const check = useUpdateCheck({
            currentVersion: '1.0.0.109',
            fetchLatest: async () => makeRelease('1.0.0.109'),
        });

        await check.check();

        expect(check.hasUpdate.value).toBe(false);
        expect(check.visible.value).toBe(false);
    });

    it('6 小时内的缓存结果不会再发请求', async () => {
        const cached = {
            checkedAt: Date.now() - 60 * 1000,
            release: makeRelease('1.0.0.109'),
        };
        mockStorage({ [STORAGE_KEYS.UPDATE_CHECK_CACHE]: cached });

        const fetchLatest = vi.fn(async () => makeRelease('1.0.0.200'));
        const check = useUpdateCheck({ currentVersion: '1.0.0.108', fetchLatest });

        await check.check();

        expect(fetchLatest).not.toHaveBeenCalled();
        // 直接复用缓存里的版本
        expect(check.latestVersion.value).toBe('1.0.0.109');
        expect(check.visible.value).toBe(true);
    });

    it('缓存过期后重新请求', async () => {
        const cached = {
            checkedAt: Date.now() - 7 * 60 * 60 * 1000,
            release: makeRelease('1.0.0.109'),
        };
        mockStorage({ [STORAGE_KEYS.UPDATE_CHECK_CACHE]: cached });

        const fetchLatest = vi.fn(async () => makeRelease('1.0.0.110'));
        const check = useUpdateCheck({ currentVersion: '1.0.0.108', fetchLatest });

        await check.check();

        expect(fetchLatest).toHaveBeenCalledTimes(1);
        expect(check.latestVersion.value).toBe('1.0.0.110');
        expect(mocks.set).toHaveBeenCalledWith(
            STORAGE_KEYS.UPDATE_CHECK_CACHE,
            expect.objectContaining({ release: expect.objectContaining({ version: '1.0.0.110' }) })
        );
    });

    it('force 为真时忽略缓存间隔', async () => {
        mockStorage({
            [STORAGE_KEYS.UPDATE_CHECK_CACHE]: {
                checkedAt: Date.now(),
                release: makeRelease('1.0.0.109'),
            },
        });

        const fetchLatest = vi.fn(async () => makeRelease('1.0.0.111'));
        const check = useUpdateCheck({ currentVersion: '1.0.0.108', fetchLatest });

        await check.check(true);

        expect(fetchLatest).toHaveBeenCalledTimes(1);
        expect(check.latestVersion.value).toBe('1.0.0.111');
    });

    it('忽略当前版本后不再显示，并写入存储', async () => {
        const check = useUpdateCheck({
            currentVersion: '1.0.0.108',
            fetchLatest: async () => makeRelease('1.0.0.109'),
        });

        await check.check();
        expect(check.visible.value).toBe(true);

        await check.dismiss();

        expect(check.visible.value).toBe(false);
        expect(mocks.set).toHaveBeenCalledWith(
            STORAGE_KEYS.UPDATE_DISMISSED_VERSION,
            '1.0.0.109'
        );
    });

    it('已忽略的版本在下次打开时依然不提示', async () => {
        mockStorage({
            [STORAGE_KEYS.UPDATE_CHECK_CACHE]: {
                checkedAt: Date.now(),
                release: makeRelease('1.0.0.109'),
            },
            [STORAGE_KEYS.UPDATE_DISMISSED_VERSION]: '1.0.0.109',
        });

        const check = useUpdateCheck({
            currentVersion: '1.0.0.108',
            fetchLatest: async () => null,
        });

        await check.check();

        expect(check.hasUpdate.value).toBe(true);
        expect(check.visible.value).toBe(false);
    });

    it('请求失败时静默，不抛错也不清空已有结果', async () => {
        mockStorage({
            [STORAGE_KEYS.UPDATE_CHECK_CACHE]: {
                checkedAt: Date.now() - 7 * 60 * 60 * 1000,
                release: makeRelease('1.0.0.109'),
            },
        });

        const check = useUpdateCheck({
            currentVersion: '1.0.0.108',
            fetchLatest: async () => null,
        });

        await expect(check.check()).resolves.toBeUndefined();
        expect(check.latestVersion.value).toBe('1.0.0.109');
    });

    it('openDownload 打开下载地址', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

        const check = useUpdateCheck({
            currentVersion: '1.0.0.108',
            fetchLatest: async () => makeRelease('1.0.0.109'),
        });

        await check.check();
        check.openDownload();

        expect(openSpy).toHaveBeenCalledWith(
            'https://example.com/mugen-1.0.0.109.xpi',
            '_blank'
        );
    });
});
