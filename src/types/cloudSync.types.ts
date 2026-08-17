/**
 * GitHub 用户信息
 * GitHub / Gitee 的 GET /user 返回结构一致，两平台通用
 */
export interface GitHubUserInfo {
    login: string;
    id: number;
    avatar: string;
}

/**
 * 云同步平台标识
 */
export type CloudSyncProviderId = 'github' | 'gitee';

/**
 * 同步平台适配器
 * 封装 GitHub / Gitee 的 Gist（代码片段）CRUD 与 Token 验证差异，
 * 供 CloudSyncService 统一调用；网络超时与错误分类由实现内部处理。
 */
export interface ISyncProvider {
    /** 平台标识 */
    readonly id: CloudSyncProviderId;
    /** 平台显示名 */
    readonly name: string;
    /** Token 获取地址提示（登录面板展示） */
    readonly tokenHint: string;
    /** 验证 Token 并返回用户信息，失败时抛出错误 */
    validateToken(token: string): Promise<GitHubUserInfo>;
    /** 列出用户 Gist（含 files 元数据） */
    listGists(token: string): Promise<Gist[]>;
    /** 读取指定 Gist 中文件的内容；Gist 或文件不存在时返回 null */
    getGistFileContent(token: string, gistId: string, fileName: string): Promise<string | null>;
    /** 创建 Gist，返回其 id */
    createGist(token: string, fileName: string, content: string, description: string): Promise<string>;
    /** 更新 Gist 中指定文件的内容 */
    updateGist(token: string, gistId: string, fileName: string, content: string): Promise<void>;
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
 * data 仅包含站点数据（appNavigator_data）与用户图标库（appNavigator_user_uiLib），
 * 个性化设置（主题、壁纸、搜索、布局等）不参与同步
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
 * 双向合并同步结果
 */
export interface SyncResult {
    success: boolean;
    /** 是否有数据上传到云端 */
    uploaded?: boolean;
    /** 是否有云端数据应用到本地 */
    applied?: boolean;
    time?: number;
    message?: string;
}

/**
 * 云同步错误分类
 */
export type CloudSyncErrorKind = 'network' | 'unauthorized' | 'rateLimit' | 'http' | 'unknown';

/**
 * 云同步服务配置
 */
export interface CloudSyncSettings {
    token: string | null;
    gistId: string | null;
    autoSync: boolean;
    lastSyncTime: number;
    userInfo: GitHubUserInfo | null;
    /** 当前连接的同步平台 */
    provider: CloudSyncProviderId;
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
