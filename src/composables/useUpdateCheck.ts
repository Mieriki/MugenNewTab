/**
 * useUpdateCheck - 应用内更新检查
 *
 * 为什么需要它：
 * Firefox 靠 manifest 里的 `update_url` 自己会静默更新，但 Chrome / Edge
 * 只对商店分发的扩展做自动更新，自托管的包（开发者模式加载、拖入 zip）
 * 永远不会自动升级。为了让 Chromium 侧用户也能知道有新版本，这里做一层
 * 应用内检查：读最新版本号，和扩展自身 manifest 版本比对，
 * 有新版本时交给 UpdateBanner 提示用户手动下载。
 *
 * 数据源（按优先级）：
 *   1. `releases/latest/download/latest.json` —— 发版时随 Release 上传的静态清单，
 *      CDN 直出，没有频率限制，是正常路径。
 *   2. GitHub REST API —— 老版本 Release 里还没有 latest.json 时的兜底。
 *      未认证接口限 60 次/小时/IP，共享出口（公司 NAT / VPN / 云主机）容易被刷满，
 *      所以只当兜底用。
 *
 * 节流：
 * 新标签页会被频繁打开，检查结果连同「上次检查时间」缓存到 storage.local，
 * 默认 6 小时内不再发起网络请求。
 *
 * 失败策略：
 * 网络异常、限流、清单缺失一律静默失败——更新提示属于锦上添花，
 * 绝不能因为它弹错误打扰用户。
 */

import { computed, ref } from 'vue';
import { browserApi } from '@/services/browserApi.service';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { BrowserType } from '@/types/browserApi.types';
import { openUrl } from '@/utils/navigation.util';

/** 发版仓库（fork 的 releases 里同时挂着 xpi / chromium zip / 清单文件） */
export const RELEASE_REPO = 'AlexCat315/MugenNewTab';

/** 静态版本清单：发版时上传为 Release 资产，`latest` 永远指向最新正式版 */
export const LATEST_JSON_URL = `https://github.com/${RELEASE_REPO}/releases/latest/download/latest.json`;

/** GitHub Releases API：仅在静态清单不可用时兜底 */
export const RELEASES_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

/** 默认检查间隔：6 小时 */
export const DEFAULT_CHECK_INTERVAL = 6 * 60 * 60 * 1000;

/** 网络请求超时（毫秒），超时按失败处理 */
const REQUEST_TIMEOUT = 8000;

/** 最新版本信息 */
export interface LatestRelease {
    /** 去掉前缀 v 的版本号，如 1.0.0.109 */
    version: string;
    /** 与当前浏览器匹配的安装包地址；找不到时为 Release 页面 */
    downloadUrl: string;
    /** Release 页面地址 */
    releaseUrl: string;
}

/** latest.json 结构 */
export interface LatestJsonPayload {
    version?: string;
    tag?: string;
    release?: string;
    firefox?: string;
    chromium?: string;
    publishedAt?: string;
}

/** 缓存到本地存储的检查结果 */
interface UpdateCheckCache {
    /** 检查时间戳（毫秒） */
    checkedAt: number;
    release: LatestRelease;
}

/** Release 资产（只取用得到的字段） */
interface ReleaseAsset {
    name?: string;
    browser_download_url?: string;
}

/** GitHub Release 响应（只取用得到的字段） */
interface ReleaseResponse {
    tag_name?: string;
    html_url?: string;
    assets?: ReleaseAsset[];
}

/** useUpdateCheck 配置 */
export interface UseUpdateCheckOptions {
    /**
     * 当前版本号。缺省时从扩展 manifest 读取；
     * 非扩展环境（`npm run dev` 直接开网页）读不到，此时不做任何检查。
     */
    currentVersion?: string | null;
    /** 检查间隔（毫秒），默认 6 小时 */
    interval?: number;
    /** 自定义最新版本数据源，默认走静态清单 + API 兜底（测试用） */
    fetchLatest?: () => Promise<LatestRelease | null>;
}

/**
 * 比较两个版本号大小。
 *
 * 按 `.` 切段后逐段做数值比较，段数不同时缺位补 0，
 * 因此 `1.0.0.9 < 1.0.0.10`（不会退化成字符串比较）。
 *
 * @returns 1 表示 a 更新，-1 表示 b 更新，0 表示相同
 */
export function compareVersions(a: string, b: string): number {
    const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(left.length, right.length);

    for (let i = 0; i < length; i++) {
        const l = left[i] ?? 0;
        const r = right[i] ?? 0;
        if (l !== r) {
            return l > r ? 1 : -1;
        }
    }
    return 0;
}

/**
 * 从 Release 资产里挑出当前浏览器对应的安装包。
 *
 * Firefox 要 `.xpi`，Chromium 系要含 `chromium` 的 `.zip`；
 * 没有匹配项时返回 null，由调用方回退到 Release 页面。
 */
export function pickDownloadUrl(assets: ReleaseAsset[], target: BrowserType): string | null {
    const usable = assets.filter(
        (asset): asset is { name: string; browser_download_url: string } =>
            typeof asset.name === 'string' &&
            typeof asset.browser_download_url === 'string' &&
            asset.browser_download_url.length > 0
    );

    const preferred = target === 'firefox' ? /\.xpi$/i : /chromium.*\.zip$/i;

    const match =
        usable.find((asset) => preferred.test(asset.name)) ??
        // 只发了一侧安装包时兜底取任一包，总比让用户自己找强
        usable.find((asset) => /\.(xpi|zip)$/i.test(asset.name));

    return match?.browser_download_url ?? null;
}

/** 解析静态清单 latest.json */
export function parseLatestJson(data: unknown, target: BrowserType): LatestRelease | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const raw = data as LatestJsonPayload;
    const version = String(raw.version ?? '').trim().replace(/^v/i, '');
    if (!version) {
        return null;
    }

    const releaseUrl = typeof raw.release === 'string' ? raw.release : '';
    const preferred = target === 'firefox' ? raw.firefox : raw.chromium;
    const downloadUrl =
        (typeof preferred === 'string' && preferred.trim()) || releaseUrl;

    return { version, downloadUrl, releaseUrl };
}

/** 解析 GitHub REST API 的 release 响应 */
export function parseReleaseApi(data: unknown, target: BrowserType): LatestRelease | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const raw = data as ReleaseResponse;
    const version = String(raw.tag_name ?? '').trim().replace(/^v/i, '');
    if (!version) {
        return null;
    }

    const releaseUrl = typeof raw.html_url === 'string' ? raw.html_url : '';
    return {
        version,
        downloadUrl: pickDownloadUrl(raw.assets ?? [], target) ?? releaseUrl,
        releaseUrl
    };
}

/**
 * 读取扩展自身版本号。
 * 非扩展环境（纯网页调试）返回 null。
 */
export function getCurrentVersion(): string | null {
    const runtime = browserApi.apiRoot?.runtime;
    if (!runtime?.getManifest) {
        return null;
    }
    try {
        const version = runtime.getManifest()?.version;
        return typeof version === 'string' && version.trim() ? version.trim() : null;
    } catch {
        return null;
    }
}

/** 取 JSON，任何失败都返回 null（不抛错） */
async function fetchJson(url: string): Promise<unknown | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        if (!response.ok) {
            return null;
        }
        return (await response.json()) as unknown;
    } catch {
        // 超时 / 断网 / CORS / 限流：静默失败
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 拉取最新 Release 信息：先静态清单，再 REST API 兜底。
 */
async function fetchLatestRelease(): Promise<LatestRelease | null> {
    const target = browserApi.browserType;

    const fromStatic = parseLatestJson(await fetchJson(LATEST_JSON_URL), target);
    if (fromStatic) {
        return fromStatic;
    }

    // 1.0.0.108 及更早的 Release 里没有 latest.json，回退到 REST API
    return parseReleaseApi(await fetchJson(RELEASES_API), target);
}

/** 把存储里读出来的原始值收敛成合法的缓存结构 */
function normalizeCache(value: unknown): UpdateCheckCache | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const raw = value as Partial<UpdateCheckCache>;
    if (typeof raw.checkedAt !== 'number' || !raw.release || typeof raw.release.version !== 'string') {
        return null;
    }
    return {
        checkedAt: raw.checkedAt,
        release: {
            version: raw.release.version,
            downloadUrl: typeof raw.release.downloadUrl === 'string' ? raw.release.downloadUrl : '',
            releaseUrl: typeof raw.release.releaseUrl === 'string' ? raw.release.releaseUrl : ''
        }
    };
}

/**
 * 更新检查 composable。
 *
 * 每次调用创建独立状态，不共享单例——主页面只调用一次，
 * 独立状态便于测试且避免多处挂载互相干扰。
 */
export function useUpdateCheck(options: UseUpdateCheckOptions = {}) {
    const interval = options.interval ?? DEFAULT_CHECK_INTERVAL;
    const fetchLatest = options.fetchLatest ?? fetchLatestRelease;

    const currentVersion = ref<string | null>(
        options.currentVersion === undefined ? getCurrentVersion() : options.currentVersion
    );
    const latestVersion = ref<string | null>(null);
    const downloadUrl = ref('');
    const releaseUrl = ref('');
    const isChecking = ref(false);
    const dismissedVersion = ref<string | null>(null);

    /** 是否已从存储里载入过缓存与忽略记录 */
    let hydrated = false;
    let cache: UpdateCheckCache | null = null;

    /** 存在比当前版本更高的版本 */
    const hasUpdate = computed(() => {
        if (!currentVersion.value || !latestVersion.value) {
            return false;
        }
        return compareVersions(latestVersion.value, currentVersion.value) > 0;
    });

    /** 是否展示提示条：有新版本且该版本没被用户忽略 */
    const visible = computed(
        () => hasUpdate.value && dismissedVersion.value !== latestVersion.value
    );

    /** 应用一次版本信息 */
    function applyRelease(release: LatestRelease): void {
        latestVersion.value = release.version;
        downloadUrl.value = release.downloadUrl;
        releaseUrl.value = release.releaseUrl;
    }

    /** 从存储载入缓存与「已忽略版本」，只做一次 */
    async function hydrate(): Promise<void> {
        if (hydrated) {
            return;
        }
        hydrated = true;

        try {
            const [cached, dismissed] = await Promise.all([
                storageManager.get(STORAGE_KEYS.UPDATE_CHECK_CACHE),
                storageManager.get(STORAGE_KEYS.UPDATE_DISMISSED_VERSION)
            ]);

            cache = normalizeCache(cached);
            if (cache) {
                // 先把缓存结果铺上去：即使用户断网，也能立刻看到上次查到的版本
                applyRelease(cache.release);
            }
            if (typeof dismissed === 'string' && dismissed) {
                dismissedVersion.value = dismissed;
            }
        } catch (error) {
            console.warn('[useUpdateCheck] 读取更新缓存失败:', error);
        }
    }

    /**
     * 检查更新。
     *
     * @param force 忽略缓存间隔，强制走一次网络
     */
    async function check(force = false): Promise<void> {
        if (!currentVersion.value) {
            // 非扩展环境或读不到版本，直接跳过
            return;
        }

        await hydrate();

        if (!force && cache && Date.now() - cache.checkedAt < interval) {
            return;
        }

        isChecking.value = true;
        try {
            const release = await fetchLatest();
            if (!release) {
                return;
            }

            applyRelease(release);
            cache = { checkedAt: Date.now(), release };
            await storageManager.set(STORAGE_KEYS.UPDATE_CHECK_CACHE, cache);
        } catch (error) {
            console.warn('[useUpdateCheck] 检查更新失败:', error);
        } finally {
            isChecking.value = false;
        }
    }

    /**
     * 忽略当前提示的版本。记录到存储，避免每次开新标签页都弹同一条。
     * 下一个版本发布后会重新提示。
     */
    async function dismiss(): Promise<void> {
        const version = latestVersion.value;
        if (!version) {
            return;
        }
        dismissedVersion.value = version;
        try {
            await storageManager.set(STORAGE_KEYS.UPDATE_DISMISSED_VERSION, version);
        } catch (error) {
            console.warn('[useUpdateCheck] 保存忽略版本失败:', error);
        }
    }

    /** 打开安装包下载（没有匹配资产时落到 Release 页面） */
    function openDownload(): void {
        openUrl(downloadUrl.value || releaseUrl.value, 'new-tab');
    }

    return {
        currentVersion,
        latestVersion,
        downloadUrl,
        releaseUrl,
        hasUpdate,
        visible,
        isChecking,
        check,
        dismiss,
        openDownload
    };
}

export type UseUpdateCheckReturn = ReturnType<typeof useUpdateCheck>;
