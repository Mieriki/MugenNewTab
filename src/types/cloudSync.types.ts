/**
 * GitHub 用户信息
 */
export interface GitHubUserInfo {
    login: string;
    id: number;
    avatar: string;
}

/**
 * Gist 文件对象
 */
export interface GistFile {
    filename?: string;
    type?: string;
    language?: string | null;
    raw_url?: string;
    size?: number;
    content?: string;
    truncated?: boolean;
}

/**
 * Gist 列表项 / 详情
 */
export interface Gist {
    id: string;
    description: string | null;
    public: boolean;
    files: Record<string, GistFile>;
    html_url?: string;
    created_at?: string;
    updated_at?: string;
}

/**
 * 同步数据包结构
 */
export interface SyncData {
    version: string;
    lastModified: number;
    device: string;
    data: Record<string, unknown>;
}

/**
 * 上传结果
 */
export interface UploadResult {
    success: boolean;
    time?: number;
    message?: string;
}

/**
 * 下载结果
 */
export interface DownloadResult {
    success: boolean;
    data?: SyncData;
    message?: string;
}

/**
 * 拉取并应用结果
 */
export interface PullResult {
    success: boolean;
    applied?: boolean;
    message?: string;
}

/**
 * 云同步服务配置
 */
export interface CloudSyncSettings {
    token: string | null;
    gistId: string | null;
    autoSync: boolean;
    lastSyncTime: number;
    userInfo: GitHubUserInfo | null;
}

/**
 * 云同步存储适配器
 * 由统一的 StorageManager 实现
 */
export interface ICloudSyncStorageAdapter {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    setMany(items: Record<string, unknown>): Promise<void>;
}

/**
 * 云同步数据管理器适配器
 * 由 DataManager 实现
 */
export interface ICloudSyncDataManager {
    /**
     * 在收集本地数据前同步内存缓存到持久存储
     */
    syncNow(): Promise<void>;
    /**
     * 将云端快照应用到本地存储
     */
    applyStorageSnapshot(snapshot: Record<string, unknown>): Promise<boolean>;
}

/**
 * 云同步 UI 适配器
 */
export interface ICloudSyncUIAdapter {
    showToast(message: string, type?: 'success' | 'error' | 'info'): void;
    showConfirm(
        message: string,
        options?: {
            title?: string;
            okText?: string;
            isDanger?: boolean;
        }
    ): Promise<boolean>;
    showPrompt(
        message: string,
        options?: {
            title?: string;
            confirmText?: string;
            cancelText?: string;
            inputPlaceholder?: string;
            inputType?: string;
        }
    ): Promise<string | null>;
}

/**
 * 构造 CloudSyncService 所需的依赖
 */
export interface CloudSyncDependencies {
    storage: ICloudSyncStorageAdapter;
    dataManager: ICloudSyncDataManager;
    ui: ICloudSyncUIAdapter;
}
