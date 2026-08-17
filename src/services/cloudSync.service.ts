import { CLOUD_SYNC_DATA_KEYS, STORAGE_KEYS } from '@/types/storage';
import { deepEqual, mergeSyncData } from '@/utils/syncMerge.util';
import type { SyncSnapshot } from '@/utils/syncMerge.util';
import { createGistProvider, SyncProviderError } from '@/services/gistProvider.service';
import type {
    CloudSyncDependencies,
    CloudSyncProviderId,
    CloudSyncSettings,
    DownloadResult,
    GitHubUserInfo,
    ICloudSyncDataManager,
    ICloudSyncStorageAdapter,
    ICloudSyncUIAdapter,
    ISyncProvider,
    PullResult,
    SyncData,
    SyncResult,
    UploadResult
} from '@/types/cloudSync.types';

const SYNC_FILE_NAME = 'mugen-newtab-sync.json';
const GIST_DESCRIPTION = 'MugenNewTab 导航数据云同步备份';

/**
 * 需要同步的本地存储键（仅站点数据与用户图标库，个性化设置不同步）
 */
const SYNC_DATA_KEYS: string[] = CLOUD_SYNC_DATA_KEYS;

/** 默认同步平台（老用户有 token 但无 provider 记录时按 GitHub 处理） */
const DEFAULT_PROVIDER: CloudSyncProviderId = 'github';

/**
 * 云同步服务
 * 通过 ISyncProvider 适配 GitHub / Gitee 的 Gist（代码片段）API。
 * 多端同步通过 `sync()` 完成：以本地保存的上次同步快照为 base 做三方合并，
 * 冲突时本地优先，避免全量覆盖丢失其他设备的修改。
 * 所有平台请求带 10s 超时，失败按网络/401/频率限制分类并 Toast 提示。
 */
export class CloudSyncService {
    private readonly storage: ICloudSyncStorageAdapter;
    private readonly dataManager: ICloudSyncDataManager;
    private readonly ui: ICloudSyncUIAdapter;

    private token: string | null = null;
    private gistId: string | null = null;
    private autoSync = false;
    private lastSyncTime = 0;
    private userInfo: GitHubUserInfo | null = null;
    private providerId: CloudSyncProviderId = DEFAULT_PROVIDER;
    private autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
    private syncInProgress = false;

    constructor(deps: CloudSyncDependencies) {
        this.storage = deps.storage;
        this.dataManager = deps.dataManager;
        this.ui = deps.ui;
    }

    /** 当前平台的同步适配器 */
    private get provider(): ISyncProvider {
        return createGistProvider(this.providerId);
    }

    /**
     * 初始化云同步服务
     * 加载设置，若已登录则验证 Token；开启自动同步时启动即执行一次双向合并同步
     */
    async init(): Promise<void> {
        await this.loadSettings();
        if (this.token) {
            const valid = await this.validateToken(this.token);
            if (valid && this.autoSync) {
                await this.sync({ silent: true });
            }
        }
    }

    /**
     * 从存储中加载云同步设置
     */
    async loadSettings(): Promise<void> {
        const token = await this.storage.get<string>(STORAGE_KEYS.CLOUD_TOKEN);
        const gistId = await this.storage.get<string>(STORAGE_KEYS.CLOUD_GIST_ID);
        const autoSync = await this.storage.get<boolean>(STORAGE_KEYS.CLOUD_AUTO_SYNC);
        const lastSyncTime = await this.storage.get<number>(STORAGE_KEYS.CLOUD_LAST_SYNC_TIME);
        const userInfo = await this.storage.get<GitHubUserInfo>(STORAGE_KEYS.CLOUD_USER_INFO);
        const providerId = await this.storage.get<CloudSyncProviderId>(STORAGE_KEYS.CLOUD_PROVIDER);

        this.token = token ?? null;
        this.gistId = gistId ?? null;
        this.autoSync = autoSync ?? false;
        this.lastSyncTime = lastSyncTime ?? 0;
        this.userInfo = userInfo ?? null;
        this.providerId = providerId ?? DEFAULT_PROVIDER;
    }

    /**
     * 将当前设置保存到存储
     */
    async saveSettings(): Promise<void> {
        await this.storage.setMany({
            [STORAGE_KEYS.CLOUD_TOKEN]: this.token,
            [STORAGE_KEYS.CLOUD_GIST_ID]: this.gistId,
            [STORAGE_KEYS.CLOUD_AUTO_SYNC]: this.autoSync,
            [STORAGE_KEYS.CLOUD_LAST_SYNC_TIME]: this.lastSyncTime,
            [STORAGE_KEYS.CLOUD_USER_INFO]: this.userInfo,
            [STORAGE_KEYS.CLOUD_PROVIDER]: this.providerId
        });
    }

    /**
     * 验证 Token 是否有效（使用当前平台）
     */
    async validateToken(token: string | null = this.token): Promise<boolean> {
        if (!token) return false;
        try {
            const user = await this.provider.validateToken(token);
            this.userInfo = user;
            if (token !== this.token) {
                this.token = token;
                await this.saveSettings();
            } else {
                await this.storage.set(STORAGE_KEYS.CLOUD_USER_INFO, this.userInfo);
            }
            return true;
        } catch (e) {
            console.error('[CloudSync] validateToken error:', e);
            return false;
        }
    }

    /**
     * 查找或创建同步用的 Gist
     */
    async findOrCreateGist(): Promise<string> {
        if (!this.token) {
            throw new Error('未配置 Token');
        }

        if (this.gistId) {
            try {
                const content = await this.provider.getGistFileContent(this.token, this.gistId, SYNC_FILE_NAME);
                if (content !== null) {
                    return this.gistId;
                }
            } catch (e) {
                console.warn('[CloudSync] stored gist not found, creating new one');
            }
        }

        const gists = await this.provider.listGists(this.token);
        const existing = gists.find((gist) => gist.files && gist.files[SYNC_FILE_NAME]);
        if (existing) {
            this.gistId = existing.id;
            await this.storage.set(STORAGE_KEYS.CLOUD_GIST_ID, this.gistId);
            return this.gistId;
        }

        this.gistId = await this.provider.createGist(
            this.token,
            SYNC_FILE_NAME,
            JSON.stringify(this.createEmptySyncData(), null, 2),
            GIST_DESCRIPTION
        );
        await this.storage.set(STORAGE_KEYS.CLOUD_GIST_ID, this.gistId);
        return this.gistId;
    }

    /**
     * 双向增量同步
     * 下载云端数据，以本地保存的上次同步快照为 base 与本地数据做三方合并（冲突本地优先），
     * 合并结果按需应用到本地并上传云端，成功后更新 base 快照。
     * 合并非破坏性，无需用户确认；失败时无论 silent 与否都会 Toast 提示。
     */
    async sync({ silent = false }: { silent?: boolean } = {}): Promise<SyncResult> {
        if (this.syncInProgress) return { success: false, message: '同步进行中' };
        if (!this.token) {
            if (!silent) this.ui.showToast('请先配置 Token', 'error');
            return { success: false, message: '请先配置 Token' };
        }

        this.syncInProgress = true;
        try {
            const gistId = await this.findOrCreateGist();
            const remote = await this.downloadSyncData(gistId);

            // 先刷入内存变更，再收集本地数据
            await this.dataManager.syncNow();
            const localData: SyncSnapshot = {};
            for (const key of SYNC_DATA_KEYS) {
                localData[key] = await this.storage.get(key);
            }

            const base = await this.storage.get<SyncSnapshot>(STORAGE_KEYS.CLOUD_SYNC_BASE);
            const merged = mergeSyncData(base, localData, remote.data ?? {});

            const applied = SYNC_DATA_KEYS.some((key) => !deepEqual(merged[key], localData[key]));
            const uploaded = SYNC_DATA_KEYS.some((key) => !deepEqual(merged[key], remote.data?.[key]));

            if (applied) {
                await this.dataManager.applyStorageSnapshot(merged);
            }
            if (uploaded) {
                await this.uploadData(gistId, merged);
            }

            this.lastSyncTime = Date.now();
            await this.storage.setMany({
                [STORAGE_KEYS.CLOUD_SYNC_BASE]: merged,
                [STORAGE_KEYS.CLOUD_LAST_SYNC_TIME]: this.lastSyncTime
            });

            if (!silent) {
                const actions = [
                    applied ? '已拉取云端更新' : '',
                    uploaded ? '已上传本地更新' : ''
                ].filter(Boolean);
                this.ui.showToast(actions.length ? `同步完成：${actions.join('，')}` : '同步完成：本地与云端已一致', 'success');
            }
            return { success: true, uploaded, applied, time: this.lastSyncTime };
        } catch (e) {
            await this.handleIfUnauthorized(e);
            const message = e instanceof Error ? e.message : String(e);
            console.error('[CloudSync] sync error:', e);
            // 失败策略：每次失败都提示（含静默的自动同步）
            this.ui.showToast('同步失败：' + message, 'error');
            return { success: false, message };
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * 上传本地数据到云端（全量覆盖远端，并用上传结果更新 base 快照）
     * 多端场景请优先使用 sync()，此方法主要用于兼容与强制上传
     */
    async upload({ silent = false }: { silent?: boolean } = {}): Promise<UploadResult> {
        if (this.syncInProgress) return { success: false, message: '同步进行中' };
        if (!this.token) {
            if (!silent) this.ui.showToast('请先配置 Token', 'error');
            return { success: false, message: '请先配置 Token' };
        }

        this.syncInProgress = true;
        try {
            const gistId = await this.findOrCreateGist();
            const syncData = await this.collectLocalData();
            await this.uploadData(gistId, syncData.data);

            this.lastSyncTime = syncData.lastModified;
            await this.storage.setMany({
                [STORAGE_KEYS.CLOUD_SYNC_BASE]: syncData.data,
                [STORAGE_KEYS.CLOUD_LAST_SYNC_TIME]: this.lastSyncTime
            });

            if (!silent) this.ui.showToast(`数据已同步到 ${this.provider.name}`, 'success');
            return { success: true, time: this.lastSyncTime };
        } catch (e) {
            await this.handleIfUnauthorized(e);
            console.error('[CloudSync] upload error:', e);
            const message = e instanceof Error ? e.message : String(e);
            // 失败策略：每次失败都提示
            this.ui.showToast('同步失败：' + message, 'error');
            return { success: false, message };
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * 从云端下载数据
     */
    async download(): Promise<DownloadResult> {
        if (this.syncInProgress) return { success: false, message: '同步进行中' };
        if (!this.token) return { success: false, message: '请先配置 Token' };

        this.syncInProgress = true;
        try {
            const gistId = await this.findOrCreateGist();
            const syncData = await this.downloadSyncData(gistId);
            return { success: true, data: syncData };
        } catch (e) {
            await this.handleIfUnauthorized(e);
            console.error('[CloudSync] download error:', e);
            const message = e instanceof Error ? e.message : String(e);
            return { success: false, message };
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * 将云端数据应用到本地（覆盖），并同步更新 base 快照
     */
    async applyDownloadedData(syncData: SyncData): Promise<boolean> {
        if (!syncData?.data) return false;

        const snapshot: Record<string, unknown> = {};
        for (const key of SYNC_DATA_KEYS) {
            if (Object.prototype.hasOwnProperty.call(syncData.data, key)) {
                snapshot[key] = syncData.data[key];
            }
        }

        await this.dataManager.applyStorageSnapshot(snapshot);

        this.lastSyncTime = syncData.lastModified ?? Date.now();
        await this.storage.setMany({
            [STORAGE_KEYS.CLOUD_SYNC_BASE]: snapshot,
            [STORAGE_KEYS.CLOUD_LAST_SYNC_TIME]: this.lastSyncTime
        });

        return true;
    }

    /**
     * 强制恢复：拉取云端数据并覆盖本地（用户主动点击「强制恢复云端」）
     * 覆盖前弹确认框；此操作是兜底手段，日常同步请使用 sync()
     */
    async pullAndApply({ force = false, silent = false }: { force?: boolean; silent?: boolean } = {}): Promise<PullResult> {
        if (!this.token) {
            if (!silent) this.ui.showToast('请先配置 Token', 'error');
            return { success: false };
        }

        const result = await this.download();
        if (!result.success || !result.data) {
            if (!silent) this.ui.showToast('拉取失败：' + result.message, 'error');
            return result;
        }

        const remote = result.data;
        const remoteTime = new Date(remote.lastModified).toLocaleString();
        const localSyncTime = this.lastSyncTime ? new Date(this.lastSyncTime).toLocaleString() : '从未上传';

        if (!force) {
            const TIME_BUFFER = 5000;
            const remoteNewer = remote.lastModified > (this.lastSyncTime ?? 0) + TIME_BUFFER;
            if (!remoteNewer) {
                return { success: true, applied: false, message: '本地数据已是最新' };
            }

            const confirmed = await this.ui.showConfirm(
                `检测到云端数据更新（云端 ${remoteTime}，本地上次上传 ${localSyncTime}），是否用云端数据覆盖本地？`,
                { title: '恢复云端数据', okText: '覆盖本地', isDanger: true }
            );
            if (!confirmed) return { success: true, applied: false, message: '用户取消' };
        } else {
            const confirmed = await this.ui.showConfirm(
                `将用云端数据覆盖本地（云端更新时间：${remoteTime}），此操作不可撤销，是否继续？`,
                { title: '强制恢复云端', okText: '覆盖本地', isDanger: true }
            );
            if (!confirmed) return { success: true, applied: false, message: '用户取消' };
        }

        await this.applyDownloadedData(remote);
        if (!silent) this.ui.showToast('已从云端恢复数据', 'success');
        return { success: true, applied: true };
    }

    /**
     * 保存并验证 Token
     * @param providerId 目标平台；切换平台会重置 gistId/base 快照/上次同步时间，
     *                   避免旧平台的 base 让新平台的空远端被误判为「远端删除全部」
     */
    async saveToken(token: string, providerId: CloudSyncProviderId = this.providerId): Promise<boolean> {
        token = token.trim();
        if (!token) {
            this.ui.showToast('请输入 Token', 'error');
            return false;
        }

        const provider = createGistProvider(providerId);
        this.ui.showToast('正在验证 Token...', 'info');
        let userInfo: GitHubUserInfo;
        try {
            userInfo = await provider.validateToken(token);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.ui.showToast('Token 验证失败：' + message, 'error');
            return false;
        }

        if (providerId !== this.providerId || token !== this.token) {
            this.gistId = null;
            this.lastSyncTime = 0;
            await this.storage.set(STORAGE_KEYS.CLOUD_SYNC_BASE, null);
        }
        this.providerId = providerId;
        this.token = token;
        this.userInfo = userInfo;
        await this.saveSettings();
        await this.findOrCreateGist();
        this.ui.showToast(`${provider.name} 账号已连接`, 'success');
        return true;
    }

    /**
     * 显示 Token 输入对话框并尝试保存（使用当前平台）
     */
    async showLoginDialog(): Promise<void> {
        const provider = this.provider;
        const token = await this.ui.showPrompt(
            `请输入 ${provider.name} Token（${provider.tokenHint}）`,
            {
                title: `连接 ${provider.name}`,
                confirmText: '连接',
                cancelText: '取消',
                inputPlaceholder: this.providerId === 'gitee' ? 'xxxxxxxxxxxxxxxx' : 'ghp_xxxxxxxxxxxxxxxxxxxx',
                inputType: 'password'
            }
        );
        if (token) {
            await this.saveToken(token);
        }
    }

    /**
     * 退出登录，清空云同步配置（含 base 快照与平台选择）
     */
    async logout(): Promise<void> {
        const confirmed = await this.ui.showConfirm('确定要断开云同步吗？本地数据不会删除。', {
            title: '断开同步',
            okText: '断开',
            isDanger: true
        });
        if (!confirmed) return;

        this.token = null;
        this.gistId = null;
        this.userInfo = null;
        this.lastSyncTime = 0;
        this.providerId = DEFAULT_PROVIDER;
        await this.saveSettings();
        await this.storage.set(STORAGE_KEYS.CLOUD_SYNC_BASE, null);
        this.ui.showToast('已断开云同步', 'success');
    }

    /**
     * 切换自动同步（开启后：数据变更时自动上传、启动时自动拉取合并）
     */
    async setAutoSync(enabled: boolean): Promise<void> {
        this.autoSync = !!enabled;
        await this.storage.set(STORAGE_KEYS.CLOUD_AUTO_SYNC, this.autoSync);
    }

    /**
     * 触发自动同步（防抖）
     */
    scheduleAutoSync(): void {
        if (!this.autoSync || !this.token) return;

        if (this.autoSyncTimer) {
            clearTimeout(this.autoSyncTimer);
        }

        this.autoSyncTimer = setTimeout(() => {
            this.sync({ silent: true }).then((result) => {
                if (result.success) {
                    console.log('[CloudSync] auto sync completed');
                }
            });
        }, 3000);
    }

    /**
     * 当前设置快照
     */
    get settings(): CloudSyncSettings {
        return {
            token: this.token,
            gistId: this.gistId,
            autoSync: this.autoSync,
            lastSyncTime: this.lastSyncTime,
            userInfo: this.userInfo,
            provider: this.providerId
        };
    }

    /**
     * 是否已登录
     */
    get isLoggedIn(): boolean {
        return !!this.token;
    }

    /**
     * 是否正在同步
     */
    get isSyncing(): boolean {
        return this.syncInProgress;
    }

    /**
     * Token 失效（401）：清空本地 Token 与用户信息，保留 gistId 以便重新连接后复用
     */
    private async handleIfUnauthorized(e: unknown): Promise<void> {
        if (e instanceof SyncProviderError && e.status === 401) {
            this.token = null;
            this.userInfo = null;
            await this.saveSettings();
        }
    }

    /**
     * 下载并解析远端同步数据
     */
    private async downloadSyncData(gistId: string): Promise<SyncData> {
        if (!this.token) {
            throw new Error('未配置 Token');
        }
        const content = await this.provider.getGistFileContent(this.token, gistId, SYNC_FILE_NAME);
        if (content === null) {
            throw new Error('同步文件不存在');
        }
        return JSON.parse(content) as SyncData;
    }

    /**
     * 上传合并后的数据到云端
     */
    private async uploadData(gistId: string, data: SyncSnapshot): Promise<void> {
        if (!this.token) {
            throw new Error('未配置 Token');
        }
        const syncData: SyncData = {
            version: '1.0',
            lastModified: Date.now(),
            device: this.getDeviceName(),
            data
        };
        await this.provider.updateGist(this.token, gistId, SYNC_FILE_NAME, JSON.stringify(syncData, null, 2));
    }

    private createEmptySyncData(): SyncData {
        return {
            version: '1.0',
            lastModified: Date.now(),
            device: this.getDeviceName(),
            data: {}
        };
    }

    private async collectLocalData(): Promise<SyncData> {
        await this.dataManager.syncNow();
        const data: Record<string, unknown> = {};
        for (const key of SYNC_DATA_KEYS) {
            data[key] = await this.storage.get(key);
        }
        return {
            version: '1.0',
            lastModified: Date.now(),
            device: this.getDeviceName(),
            data
        };
    }

    private getDeviceName(): string {
        if (typeof navigator === 'undefined') return 'Browser';
        const ua = navigator.userAgent;
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edg')) return 'Edge';
        return 'Browser';
    }
}

/**
 * 工厂函数：根据依赖创建 CloudSyncService 实例
 */
export function createCloudSyncService(deps: CloudSyncDependencies): CloudSyncService {
    return new CloudSyncService(deps);
}
