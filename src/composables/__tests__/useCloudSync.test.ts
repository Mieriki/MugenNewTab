import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useCloudSync } from '../useCloudSync';
import { storageManager } from '@/services/storage.service';
import { browserApi } from '@/services/browserApi.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { GitHubUserInfo, ICloudSyncUIAdapter } from '@/types/cloudSync.types';

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

function createGistResponse(content?: unknown): Response {
    return createResponse({
        id: TEST_GIST_ID,
        files: {
            'mugen-newtab-sync.json': content !== undefined
                ? { content: typeof content === 'string' ? content : JSON.stringify(content) }
                : {}
        }
    });
}

function createTestComponent(options: Parameters<typeof useCloudSync>[0] = {}) {
    return defineComponent({
        setup() {
            const cloud = useCloudSync(options);
            return { cloud };
        },
        render() {
            return h('div');
        }
    });
}

describe('useCloudSync composable', () => {
    enableAutoUnmount(afterEach);

    beforeEach(async () => {
        setActivePinia(createPinia());
        localStorage.clear();
        browserApi.resetDetection();
        await storageManager.setMany({
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('挂载后初始状态为空', async () => {
        mockFetchSequence([createResponse({})]);
        const wrapper = mount(createTestComponent());
        await flushPromises();

        expect(wrapper.vm.cloud.token.value).toBeNull();
        expect(wrapper.vm.cloud.gistId.value).toBeNull();
        expect(wrapper.vm.cloud.autoSync.value).toBe(false);
        expect(wrapper.vm.cloud.userInfo.value).toBeNull();
        expect(wrapper.vm.cloud.lastSyncTime.value).toBe(0);
        expect(wrapper.vm.cloud.isLoading.value).toBe(false);
        expect(wrapper.vm.cloud.isLoggedIn.value).toBe(false);
        expect(wrapper.vm.cloud.statusText.value).toBe('未连接');
        expect(wrapper.vm.cloud.formattedLastSyncTime.value).toBe('从未同步');
    });

    it('挂载后自动初始化并加载存储设置', async () => {
        await storageManager.setMany({
            [STORAGE_KEYS.CLOUD_TOKEN]: TEST_TOKEN,
            [STORAGE_KEYS.CLOUD_GIST_ID]: TEST_GIST_ID,
            [STORAGE_KEYS.CLOUD_AUTO_SYNC]: true,
            [STORAGE_KEYS.CLOUD_USER_INFO]: TEST_USER
        });
        mockFetchSequence([createResponse(TEST_USER_API)]);

        const wrapper = mount(createTestComponent());
        await flushPromises();

        expect(wrapper.vm.cloud.token.value).toBe(TEST_TOKEN);
        expect(wrapper.vm.cloud.gistId.value).toBe(TEST_GIST_ID);
        expect(wrapper.vm.cloud.autoSync.value).toBe(true);
        expect(wrapper.vm.cloud.userInfo.value).toEqual(TEST_USER);
        expect(wrapper.vm.cloud.isLoggedIn.value).toBe(true);
        expect(wrapper.vm.cloud.statusText.value).toBe('已连接：testuser');
    });

    it('login 验证 Token 后更新状态并持久化', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent());
        await flushPromises();

        const result = await wrapper.vm.cloud.login(TEST_TOKEN);

        expect(result).toBe(true);
        expect(wrapper.vm.cloud.token.value).toBe(TEST_TOKEN);
        expect(wrapper.vm.cloud.gistId.value).toBe(TEST_GIST_ID);
        expect(wrapper.vm.cloud.userInfo.value).toEqual(TEST_USER);
        expect(wrapper.vm.cloud.isLoggedIn.value).toBe(true);

        const savedToken = await storageManager.get(STORAGE_KEYS.CLOUD_TOKEN);
        expect(savedToken).toBe(TEST_TOKEN);
    });

    it('login 验证失败时不保存 Token', async () => {
        mockFetchSequence([createResponse({ message: 'Bad credentials' }, 401)]);

        const wrapper = mount(createTestComponent());
        await flushPromises();

        const result = await wrapper.vm.cloud.login('invalid_token');

        expect(result).toBe(false);
        expect(wrapper.vm.cloud.isLoggedIn.value).toBe(false);

        const savedToken = await storageManager.get(STORAGE_KEYS.CLOUD_TOKEN);
        expect(savedToken).toBeNull();
    });

    it('logout 清空状态并持久化', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);
        expect(wrapper.vm.cloud.isLoggedIn.value).toBe(true);

        await wrapper.vm.cloud.logout();

        expect(wrapper.vm.cloud.token.value).toBeNull();
        expect(wrapper.vm.cloud.gistId.value).toBeNull();
        expect(wrapper.vm.cloud.userInfo.value).toBeNull();
        expect(wrapper.vm.cloud.lastSyncTime.value).toBe(0);
        expect(wrapper.vm.cloud.isLoggedIn.value).toBe(false);

        const savedToken = await storageManager.get(STORAGE_KEYS.CLOUD_TOKEN);
        expect(savedToken).toBeNull();
    });

    it('upload 上传数据并更新 lastSyncTime', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(),
            createGistResponse()
        ]);

        const result = await wrapper.vm.cloud.upload({ silent: true });

        expect(result.success).toBe(true);
        expect(result.time).toBeDefined();
        expect(wrapper.vm.cloud.lastSyncTime.value).toBe(result.time);
        expect(wrapper.vm.cloud.lastSyncTime.value).toBeGreaterThan(0);
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

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(syncData),
            createGistResponse(syncData)
        ]);

        const result = await wrapper.vm.cloud.download();

        expect(result.success).toBe(true);
        expect(result.data).toEqual(syncData);
    });

    it('pullAndApply 将云端快照应用到本地', async () => {
        const remoteData = {
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

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);

        mockFetchSequence([
            createGistResponse(syncData),
            createGistResponse(syncData)
        ]);

        const result = await wrapper.vm.cloud.pullAndApply({ force: true });

        expect(result.success).toBe(true);
        expect(result.applied).toBe(true);
    });

    it('setAutoSync 持久化到存储', async () => {
        mockFetchSequence([createResponse({})]);
        const wrapper = mount(createTestComponent());
        await flushPromises();

        await wrapper.vm.cloud.setAutoSync(true);
        expect(wrapper.vm.cloud.autoSync.value).toBe(true);

        const saved = await storageManager.get(STORAGE_KEYS.CLOUD_AUTO_SYNC);
        expect(saved).toBe(true);
    });

    it('数据变更事件触发自动同步', async () => {
        vi.useFakeTimers();

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);
        await wrapper.vm.cloud.setAutoSync(true);
        await flushPromises();

        mockFetchSequence([
            createGistResponse(),
            createGistResponse()
        ]);

        window.dispatchEvent(new CustomEvent('appNavigator:data-changed', {
            detail: { kind: 'data', source: 'local' }
        }));

        vi.advanceTimersByTime(3000);
        await flushPromises();

        expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });

    it('未登录时数据变更不会触发自动同步', async () => {
        vi.useFakeTimers();
        mockFetchSequence([createResponse({})]);

        mount(createTestComponent());
        await flushPromises();

        const fetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

        window.dispatchEvent(new CustomEvent('appNavigator:data-changed', {
            detail: { kind: 'data', source: 'local' }
        }));

        vi.advanceTimersByTime(3000);
        await flushPromises();

        expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCount);
    });

    it('cancelPending 取消未完成的操作并清理自动同步定时器', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);

        // 挂起一个不会 resolve 的 fetch，用于验证取消
        globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => undefined));

        const pending = wrapper.vm.cloud.upload({ silent: true });
        wrapper.vm.cloud.cancelPending();

        await expect(pending).rejects.toThrow('Operation aborted');
    });

    it('卸载后取消未完成的操作并移除事件监听', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);

        globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => undefined));

        const pending = wrapper.vm.cloud.upload({ silent: true });
        wrapper.unmount();

        await expect(pending).rejects.toThrow('Operation aborted');

        // 卸载后再触发数据变更事件，不应抛出未处理错误或增加 fetch 调用
        const fetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
        window.dispatchEvent(new CustomEvent('appNavigator:data-changed', {
            detail: { kind: 'data', source: 'local' }
        }));
        await flushPromises();
        expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCount);
    });

    it('接受自定义 UI 适配器', async () => {
        const showToast = vi.fn();
        const showConfirm = vi.fn().mockResolvedValue(true);
        const showPrompt = vi.fn().mockResolvedValue(TEST_TOKEN);
        const uiAdapter: ICloudSyncUIAdapter = { showToast, showConfirm, showPrompt };

        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent({ uiAdapter }));
        await flushPromises();

        await wrapper.vm.cloud.showLoginDialog();
        await flushPromises();

        expect(showPrompt).toHaveBeenCalled();
        expect(wrapper.vm.cloud.isLoggedIn.value).toBe(true);
    });

    it('formattedLastSyncTime 在同步后更新', async () => {
        mockFetchSequence([
            createResponse(TEST_USER_API),
            createResponse([]),
            createResponse({ id: TEST_GIST_ID, files: {} })
        ]);

        const wrapper = mount(createTestComponent());
        await flushPromises();
        await wrapper.vm.cloud.login(TEST_TOKEN);

        expect(wrapper.vm.cloud.formattedLastSyncTime.value).toBe('从未同步');

        mockFetchSequence([
            createGistResponse(),
            createGistResponse()
        ]);
        await wrapper.vm.cloud.upload({ silent: true });

        expect(wrapper.vm.cloud.formattedLastSyncTime.value).not.toBe('从未同步');
    });
});
