/**
 * 云同步 Store
 * 管理 GitHub Gist 云同步相关状态：token、gistId、autoSync、userInfo、lastSyncTime。
 * 注入 CloudSyncService 与 appData store 实现上传、下载、恢复功能。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { storageManager } from '@/services/storage.service';
import { CloudSyncService, createCloudSyncService } from '@/services/cloudSync.service';
import { getSyncAreaStatus } from '@/services/syncStorage.service';
import {
    enableCrossDevice,
    disableCrossDevice,
    restoreCrossDeviceAuth,
    getCrossDeviceStatus,
    getStoredPassphrase
} from '@/services/crossDeviceSync.service';
import type { EnableCrossDeviceResult, CrossDeviceRemoteMeta } from '@/services/crossDeviceSync.service';
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

/** 启用浏览器同步的结果：是否已推送、是否顺带还原了其他设备的登录状态 */
export interface EnableCrossDeviceOutcome extends EnableCrossDeviceResult {
    restored: boolean;
}

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
    /** 是否启用跨设备同步登录状态 */
    const crossDeviceEnabled = ref(false);
    /** 本机是否已保存同步密码 */
    const crossDeviceHasPassphrase = ref(false);
    /** 同步区是否已有其他设备推送的加密凭据 */
    const crossDeviceRemoteAvailable = ref(false);
    /** 同步区凭据的元信息（来自哪台设备、何时推送） */
    const crossDeviceRemoteMeta = ref<CrossDeviceRemoteMeta | null>(null);
    /** 当前环境是否使用浏览器账号同步区（false = 网页预览的 localStorage 降级） */
    const syncAreaNative = ref(getSyncAreaStatus().native);

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

    /** 刷新跨设备同步相关状态 */
    async function refreshCrossDevice(): Promise<void> {
        try {
            const status = await getCrossDeviceStatus();
            crossDeviceEnabled.value = status.enabled;
            crossDeviceHasPassphrase.value = status.hasPassphrase;
            crossDeviceRemoteAvailable.value = status.remoteAvailable;
            crossDeviceRemoteMeta.value = status.remoteMeta;
            syncAreaNative.value = status.nativeSync;
        } catch (e) {
            console.warn('[CloudSync] 读取浏览器同步状态失败:', e);
        }
    }

    /**
     * 启用跨设备同步登录状态（加密）
     *
     * 已登录：立即把当前凭据加密后推送到同步区。
     * 未登录：只记住开关与密码；随后若发现同步区已有其他设备的凭据，
     *        用同一个密码尝试解密并直接登录（新设备「开启」即恢复，不必再点一次「恢复」）。
     */
    async function enableCrossDeviceSync(passphrase: string): Promise<EnableCrossDeviceOutcome> {
        error.value = null;
        try {
            const auth = token.value
                ? { token: token.value, provider: provider.value as string }
                : null;
            const result = await enableCrossDevice(passphrase, auth);
            await refreshCrossDevice();

            if (!auth && crossDeviceRemoteAvailable.value) {
                const restored = await tryRestoreCrossDevice(passphrase);
                return { pushed: result.pushed, restored };
            }
            return { ...result, restored: false };
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        }
    }

    /**
     * 用本机已保存的密码尝试还原同步区里的凭据
     *
     * 这是「另一台设备刚把凭据同步过来」时的自动恢复入口：
     * 面板打开、同步区变更、用户点「重新检查」时都会调用。
     *
     * @param passphrase 指定密码（刚开启时用）；不传则用本机保存的密码
     * @returns 是否成功还原并登录
     */
    async function tryRestoreCrossDevice(passphrase?: string): Promise<boolean> {
        if (token.value) return false;

        const password = passphrase ?? (await getStoredPassphrase());
        if (!password) {
            return false;
        }
        if (!crossDeviceRemoteAvailable.value) {
            return false;
        }

        try {
            const auth = await restoreCrossDeviceAuth(password);
            if (!auth) return false;

            const success = await login(auth.token, auth.provider as CloudSyncProviderId);
            if (success) {
                try {
                    await getService().sync({ silent: true });
                    syncStateFromService();
                } catch (e) {
                    console.warn('[CloudSync] 浏览器同步还原后拉取数据失败:', e);
                }
            }
            return success;
        } catch (e) {
            // 密码不对属于正常情况（另一台设备用了别的密码），不当作错误弹提示
            console.warn('[CloudSync] 浏览器同步自动还原失败:', e);
            return false;
        }
    }

    /** 关闭跨设备同步：清除本机口令与同步区密文 */
    async function disableCrossDeviceSync(): Promise<void> {
        error.value = null;
        try {
            await disableCrossDevice();
            await refreshCrossDevice();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        }
    }

    /**
     * 在新设备上凭口令还原登录状态
     *
     * 还原成功后会立即做一次双向合并同步，把云端数据一并拉下来；
     * 同步失败不影响登录状态（用户可以稍后手动点「立即同步」）。
     *
     * @returns 是否还原成功
     */
    async function restoreFromCrossDevice(passphrase: string): Promise<boolean> {
        error.value = null;
        try {
            const auth = await restoreCrossDeviceAuth(passphrase);
            if (!auth) {
                return false;
            }
            const success = await login(auth.token, auth.provider as CloudSyncProviderId);
            if (success) {
                try {
                    await getService().sync({ silent: true });
                    syncStateFromService();
                } catch (e) {
                    console.warn('[CloudSync] 还原登录状态后拉取数据失败:', e);
                }
            }
            await refreshCrossDevice();
            return success;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            throw e;
        }
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
            await refreshCrossDevice();
            // 服务层已尝试过还原；这里兜一次底，覆盖「本机开关是上一次会话设的」这类情况
            if (!token.value) {
                await tryRestoreCrossDevice();
                await refreshCrossDevice();
            }
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
     *
     * 注意：即使后续步骤（Gist 初始化、浏览器同步推送）抛错，Token 可能已经保存成功，
     * 因此 catch 里也要 syncStateFromService()，否则界面会停在「未连接」，
     * 用户反复点「连接」都像没反应。
     */
    async function login(inputToken: string, providerId?: CloudSyncProviderId): Promise<boolean> {
        isLoading.value = true;
        error.value = null;
        try {
            const success = await getService().saveToken(inputToken, providerId);
            syncStateFromService();
            await refreshCrossDevice();
            return success;
        } catch (e) {
            syncStateFromService();
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
            await refreshCrossDevice();
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
        crossDeviceEnabled,
        crossDeviceHasPassphrase,
        crossDeviceRemoteAvailable,
        crossDeviceRemoteMeta,
        syncAreaNative,
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
        setUIAdapter,
        refreshCrossDevice,
        enableCrossDeviceSync,
        disableCrossDeviceSync,
        restoreFromCrossDevice,
        tryRestoreCrossDevice
    };
});
