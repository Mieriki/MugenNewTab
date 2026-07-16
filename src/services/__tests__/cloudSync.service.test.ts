import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudSyncService } from '@/services/cloudSync.service';
import type {
    ICloudSyncStorageAdapter,
    ICloudSyncDataManager,
    ICloudSyncUIAdapter
} from '@/types/cloudSync.types';

function createMockStorage(): ICloudSyncStorageAdapter {
    const store = new Map<string, unknown>();
    return {
        get: vi.fn((key: string) => Promise.resolve(store.has(key) ? store.get(key) : null)) as unknown as ICloudSyncStorageAdapter['get'],
        set: vi.fn(async (key: string, value: unknown) => {
            store.set(key, value);
        }),
        setMany: vi.fn(async (items: Record<string, unknown>) => {
            Object.entries(items).forEach(([key, value]) => {
                store.set(key, value);
            });
        })
    };
}

function createMockDataManager(): ICloudSyncDataManager {
    return {
        syncNow: vi.fn(async () => undefined),
        applyStorageSnapshot: vi.fn(async () => true)
    };
}

function createMockUI(): ICloudSyncUIAdapter {
    return {
        showToast: vi.fn(),
        showConfirm: vi.fn(async () => true),
        showPrompt: vi.fn(async () => null)
    };
}

function createService() {
    const storage = createMockStorage();
    const dataManager = createMockDataManager();
    const ui = createMockUI();
    const service = new CloudSyncService({ storage, dataManager, ui });
    return { service, storage, dataManager, ui };
}

describe('CloudSyncService', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllTimers();
    });

    it('初始状态为未登录', () => {
        const { service } = createService();
        expect(service.isLoggedIn).toBe(false);
        expect(service.isSyncing).toBe(false);
        expect(service.settings.token).toBeNull();
        expect(service.settings.autoSync).toBe(false);
    });

    it('loadSettings 从存储读取配置', async () => {
        const { service, storage } = createService();
        const store = (storage.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('ghp_test');
        await service.loadSettings();
        expect(store).toHaveBeenCalledWith('appNavigator_cloudSync_token');
    });

    it('saveToken 拒绝空字符串', async () => {
        const { service, ui } = createService();
        const result = await service.saveToken('   ');
        expect(result).toBe(false);
        expect(ui.showToast).toHaveBeenCalledWith('请输入 GitHub Token', 'error');
    });

    it('validateToken 无 Token 返回 false', async () => {
        const { service } = createService();
        const result = await service.validateToken(null);
        expect(result).toBe(false);
    });

    it('validateToken 成功时解析用户信息并保存', async () => {
        const { service, storage } = createService();
        const mockFetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ login: 'tester', id: 123, avatar_url: 'https://avatar.png' })
        });
        vi.stubGlobal('fetch', mockFetch);

        const result = await service.validateToken('ghp_valid');
        expect(result).toBe(true);
        expect(service.settings.userInfo).toEqual({
            login: 'tester',
            id: 123,
            avatar: 'https://avatar.png'
        });
        expect(storage.setMany).toHaveBeenCalledWith(
            expect.objectContaining({
                appNavigator_cloudSync_userInfo: {
                    login: 'tester',
                    id: 123,
                    avatar: 'https://avatar.png'
                },
                appNavigator_cloudSync_token: 'ghp_valid'
            })
        );
    });

    it('findOrCreateGist 在未登录时抛出错误', async () => {
        const { service } = createService();
        await expect(service.findOrCreateGist()).rejects.toThrow('未配置 GitHub Token');
    });

    it('upload 在未登录时返回错误', async () => {
        const { service, ui } = createService();
        const result = await service.upload();
        expect(result.success).toBe(false);
        expect(ui.showToast).toHaveBeenCalledWith('请先配置 GitHub Token', 'error');
    });

    it('download 在未登录时返回错误', async () => {
        const { service } = createService();
        const result = await service.download();
        expect(result.success).toBe(false);
        expect(result.message).toBe('请先配置 GitHub Token');
    });

    it('applyDownloadedData 过滤出同步键并应用快照', async () => {
        const { service, dataManager, storage } = createService();
        const syncData = {
            version: '1.0',
            lastModified: 1700000000000,
            device: 'Chrome',
            data: {
                appNavigator_data: { categories: [], apps: [] },
                appNavigator_user_uiLib: { categories: [], items: [] },
                selectedTheme: 'material-rose',
                unknown_key: 'should_be_ignored'
            }
        };
        const result = await service.applyDownloadedData(syncData);
        expect(result).toBe(true);
        expect(dataManager.applyStorageSnapshot).toHaveBeenCalledWith({
            appNavigator_data: { categories: [], apps: [] },
            appNavigator_user_uiLib: { categories: [], items: [] },
            selectedTheme: 'material-rose'
        });
        expect(storage.set).toHaveBeenCalledWith('appNavigator_cloudSync_lastSyncTime', 1700000000000);
    });

    it('scheduleAutoSync 在未开启自动同步时不启动定时器', () => {
        const { service } = createService();
        vi.useFakeTimers();
        service.scheduleAutoSync();
        vi.advanceTimersByTime(5000);
        expect(service.isSyncing).toBe(false);
        vi.useRealTimers();
    });

    it('setAutoSync 更新状态并写入存储', async () => {
        const { service, storage } = createService();
        await service.setAutoSync(true);
        expect(service.settings.autoSync).toBe(true);
        expect(storage.set).toHaveBeenCalledWith('appNavigator_cloudSync_autoSync', true);
    });
});
