/**
 * 配置加载服务
 * 异步加载 public/config/ 目录下的 JSON 配置文件，并带内存缓存机制。
 *
 * 复用 browserApi.service.ts 检测扩展环境并解析运行时路径。
 */

import { BrowserAPI } from '@/services/browserApi.service';
import type {
    ThemeConfig,
    SearchEngine,
    DefaultDataConfig,
    ConfigName,
} from '@/types/config';

/** 内存缓存 */
const cache = new Map<ConfigName | string, unknown>();

/**
 * 获取配置文件基础路径
 * 扩展环境使用 runtime.getURL('config/')，网页环境使用 /config/。
 */
function getConfigBasePath(): string {
    if (BrowserAPI.isExtension) {
        return BrowserAPI.runtime.getURL('config/');
    }
    return '/config/';
}

/**
 * 异步加载指定 JSON 配置文件
 * @param name 配置文件名（不含 .json 后缀）
 * @returns 解析后的配置对象，加载失败时返回 null
 */
export async function loadConfig<T = unknown>(name: ConfigName | string): Promise<T | null> {
    if (cache.has(name)) {
        return cache.get(name) as T;
    }

    try {
        const basePath = getConfigBasePath();
        const response = await fetch(`${basePath}${name}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load ${name}.json, status: ${response.status}`);
        }
        const data = (await response.json()) as T;
        cache.set(name, data);
        return data;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ConfigService: 加载 ${name}.json 失败`, message);
        return null;
    }
}

/**
 * 加载主题配置
 */
export async function loadThemes(): Promise<ThemeConfig | null> {
    return loadConfig<ThemeConfig>('themes');
}

/**
 * 加载搜索引擎配置
 */
export async function loadSearchEngines(): Promise<SearchEngine[] | null> {
    return loadConfig<SearchEngine[]>('searchEngines');
}

/**
 * 加载默认数据配置
 */
export async function loadDefaultData(): Promise<DefaultDataConfig | null> {
    return loadConfig<DefaultDataConfig>('defaultData');
}

/**
 * 清除配置缓存
 * @param name 指定配置文件名，不传则清空全部缓存
 */
export function clearConfigCache(name?: ConfigName | string): void {
    if (name) {
        cache.delete(name);
    } else {
        cache.clear();
    }
}

/** 默认导出：配置服务对象 */
const ConfigService = {
    loadConfig,
    loadThemes,
    loadSearchEngines,
    loadDefaultData,
    clearConfigCache,
};

export default ConfigService;
