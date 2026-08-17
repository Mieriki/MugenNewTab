/**
 * 云同步 Store
 * 管理 GitHub Gist 云同步相关状态：token、gistId、autoSync、userInfo、lastSyncTime。
 * 注入 CloudSyncService 与 appData store 实现上传、下载、恢复功能。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { storageManager } from '@/services/storage.service';
import { CloudSyncService, createCloudSyncService } from '@/services/cloudSync.service';
import { useAppDataStore } from './appData.store';
import type {
    ICloudSyncUIAdapter,
    ICloudSyncStorageAdapter,
    CloudSyncProviderId,
    GitHubUserInfo,
    UploadResult,
    DownloadResult,
    PullResult,
    SyncResult
} from '@/types/cloudSync.types';

/** 默认 UI 适配器：Store 不直接操作 UI，默认无提示 / 自动确认 */
const DEFAULT_UI_ADAPTER: ICloudSyncUIAdapter = {
    showToast: () => {},
    showConfirm: async () => true,
    showPrompt: async () => null
};

export const useCloudSyncStore = defineStore('cloudSync', () => {
    const appData = useAppDataStore();
    const uiAdapter = ref<ICloudSyncUIAdapter>(DEFAULT_UI_ADAPTER);

    /** GitHub Token */
    const token = ref<string | null>(null);
    /** 同步用 Gist ID */
    const gistId = ref<string | null>(null);
    /** 是否开启自动同步 */
    const autoSync = ref(false);
    /** GitHub 用户信息缓存 */
    const userInfo = ref<GitHubUserInfo | null>(null);
    /** 上次同步时间戳 */
    const lastSyncTime = ref(0);
    /** 当前连接的同步平台 */
    const provider = ref<CloudSyncProviderId>('github');
    /** 是否正在执行云同步操作 */
    const isLoading = ref(false);
    /** 最近一次错误信息 */
    const error = ref<string | null>(null);

    /** CloudSyncService 实例，懒创建 */
    let cloudSyncService: CloudSyncService | null = null;

    function getService(): CloudSyncService {
        if (!cloudSyncService) {
            cloudSyncService = createCloudSyncService({
                storage: storageManager as unknown as ICloudSyncStorageAdapter,
                dataManager: appData,
                ui: uiAdapter.value
            });
        }
        return cloudSyncService;
    }

    /** 重新创建 CloudSyncService（例如 UI 适配器变更后） */
    function resetService(): void {
        cloudSyncService = null;
    }

    /** 将 CloudSyncService 的内部状态同步回 Store */
    function syncStateFromService(): void {
        const settings = getService().settings;
        token.value = settings.token;
        gistId.value = settings.gistId;
        autoSync.value = settings.autoSync;
        userInfo.value = settings.userInfo;
        lastSyncTime.value = settings.lastSyncTime;
        provider.value = settings.provider;
    }

    /**
     * 设置 UI 适配器
     * 应用层可通过此方法注入真实的 Toast / Confirm / Prompt 实现。
     */
    function setUIAdapter(adapter: ICloudSyncUIAdapter): void {
        uiAdapter.value = adapter;
        resetService();
    }

    /**
     * 初始化：加载设置、验证已有 Token、按需启动时拉取。
     */
    async function init(): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            await getService().init();
            syncStateFromService();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * 使用 Token 登录
     * 验证通过后会持久化并尝试查找/创建 Gist。
     */
    async function login(inputToken: string, providerId?: CloudSyncProviderId): Promise<boolean> {
        isLoading.value = true;
        error.value = null;
        try {
            const success = await getService().saveToken(inputToken, providerId);
            syncStateFromService();
            return success;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * 退出登录，清空云同步配置。
     */
    async function logout(): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            await getService().logout();
            syncStateFromService();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * 切换自动同步开关。
     */
    async function setAutoSync(enabled: boolean): Promise<void> {
        await getService().setAutoSync(enabled);
        syncStateFromService();
    }

    /**
     * 上传本地数据到 Gist。
     */
    async function upload(options?: { silent?: boolean }): Promise<UploadResult> {
        isLoading.value = true;
        error.value = null;
        try {
            const result = await getService().upload(options);
            syncStateFromService();
            return result;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * 双向增量同步：下载云端数据与本地三方合并（冲突本地优先），
     * 按需应用与上传。手动「立即同步」、自动同步与启动拉取均走此入口。
     */
    async function sync(options?: { silent?: boolean }): Promise<SyncResult> {
        isLoading.value = true;
        error.value = null;
        try {
            const result = await getService().sync(options);
            syncStateFromService();
            return result;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * 从 Gist 下载数据，不自动应用到本地。
     */
    async function download(): Promise<DownloadResult> {
        isLoading.value = true;
        error.value = null;
        try {
            return await getService().download();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * 拉取云端数据并应用到本地。
     */
    async function pullAndApply(options?: { force?: boolean; silent?: boolean }): Promise<PullResult> {
        isLoading.value = true;
        error.value = null;
        try {
            const result = await getService().pullAndApply(options);
            syncStateFromService();
            return result;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * 显示 Token 输入对话框并尝试登录。
     */
    async function showLoginDialog(): Promise<void> {
        await getService().showLoginDialog();
        syncStateFromService();
    }

    /**
     * 触发自动同步（防抖）。
     */
    function scheduleAutoSync(): void {
        getService().scheduleAutoSync();
    }

    /** 是否已登录 */
    const isLoggedIn = computed(() => !!token.value);

    /** 是否正在同步（来自 CloudSyncService） */
    const isSyncing = computed(() => getService().isSyncing);

    return {
        // State
        token,
        gistId,
        autoSync,
        userInfo,
        lastSyncTime,
        provider,
        isLoading,
        error,
        // Getters
        isLoggedIn,
        isSyncing,
        // Actions
        init,
        login,
        logout,
        setAutoSync,
        upload,
        sync,
        download,
        pullAndApply,
        showLoginDialog,
        scheduleAutoSync,
        setUIAdapter
    };
});
