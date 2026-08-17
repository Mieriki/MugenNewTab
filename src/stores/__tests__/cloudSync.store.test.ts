import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCloudSyncStore } from '../cloudSync.store';
import { useAppDataStore } from '../appData.store';
import { storageManager } from '@/services/storage.service';
import { browserApi } from '@/services/browserApi.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { AppNavigatorData, Category } from '@/types/app';
import type { GitHubUserInfo } from '@/types/cloudSync.types';

const TEST_TOKEN = 'ghp_testtoken';
const TEST_GIST_ID = 'gist_123';
const TEST_USER_API = { login: 'testuser', id: 1, avatar_url: 'https://avatar.url' };
const TEST_USER: GitHubUserInfo = { login: 'testuser', id: 1, avatar: 'https://avatar.url' };

function createResponse(body: unknown, status = 200, statusText = 'OK'): Response {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        status,
        statusText,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(text)
    } as Response;
}

function mockFetchSequence(responses: Response[]) {
    let index = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
        const response = responses[index++] ?? createResponse({}, 404);
        return Promise.resolve(response);
    });
}

/** 构造 Gist 响应；不传内容时默认带一份空同步数据（provider 会读取文件内容校验 Gist 有效性） */
function createGistResponse(content?: unknown): Response {
    const defaultSyncData = { version: '1.0', lastModified: 0, device: 'Browser', data: {} };
    return createResponse({
        id: TEST_GIST_ID,
        files: {
            'mugen-newtab-sync.json': {
                content: content !== undefined
                    ? (typeof content === 'string' ? content : JSON.stringify(content))
                    : JSON.stringify(defaultSyncData)
            }
        }
    });
}

describe('cloudSync store', () => {
    beforeEach(async () => {
        setActivePinia(createPinia());
        localStorage.clear();
        browserApi.resetDetection();
        // 预置合法应用数据，避免 appData.loadData 依赖网络请求 defaultData.json
        await storageManager.setMany({
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('初始化后状态为空', () => {
        const store = useCloudSyncStore();
        expect(store.token).toBeNull();
        expect(store.gistId).toBeNull();
        expect(store.autoSync).toBe(false);
        expect(store.userInfo).toBeNull();
        expect(store.lastSyncTime).toBe(0);
        expect(store.isLoggedIn).toBe(false);
        expect(store.isLoading).toBe(false);
    });

    it('init 从 storage 加载设置', async () => {
        await storageManager.setMany({
            [STORAGE_KEYS.CLOUD_TOKEN]: TEST_TOKEN,
            [STORAGE_KEYS.CLOUD_GIST_ID]: TEST_GIST_ID,
            [STORAGE_KEYS.CLOUD_AUTO_SYNC]: true,
            [STORAGE_KEYS.CLOUD_LAST_SYNC_TIME]: 123456,
            [STORAGE_KEYS.CLOUD_USER_INFO]: TEST_USER
        });

        // init 会验证 token；autoSync 为 true 时还会尝试启动拉取，但 mock 只提供 /user 响应
        mockFetchSequence([createResponse(TEST_USER_API)]);

        const store = useCloudSyncStore();
        await store.init();

        expect(store.token).toBe(TEST_TOKEN);
        expect(store.gistId).toBe(TEST_GIST_ID);
        expect(store.autoSync).toBe(true);
        expect(store.userInfo).toEqual(TEST_USER);
        expect(store.lastSyncTime).toBe(123456);
        expect(store.isLoggedIn).toBe(true);
    });

    it('setAutoSync 会持久化到 storage', async () => {
        const store = useCloudSyncStore();
        await store.setAutoSync(true);
        expect(store.autoSync).toBe(true);
        const saved = await storageManager.get(STORAGE_KEYS.CLOUD_AUTO_SYNC);
        expect(saved).toBe(true);
    });

    it('login 验证 Token 后更新状态并持久化', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API), // GET /user
            createResponse([]), // GET /gists
            createResponse({ id: TEST_GIST_ID, files: {} }) // POST /gists
        ]);

        const store = useCloudSyncStore();
        const success = await store.login(TEST_TOKEN);

        expect(success).toBe(true);
        expect(store.token).toBe(TEST_TOKEN);
        expect(store.gistId).toBe(TEST_GIST_ID);
        expect(store.userInfo).toEqual(TEST_USER);
        expect(store.isLoggedIn).toBe(true);

        const savedToken = await storageManager.get(STORAGE_KEYS.CLOUD_TOKEN);
        const savedGistId = await storageManager.get(STORAGE_KEYS.CLOUD_GIST_ID);
        expect(savedToken).toBe(TEST_TOKEN);
        expect(savedGistId).toBe(TEST_GIST_ID);
    });

    it('login 验证失败时不保存 Token', async () => {
        mockFetchSequence([createResponse({ message: 'Bad credentials' }, 401)]);

        const store = useCloudSyncStore();
        const success = await store.login('invalid_token');

        expect(success).toBe(false);
        expect(store.token).toBeNull();
        expect(store.isLoggedIn).toBe(false);

        const savedToken = await storageManager.get(STORAGE_KEYS.CLOUD_TOKEN);
        expect(savedToken).toBeNull();
    });

    it('logout 清空状态并持久化', async () => {
        // 先登录
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        const store = useCloudSyncStore();
        await store.login(TEST_TOKEN);
        expect(store.isLoggedIn).toBe(true);

        await store.logout();

        expect(store.token).toBeNull();
        expect(store.gistId).toBeNull();
        expect(store.userInfo).toBeNull();
        expect(store.lastSyncTime).toBe(0);
        expect(store.isLoggedIn).toBe(false);

        const savedToken = await storageManager.get(STORAGE_KEYS.CLOUD_TOKEN);
        expect(savedToken).toBeNull();
    });

    it('upload 上传数据并更新 lastSyncTime', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        const store = useCloudSyncStore();
        await store.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(), // findOrCreateGist -> getGist
            createGistResponse() // PATCH /gists
        ]);
        const result = await store.upload({ silent: true });

        expect(result.success).toBe(true);
        expect(result.time).toBeDefined();
        expect(store.lastSyncTime).toBe(result.time);
        expect(store.lastSyncTime).toBeGreaterThan(0);
    });

    it('upload 前通过 appData.syncNow 将内存变更持久化', async () => {
        const appData = useAppDataStore();
        appData.data.categories.push({
            id: 'cat_new',
            name: '新分类',
            icon: '/image/icons/folder.svg'
        });

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        const store = useCloudSyncStore();
        await store.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(),
            createGistResponse()
        ]);
        await store.upload({ silent: true });

        const saved = await storageManager.get(STORAGE_KEYS.MAIN_DATA) as AppNavigatorData;
        expect(saved.categories.some((c) => c.id === 'cat_new')).toBe(true);
    });

    it('download 从 Gist 下载数据', async () => {
        const syncData = {
            version: '1.0',
            lastModified: Date.now(),
            device: 'Browser',
            data: { [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [] } }
        };

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        const store = useCloudSyncStore();
        await store.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(syncData), // findOrCreateGist -> getGist
            createGistResponse(syncData) // download -> getGist
        ]);
        const result = await store.download();

        expect(result.success).toBe(true);
        expect(result.data).toEqual(syncData);
    });

    it('pullAndApply 将云端快照应用到本地 appData', async () => {
        const appData = useAppDataStore();
        await appData.loadData();

        const remoteData: AppNavigatorData = {
            categories: [{ id: 'cat_remote', name: '远程分类', icon: '/image/icons/folder.svg' }],
            apps: []
        };
        const syncData = {
            version: '1.0',
            lastModified: Date.now() + 10000,
            device: 'Browser',
            data: { [STORAGE_KEYS.MAIN_DATA]: remoteData }
        };

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        const store = useCloudSyncStore();
        await store.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(syncData),
            createGistResponse(syncData)
        ]);
        const result = await store.pullAndApply({ force: true });

        expect(result.success).toBe(true);
        expect(result.applied).toBe(true);
        expect(appData.categories.some((c) => c.id === 'cat_remote')).toBe(true);
    });

    it('pullAndApply 用户取消时不应用云端数据', async () => {
        const store = useCloudSyncStore();
        store.setUIAdapter({
            showToast: () => {},
            showConfirm: async () => false,
            showPrompt: async () => null
        });

        const syncData = {
            version: '1.0',
            lastModified: Date.now() + 10000,
            device: 'Browser',
            data: { [STORAGE_KEYS.MAIN_DATA]: { categories: [{ id: 'cat_remote', name: '远程分类' }], apps: [] } }
        };

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        await store.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(syncData),
            createGistResponse(syncData)
        ]);
        const result = await store.pullAndApply({ force: true });

        expect(result.success).toBe(true);
        expect(result.applied).toBe(false);
        expect(result.message).toContain('取消');
    });

    it('存储写入失败时状态回滚', async () => {
        const store = useCloudSyncStore();
        const spy = vi.spyOn(storageManager, 'setMany').mockRejectedValueOnce(new Error('Storage full'));

        await expect(store.setAutoSync(true)).rejects.toThrow('Storage full');
        expect(store.autoSync).toBe(false);

        spy.mockRestore();
    });

    it('scheduleAutoSync 不会在没有登录时触发网络请求', () => {
        globalThis.fetch = vi.fn();
        const store = useCloudSyncStore();
        store.scheduleAutoSync();
        // 自动同步是 3s 防抖，立即检查不应调用 fetch
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('sync 双向合并：远端新增应用到本地，base 与 lastSyncTime 更新', async () => {
        const appData = useAppDataStore();
        await appData.loadData();

        // appData 内存数据会被 normalize 注入「全部应用」兜底分类（见 appData.store 的 createDefaultAllCategory），
        // 远端数据需包含它才能与本地对齐；此处使用字面量避免 reactive proxy 无法写入存储
        const allCategory: Category = { id: 'all', name: '全部应用', icon: './image/icons/menu.svg', monochrome: true };
        const remoteData: AppNavigatorData = {
            categories: [allCategory, { id: 'cat_remote', name: '远程分类', icon: '/image/icons/folder.svg' }],
            apps: []
        };
        const syncData = {
            version: '1.0',
            lastModified: Date.now(),
            device: 'Browser',
            data: {
                [STORAGE_KEYS.MAIN_DATA]: remoteData,
                [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
            }
        };

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        const store = useCloudSyncStore();
        await store.login(TEST_TOKEN);
        expect(typeof store.sync).toBe('function');

        mockFetchSequence([
            createGistResponse(syncData), // findOrCreateGist -> getGist
            createGistResponse(syncData) // download -> getGist（merged 与远端一致，无需 PATCH）
        ]);
        const result = await store.sync({ silent: true });

        expect(result.success).toBe(true);
        expect(result.applied).toBe(true);
        expect(result.uploaded).toBe(false);
        // 远端新增分类已合并进本地
        expect(appData.categories.some((c) => c.id === 'cat_remote')).toBe(true);
        // 状态回同步
        expect(store.lastSyncTime).toBe(result.time);
        expect(store.lastSyncTime).toBeGreaterThan(0);
        // base 快照已写入合并结果
        const base = await storageManager.get(STORAGE_KEYS.CLOUD_SYNC_BASE) as Record<string, AppNavigatorData>;
        expect(base[STORAGE_KEYS.MAIN_DATA].categories.some((c) => c.id === 'cat_remote')).toBe(true);
    });

    it('sync 本地与云端一致时不应用也不上传', async () => {
        const appData = useAppDataStore();
        await appData.loadData();

        // 预置 base = 本地 = 远端（本地数据经 normalize 后含「全部应用」兜底分类）
        const mainData: AppNavigatorData = {
            categories: [{ id: 'all', name: '全部应用', icon: './image/icons/menu.svg', monochrome: true }],
            apps: []
        };
        const uiLib = { categories: [], items: [] };
        await storageManager.setMany({
            [STORAGE_KEYS.MAIN_DATA]: mainData,
            [STORAGE_KEYS.USER_UI_LIB]: uiLib,
            [STORAGE_KEYS.CLOUD_SYNC_BASE]: {
                [STORAGE_KEYS.MAIN_DATA]: mainData,
                [STORAGE_KEYS.USER_UI_LIB]: uiLib
            }
        });
        const syncData = {
            version: '1.0',
            lastModified: Date.now(),
            device: 'Browser',
            data: {
                [STORAGE_KEYS.MAIN_DATA]: mainData,
                [STORAGE_KEYS.USER_UI_LIB]: uiLib
            }
        };

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);
        const store = useCloudSyncStore();
        await store.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(syncData),
            createGistResponse(syncData)
        ]);
        const result = await store.sync({ silent: true });

        expect(result.success).toBe(true);
        expect(result.applied).toBe(false);
        expect(result.uploaded).toBe(false);
        expect(store.isLoading).toBe(false);
        expect(store.error).toBeNull();
    });
});
