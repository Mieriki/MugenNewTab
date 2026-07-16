/**
 * 搜索引擎服务
 *
 * 负责加载搜索引擎配置并构建完整搜索 URL。
 * 基于 ConfigService 读取 public/config/searchEngines.json，
 * 保持与原项目 js/searchEngines.js 的数据结构与行为一致。
 */

import type { SearchEngine } from '@/types/config';
import ConfigService from '@/services/config.service';

/** 搜索引擎缺少图标时的默认占位图标（使用系统 24×24 SVG） */
const FALLBACK_ICON_PATH = '/image/icons/search.svg';

/**
 * 规范化搜索引擎配置数据
 *
 * - 过滤空值配置
 * - 补齐缺失的默认图标
 * - 跳过缺少名称或 URL 的无效项
 */
function normalizeEngines(engines: SearchEngine[] | null): SearchEngine[] {
    if (!Array.isArray(engines)) {
        return [];
    }

    return engines
        .map((engine, index) => {
            const name = engine.name?.trim() ?? '';
            const url = engine.url ?? '';
            const icon = engine.icon?.trim() || FALLBACK_ICON_PATH;

            if (!name || !url) {
                console.warn(`[SearchEngineService] 第 ${index} 项搜索引擎缺少名称或 URL，已跳过`);
                return null;
            }

            return { name, url, icon };
        })
        .filter((engine): engine is SearchEngine => engine !== null);
}

/**
 * 异步加载搜索引擎配置
 *
 * 通过 ConfigService 读取 public/config/searchEngines.json 并规范化。
 * ConfigService 内部已维护内存缓存，避免重复网络请求。
 */
async function loadEngines(): Promise<SearchEngine[]> {
    const engines = await ConfigService.loadSearchEngines();
    return normalizeEngines(engines);
}

/**
 * 获取所有搜索引擎
 */
export async function getAllSearchEngines(): Promise<SearchEngine[]> {
    return loadEngines();
}

/**
 * 获取默认搜索引擎（配置列表中的第一项）
 */
export async function getDefaultSearchEngine(): Promise<SearchEngine | null> {
    const engines = await loadEngines();
    return engines[0] ?? null;
}

/**
 * 根据索引获取搜索引擎
 *
 * @param index 搜索引擎在列表中的索引
 */
export async function getSearchEngineByIndex(index: number): Promise<SearchEngine | null> {
    const engines = await loadEngines();

    if (index < 0 || index >= engines.length) {
        return null;
    }

    return engines[index];
}

/**
 * 根据搜索引擎与查询关键词构建搜索 URL
 *
 * 将 URL 模板中的 {q} 替换为 encodeURIComponent 后的查询词。
 *
 * @param engine 搜索引擎配置
 * @param query  查询关键词
 * @returns 完整搜索 URL，参数无效时返回 null
 */
export function buildSearchUrl(engine: SearchEngine, query: string): string | null {
    if (!engine?.url) {
        return null;
    }

    return engine.url.replace('{q}', encodeURIComponent(query));
}

/**
 * 使用指定搜索引擎执行搜索
 *
 * 通过 window.open 在新标签页打开构建好的搜索 URL。
 *
 * @param engine 搜索引擎配置
 * @param query  查询关键词
 */
export function searchWithEngine(engine: SearchEngine, query: string): void {
    const url = buildSearchUrl(engine, query);

    if (url) {
        window.open(url, '_blank');
    }
}

/**
 * 搜索引擎服务统一入口
 *
 * 与原项目 SearchEngineUtils 对象保持同名方法，便于组件直接调用。
 */
export const SearchEngineService = {
    getAll: getAllSearchEngines,
    getDefault: getDefaultSearchEngine,
    getByIndex: getSearchEngineByIndex,
    buildSearchUrl,
    search: searchWithEngine
} as const;

export default SearchEngineService;
