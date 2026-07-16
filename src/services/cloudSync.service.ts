import type {
    CloudSyncDependencies,
    CloudSyncSettings,
    DownloadResult,
    Gist,
    GitHubUserInfo,
    ICloudSyncDataManager,
    ICloudSyncStorageAdapter,
    ICloudSyncUIAdapter,
    PullResult,
    SyncData,
    UploadResult
} from '@/types/cloudSync.types';

const SYNC_FILE_NAME = 'mugen-newtab-sync.json';
const GIST_DESCRIPTION = 'MugenNewTab 导航数据云同步备份';

const STORAGE_KEYS = {
    token: 'appNavigator_cloudSync_token',
    gistId: 'appNavigator_cloudSync_gistId',
    autoSync: 'appNavigator_cloudSync_autoSync',
    lastSyncTime: 'appNavigator_cloudSync_lastSyncTime',
    userInfo: 'appNavigator_cloudSync_userInfo'
} as const;

/**
 * 需要同步的本地存储键
 */
const SYNC_DATA_KEYS: string[] = [
    'appNavigator_data',
    'appNavigator_user_uiLib',
    'appNavigator_wallpaper',
    'appNavigator_wallpaper_image',
    'selectedTheme',
    'sidebarCollapsed',
    'searchHistory',
    'selectedSearchEngine',
    'appNavigator_showHiddenApps',
    'appNavigator_hiddenTipDismissed',
    'appNavigator_dataUpdatedAt'
];

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/**
 * 云同步服务
 * 封装 GitHub Gist API，提供查找/创建/上传/下载/恢复功能
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
    private autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
    private syncInProgress = false;

    constructor(deps: CloudSyncDependencies) {
        this.storage = deps.storage;
        this.dataManager = deps.dataManager;
        this.ui = deps.ui;
    }

    /**
     * 初始化云同步服务
     * 加载设置，若已登录则验证 Token 并尝试启动时拉取
     */
    async init(): Promise<void> {
        await this.loadSettings();
        if (this.token) {
            const valid = await this.validateToken(this.token);
            if (valid) {
                await this.maybePullOnStartup();
            }
        }
    }

    /**
     * 从存储中加载云同步设置
     */
    async loadSettings(): Promise<void> {
        const token = await this.storage.get<string>(STORAGE_KEYS.token);
        const gistId = await this.storage.get<string>(STORAGE_KEYS.gistId);
        const autoSync = await this.storage.get<boolean>(STORAGE_KEYS.autoSync);
        const lastSyncTime = await this.storage.get<number>(STORAGE_KEYS.lastSyncTime);
        const userInfo = await this.storage.get<GitHubUserInfo>(STORAGE_KEYS.userInfo);

        this.token = token ?? null;
        this.gistId = gistId ?? null;
        this.autoSync = autoSync ?? false;
        this.lastSyncTime = lastSyncTime ?? 0;
        this.userInfo = userInfo ?? null;
    }

    /**
     * 将当前设置保存到存储
     */
    async saveSettings(): Promise<void> {
        await this.storage.setMany({
            [STORAGE_KEYS.token]: this.token,
            [STORAGE_KEYS.gistId]: this.gistId,
            [STORAGE_KEYS.autoSync]: this.autoSync,
            [STORAGE_KEYS.lastSyncTime]: this.lastSyncTime,
            [STORAGE_KEYS.userInfo]: this.userInfo
        });
    }

    /**
     * 验证 GitHub Token 是否有效
     */
    async validateToken(token: string | null = this.token): Promise<boolean> {
        if (!token) return false;
        try {
            const response = await fetch(`${GITHUB_API_BASE}/user`, {
                headers: this.authHeaders(token)
            });
            if (response.status === 200) {
                const user = (await response.json()) as { login: string; id: number; avatar_url: string };
                this.userInfo = { login: user.login, id: user.id, avatar: user.avatar_url };
                if (token !== this.token) {
                    this.token = token;
                    await this.saveSettings();
                } else {
                    await this.storage.set(STORAGE_KEYS.userInfo, this.userInfo);
                }
                return true;
            }
            return false;
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
            throw new Error('未配置 GitHub Token');
        }

        if (this.gistId) {
            try {
                const gist = await this.getGist(this.gistId);
                if (gist && gist.files[SYNC_FILE_NAME]) {
                    return this.gistId;
                }
            } catch (e) {
                console.warn('[CloudSync] stored gist not found, creating new one');
            }
        }

        const gists = await this.listGists();
        const existing = gists.find((gist) => gist.files[SYNC_FILE_NAME]);
        if (existing) {
            this.gistId = existing.id;
            await this.storage.set(STORAGE_KEYS.gistId, this.gistId);
            return this.gistId;
        }

        const response = await fetch(`${GITHUB_API_BASE}/gists`, {
            method: 'POST',
            headers: this.authHeaders(this.token),
            body: JSON.stringify({
                description: GIST_DESCRIPTION,
                public: false,
                files: {
                    [SYNC_FILE_NAME]: {
                        content: JSON.stringify(this.createEmptySyncData(), null, 2)
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error(`创建 Gist 失败: ${response.status} ${response.statusText}`);
        }

        const gist = (await response.json()) as Gist;
        this.gistId = gist.id;
        await this.storage.set(STORAGE_KEYS.gistId, this.gistId);
        return this.gistId;
    }

    /**
     * 上传本地数据到 Gist
     */
    async upload({ silent = false }: { silent?: boolean } = {}): Promise<UploadResult> {
        if (this.syncInProgress) return { success: false, message: '同步进行中' };
        if (!this.token) {
            if (!silent) this.ui.showToast('请先配置 GitHub Token', 'error');
            return { success: false, message: '请先配置 GitHub Token' };
        }

        this.syncInProgress = true;
        try {
            const gistId = await this.findOrCreateGist();
            const syncData = await this.collectLocalData();

            const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
                method: 'PATCH',
                headers: this.authHeaders(this.token),
                body: JSON.stringify({
                    files: {
                        [SYNC_FILE_NAME]: {
                            content: JSON.stringify(syncData, null, 2)
                        }
                    }
                })
            });

            if (!response.ok) {
                const error = (await response.json().catch(() => ({}))) as { message?: string };
                throw new Error(error.message || `上传失败: ${response.status}`);
            }

            this.lastSyncTime = syncData.lastModified;
            await this.storage.set(STORAGE_KEYS.lastSyncTime, this.lastSyncTime);

            if (!silent) this.ui.showToast('数据已同步到 GitHub Gist', 'success');
            return { success: true, time: this.lastSyncTime };
        } catch (e) {
            console.error('[CloudSync] upload error:', e);
            const message = e instanceof Error ? e.message : String(e);
            if (!silent) this.ui.showToast('同步失败：' + message, 'error');
            return { success: false, message };
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * 从 Gist 下载数据
     */
    async download(): Promise<DownloadResult> {
        if (this.syncInProgress) return { success: false, message: '同步进行中' };
        if (!this.token) return { success: false, message: '请先配置 GitHub Token' };

        this.syncInProgress = true;
        try {
            const gistId = await this.findOrCreateGist();
            const gist = await this.getGist(gistId);
            const file = gist.files[SYNC_FILE_NAME];
            if (!file) {
                throw new Error('同步文件不存在');
            }

            const content = file.content ?? (await this.fetchRawContent(file.raw_url ?? ''));
            const syncData = JSON.parse(content) as SyncData;

            return { success: true, data: syncData };
        } catch (e) {
            console.error('[CloudSync] download error:', e);
            const message = e instanceof Error ? e.message : String(e);
            return { success: false, message };
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * 将云端数据应用到本地
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
        await this.storage.set(STORAGE_KEYS.lastSyncTime, this.lastSyncTime);

        return true;
    }

    /**
     * 拉取并应用云端数据
     * @param force 是否强制恢复（用户主动点击“恢复云端”）
     * @param silent 是否静默执行（不显示提示）
     */
    async pullAndApply({ force = false, silent = false }: { force?: boolean; silent?: boolean } = {}): Promise<PullResult> {
        if (!this.token) {
            if (!silent) this.ui.showToast('请先配置 GitHub Token', 'error');
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
                { title: '恢复云端数据', okText: '覆盖本地', isDanger: true }
            );
            if (!confirmed) return { success: true, applied: false, message: '用户取消' };
        }

        await this.applyDownloadedData(remote);
        if (!silent) this.ui.showToast('已从云端恢复数据', 'success');
        return { success: true, applied: true };
    }

    /**
     * 保存并验证 GitHub Token
     */
    async saveToken(token: string): Promise<boolean> {
        token = token.trim();
        if (!token) {
            this.ui.showToast('请输入 GitHub Token', 'error');
            return false;
        }

        this.ui.showToast('正在验证 Token...', 'info');
        const valid = await this.validateToken(token);
        if (!valid) {
            this.ui.showToast('Token 验证失败，请检查是否有效', 'error');
            return false;
        }

        await this.saveSettings();
        await this.findOrCreateGist();
        this.ui.showToast('GitHub 账号已连接', 'success');
        return true;
    }

    /**
     * 显示 Token 输入对话框并尝试保存
     */
    async showLoginDialog(): Promise<void> {
        const token = await this.ui.showPrompt(
            '请输入 GitHub Personal Access Token（需要 gist 权限）',
            {
                title: '连接 GitHub',
                confirmText: '连接',
                cancelText: '取消',
                inputPlaceholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
                inputType: 'password'
            }
        );
        if (token) {
            await this.saveToken(token);
        }
    }

    /**
     * 退出登录，清空云同步配置
     */
    async logout(): Promise<void> {
        const confirmed = await this.ui.showConfirm('确定要断开 GitHub 云同步吗？本地数据不会删除。', {
            title: '断开同步',
            okText: '断开',
            isDanger: true
        });
        if (!confirmed) return;

        this.token = null;
        this.gistId = null;
        this.userInfo = null;
        this.lastSyncTime = 0;
        await this.saveSettings();
        this.ui.showToast('已断开云同步', 'success');
    }

    /**
     * 切换自动同步
     */
    async setAutoSync(enabled: boolean): Promise<void> {
        this.autoSync = !!enabled;
        await this.storage.set(STORAGE_KEYS.autoSync, this.autoSync);
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
            this.upload({ silent: true }).then((result) => {
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
            userInfo: this.userInfo
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

    private authHeaders(token: string): Record<string, string> {
        return {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': API_VERSION,
            'Content-Type': 'application/json'
        };
    }

    private async listGists(): Promise<Gist[]> {
        if (!this.token) {
            throw new Error('未配置 GitHub Token');
        }
        const response = await fetch(`${GITHUB_API_BASE}/gists?per_page=100`, {
            headers: this.authHeaders(this.token)
        });
        if (!response.ok) {
            throw new Error(`获取 Gist 列表失败: ${response.status} ${response.statusText}`);
        }
        return (await response.json()) as Gist[];
    }

    private async getGist(gistId: string): Promise<Gist> {
        if (!this.token) {
            throw new Error('未配置 GitHub Token');
        }
        const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
            headers: this.authHeaders(this.token)
        });
        if (!response.ok) {
            throw new Error(`获取 Gist 失败: ${response.status} ${response.statusText}`);
        }
        return (await response.json()) as Gist;
    }

    private async fetchRawContent(rawUrl: string): Promise<string> {
        if (!this.token) {
            throw new Error('未配置 GitHub Token');
        }
        const response = await fetch(rawUrl, {
            headers: this.authHeaders(this.token)
        });
        if (!response.ok) {
            throw new Error(`获取文件内容失败: ${response.status}`);
        }
        return await response.text();
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

    private async maybePullOnStartup(): Promise<void> {
        if (!this.token || !this.autoSync) return;

        const result = await this.download();
        if (!result.success || !result.data) return;

        const remote = result.data;
        const TIME_BUFFER = 5000;
        if (remote.lastModified > (this.lastSyncTime ?? 0) + TIME_BUFFER) {
            const remoteTime = new Date(remote.lastModified).toLocaleString();
            const confirmed = await this.ui.showConfirm(
                `检测到其他设备上的更新（${remoteTime}），是否恢复到本地？`,
                { title: '发现云端更新', okText: '恢复', isDanger: false }
            );
            if (confirmed) {
                await this.applyDownloadedData(remote);
                this.ui.showToast('已从云端恢复数据', 'success');
            }
        }
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
