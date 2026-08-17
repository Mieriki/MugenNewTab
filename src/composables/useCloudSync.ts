/**
 * 云同步 Composable
 * 封装 cloudSync store，为 Vue 组件提供登录、退出、上传、下载、拉取、自动同步能力。
 * 处理副作用清理：事件监听、防抖定时器、AbortController。
 */

import { computed, onMounted, onUnmounted } from 'vue';
import type { ComputedRef } from 'vue';
import { useCloudSyncStore } from '@/stores/cloudSync.store';
import type {
    CloudSyncProviderId,
    DownloadResult,
    GitHubUserInfo,
    ICloudSyncUIAdapter,
    PullResult,
    SyncResult,
    UploadResult
} from '@/types/cloudSync.types';

export interface UseCloudSyncOptions {
    /** UI 适配器；未提供时使用 Store 默认适配器 */
    uiAdapter?: ICloudSyncUIAdapter;
    /** 数据变更后自动同步的防抖间隔（毫秒），默认 3000 */
    autoSyncDebounceMs?: number;
}

export interface UseCloudSyncReturn {
    token: ComputedRef<string | null>;
    gistId: ComputedRef<string | null>;
    provider: ComputedRef<CloudSyncProviderId>;
    autoSync: ComputedRef<boolean>;
    userInfo: ComputedRef<GitHubUserInfo | null>;
    lastSyncTime: ComputedRef<number>;
    isLoading: ComputedRef<boolean>;
    error: ComputedRef<string | null>;
    isLoggedIn: ComputedRef<boolean>;
    statusText: ComputedRef<string>;
    formattedLastSyncTime: ComputedRef<string>;
    init: () => Promise<void>;
    login: (inputToken: string, providerId?: CloudSyncProviderId) => Promise<boolean>;
    logout: () => Promise<void>;
    setAutoSync: (enabled: boolean) => Promise<void>;
    upload: (options?: { silent?: boolean }) => Promise<UploadResult>;
    sync: (options?: { silent?: boolean }) => Promise<SyncResult>;
    download: () => Promise<DownloadResult>;
    pullAndApply: (options?: { force?: boolean; silent?: boolean }) => Promise<PullResult>;
    showLoginDialog: () => Promise<void>;
    scheduleAutoSync: () => void;
    cancelPending: () => void;
}

const DEFAULT_AUTO_SYNC_DEBOUNCE_MS = 3000;

/** 平台标识到显示名的映射 */
const PROVIDER_NAMES: Record<CloudSyncProviderId, string> = {
    github: 'GitHub',
    gitee: 'Gitee'
};

function formatDateTime(timestamp: number): string {
    if (!timestamp) {
        return '从未同步';
    }
    try {
        return new Date(timestamp).toLocaleString();
    } catch (_) {
        return '从未同步';
    }
}

/**
 * 创建 AbortController 集合，用于取消未完成的异步操作
 */
function createAbortControllerSet(): {
    add: (controller: AbortController) => void;
    remove: (controller: AbortController) => void;
    abortAll: () => void;
} {
    const controllers = new Set<AbortController>();
    return {
        add(controller: AbortController) {
            controllers.add(controller);
        },
        remove(controller: AbortController) {
            controllers.delete(controller);
        },
        abortAll() {
            for (const controller of controllers) {
                controller.abort();
            }
            controllers.clear();
        }
    };
}

/**
 * 云同步 Composable
 */
export function useCloudSync(options: UseCloudSyncOptions = {}): UseCloudSyncReturn {
    const store = useCloudSyncStore();
    const { uiAdapter, autoSyncDebounceMs = DEFAULT_AUTO_SYNC_DEBOUNCE_MS } = options;

    const abortControllers = createAbortControllerSet();
    let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

    if (uiAdapter) {
        store.setUIAdapter(uiAdapter);
    }

    const isLoggedIn = computed(() => store.isLoggedIn);

    const statusText = computed(() => {
        if (store.isLoading) {
            return '同步中...';
        }
        if (store.isLoggedIn && store.userInfo) {
            return `已连接：${PROVIDER_NAMES[store.provider] ?? store.provider} / ${store.userInfo.login}`;
        }
        return '未连接';
    });

    const formattedLastSyncTime = computed(() => formatDateTime(store.lastSyncTime));

    /**
     * 将异步操作包装为可取消操作
     * 组件卸载时会触发 AbortController，未完成的 Promise 将以 AbortError 拒绝。
     */
    function createAbortable<T>(operation: () => Promise<T>): Promise<T> {
        const controller = new AbortController();
        const signal = controller.signal;

        if (signal.aborted) {
            return Promise.reject(new DOMException('Operation aborted', 'AbortError'));
        }

        abortControllers.add(controller);

        let abortHandler: (() => void) | null = null;

        const abortPromise = new Promise<T>((_, reject) => {
            abortHandler = () => {
                cleanup();
                reject(new DOMException('Operation aborted', 'AbortError'));
            };
            signal.addEventListener('abort', abortHandler, { once: true });
        });

        function cleanup() {
            if (abortHandler) {
                signal.removeEventListener('abort', abortHandler);
            }
            abortControllers.remove(controller);
        }

        return Promise.race([operation(), abortPromise]).finally(cleanup);
    }

    /**
     * 取消所有未完成的操作，并清理自动同步定时器
     */
    function cancelPending(): void {
        abortControllers.abortAll();
        if (autoSyncTimer) {
            clearTimeout(autoSyncTimer);
            autoSyncTimer = null;
        }
    }

    async function init(): Promise<void> {
        return createAbortable(() => store.init());
    }

    async function login(inputToken: string, providerId?: CloudSyncProviderId): Promise<boolean> {
        return createAbortable(() => store.login(inputToken, providerId));
    }

    async function logout(): Promise<void> {
        return createAbortable(() => store.logout());
    }

    async function setAutoSync(enabled: boolean): Promise<void> {
        return createAbortable(() => store.setAutoSync(enabled));
    }

    async function upload(opts?: { silent?: boolean }): Promise<UploadResult> {
        return createAbortable(() => store.upload(opts));
    }

    async function sync(opts?: { silent?: boolean }): Promise<SyncResult> {
        return createAbortable(() => store.sync(opts));
    }

    async function download(): Promise<DownloadResult> {
        return createAbortable(() => store.download());
    }

    async function pullAndApply(opts?: { force?: boolean; silent?: boolean }): Promise<PullResult> {
        return createAbortable(() => store.pullAndApply(opts));
    }

    async function showLoginDialog(): Promise<void> {
        return createAbortable(() => store.showLoginDialog());
    }

    /**
     * 触发自动同步（防抖）
     * 仅在已登录且开启自动同步时生效；执行双向合并同步，成功静默、失败 Toast 提示。
     */
    function scheduleAutoSync(): void {
        if (!store.autoSync || !store.isLoggedIn) {
            return;
        }
        if (autoSyncTimer) {
            clearTimeout(autoSyncTimer);
        }
        autoSyncTimer = setTimeout(() => {
            autoSyncTimer = null;
            sync({ silent: true }).catch(() => {
                // 静默失败（失败提示由 service 层 Toast 负责），避免未处理的 Promise 拒绝
            });
        }, autoSyncDebounceMs);
    }

    /**
     * 本地数据变更时触发自动同步
     * 仅响应本地修改（source === 'local'），云端应用/外部变更不触发，避免回环上传
     */
    function handleDataChanged(event: Event): void {
        const source = (event as CustomEvent<{ source?: string }>).detail?.source;
        if (source && source !== 'local') {
            return;
        }
        scheduleAutoSync();
    }

    onMounted(() => {
        window.addEventListener('appNavigator:data-changed', handleDataChanged);
        init().catch(() => {
            // 初始化失败由 store.error 暴露，不在此处抛出
        });
    });

    onUnmounted(() => {
        window.removeEventListener('appNavigator:data-changed', handleDataChanged);
        cancelPending();
    });

    return {
        token: computed(() => store.token),
        gistId: computed(() => store.gistId),
        provider: computed(() => store.provider),
        autoSync: computed(() => store.autoSync),
        userInfo: computed(() => store.userInfo),
        lastSyncTime: computed(() => store.lastSyncTime),
        isLoading: computed(() => store.isLoading),
        error: computed(() => store.error),
        isLoggedIn,
        statusText,
        formattedLastSyncTime,
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
        cancelPending
    };
}
