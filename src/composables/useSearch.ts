/**
 * 搜索组合式函数
 *
 * 整合 search store 与 SearchEngineService，为搜索组件提供：
 * - 当前搜索引擎与切换
 * - 搜索关键词执行与历史记录
 * - 基于本地历史/应用与百度 sugrec 的搜索建议补全
 *
 * 副作用清理：组件卸载时自动取消未完成的防抖调用与网络请求。
 */

import {
    ref,
    computed,
    watch,
    onMounted,
    onUnmounted,
    toRef,
    type Ref,
    type ComputedRef,
} from 'vue';
import { useSearchStore, type SearchHistoryItem } from '@/stores/search.store';
import { useAppDataStore } from '@/stores/appData.store';
import SearchEngineService from '@/services/searchEngine.service';
import type { SearchEngine } from '@/types/config';
import { debounce } from '@/utils/debounce.util';

/** useSearch 配置项 */
export interface UseSearchOptions {
    /** 输入防抖延迟（毫秒），默认 200 */
    debounceMs?: number;
    /** 最终返回建议的最大条数，默认 8 */
    maxSuggestions?: number;
    /** 本地建议（历史 + 应用）的最大条数，默认 5 */
    maxLocalSuggestions?: number;
}

/** useSearch 返回值 */
export interface UseSearchReturn {
    /** 当前搜索关键词 */
    query: Ref<string>;
    /** 搜索引擎列表 */
    engines: Ref<SearchEngine[]>;
    /** 当前选中的搜索引擎索引 */
    currentEngineIndex: ComputedRef<number>;
    /** 当前选中的搜索引擎对象 */
    currentEngine: ComputedRef<SearchEngine | null>;
    /** 搜索建议列表 */
    suggestions: Ref<string[]>;
    /** 当前高亮的建议索引（-1 表示未选中） */
    activeSuggestionIndex: Ref<number>;
    /** 是否正在加载远程建议 */
    isLoadingSuggestions: Ref<boolean>;
    /** 建议加载错误信息 */
    suggestionError: Ref<string | null>;
    /** 是否可以执行搜索 */
    canSearch: ComputedRef<boolean>;
    /** 是否有建议 */
    hasSuggestions: ComputedRef<boolean>;
    /** 搜索历史 */
    history: Ref<SearchHistoryItem[]>;
    /** 是否已完成初始化 */
    initialized: Ref<boolean>;

    /** 初始化：加载搜索引擎配置与持久化状态 */
    init: () => Promise<void>;
    /** 设置搜索关键词 */
    setQuery: (value: string) => void;
    /** 执行搜索（默认使用当前 query） */
    executeSearch: (rawQuery?: string) => Promise<boolean>;
    /** 使用指定建议执行搜索 */
    executeSearchWithSuggestion: (suggestion: string) => Promise<boolean>;
    /** 手动触发建议加载（已防抖） */
    loadSuggestions: (rawQuery: string) => void;
    /** 立即清空建议与未完成的请求 */
    clearSuggestions: () => void;
    /** 切换到指定索引的搜索引擎 */
    selectEngine: (index: number) => Promise<void>;
    /** 切换到下一个搜索引擎 */
    nextEngine: () => Promise<void>;
    /** 切换到上一个搜索引擎 */
    prevEngine: () => Promise<void>;
    /** 添加搜索历史 */
    addHistory: (query: string) => Promise<void>;
    /** 移除指定搜索历史 */
    removeHistory: (query: string) => Promise<void>;
    /** 清空搜索历史 */
    clearHistory: () => Promise<void>;
    /** 高亮下一个建议 */
    moveSuggestionDown: () => void;
    /** 高亮上一个建议 */
    moveSuggestionUp: () => void;
    /** 选中当前高亮的建议并返回其文本，未选中时返回 null */
    selectActiveSuggestion: () => string | null;
}

/** 百度 sugrec 响应结构 */
interface BaiduSuggestionResponse {
    g?: Array<{ q?: string }>;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
    const { debounceMs = 200, maxSuggestions = 8, maxLocalSuggestions = 5 } = options;

    const searchStore = useSearchStore();
    const appDataStore = useAppDataStore();

    const query = ref('');
    const engines = ref<SearchEngine[]>([]);
    const suggestions = ref<string[]>([]);
    const activeSuggestionIndex = ref(-1);
    const isLoadingSuggestions = ref(false);
    const suggestionError = ref<string | null>(null);
    const initialized = ref(false);
    const abortController = ref<AbortController | null>(null);

    const currentEngineIndex = computed(() => searchStore.selectedEngineIndex);
    const currentEngine = computed(() => engines.value[searchStore.selectedEngineIndex] ?? null);
    const canSearch = computed(() => currentEngine.value !== null && query.value.trim().length > 0);
    const hasSuggestions = computed(() => suggestions.value.length > 0);

    /**
     * 收集本地建议：匹配搜索历史与应用名称/描述
     */
    function collectLocalSuggestions(rawQuery: string): string[] {
        const lowerQuery = rawQuery.toLowerCase();
        const result = new Set<string>();

        searchStore.history.forEach((item) => {
            if (item.query.toLowerCase().includes(lowerQuery)) {
                result.add(item.query);
            }
        });

        appDataStore.apps.forEach((app) => {
            if (app.name.toLowerCase().includes(lowerQuery)) {
                result.add(app.name);
            }
            if (app.description && app.description.toLowerCase().includes(lowerQuery)) {
                result.add(app.description);
            }
        });

        return Array.from(result).slice(0, maxLocalSuggestions);
    }

    /**
     * 从百度 sugrec 接口获取远程建议
     */
    async function fetchRemoteSuggestions(rawQuery: string, signal: AbortSignal): Promise<string[]> {
        try {
            const response = await fetch(
                `https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(rawQuery)}&cb=cb`,
                { signal }
            );
            if (!response.ok) {
                return [];
            }

            const text = await response.text();
            const match = text.match(/^cb\((.*)\);?$/s);
            if (!match) {
                return [];
            }

            const data = JSON.parse(match[1]) as BaiduSuggestionResponse;
            return (data.g || [])
                .map((item) => item.q)
                .filter((item): item is string => typeof item === 'string' && item.length > 0);
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                suggestionError.value = error instanceof Error ? error.message : String(error);
                console.error('[useSearch] 获取远程搜索建议失败:', error);
            }
            return [];
        }
    }

    /**
     * 立即加载搜索建议（内部使用，不防抖）
     */
    async function loadSuggestionsImmediate(rawQuery: string): Promise<void> {
        const trimmedQuery = rawQuery.trim();
        if (!trimmedQuery) {
            clearSuggestions();
            return;
        }

        const previousController = abortController.value;
        previousController?.abort();

        const controller = new AbortController();
        abortController.value = controller;
        activeSuggestionIndex.value = -1;
        suggestionError.value = null;

        const localSuggestions = collectLocalSuggestions(trimmedQuery);

        if (abortController.value === controller) {
            suggestions.value = localSuggestions;
            isLoadingSuggestions.value = true;
        }

        try {
            const remoteSuggestions = await fetchRemoteSuggestions(trimmedQuery, controller.signal);
            if (abortController.value !== controller) {
                return;
            }

            const merged = Array.from(new Set([...localSuggestions, ...remoteSuggestions])).slice(
                0,
                maxSuggestions
            );
            suggestions.value = merged;
        } finally {
            if (abortController.value === controller) {
                isLoadingSuggestions.value = false;
            }
        }
    }

    /** 防抖后的建议加载 */
    const debouncedLoadSuggestions = debounce((rawQuery: unknown) => {
        if (typeof rawQuery !== 'string') {
            return;
        }
        loadSuggestionsImmediate(rawQuery).catch((error) => {
            console.error('[useSearch] 加载建议失败:', error);
        });
    }, debounceMs);

    /**
     * 初始化：加载搜索引擎配置与持久化状态
     */
    async function init(): Promise<void> {
        if (initialized.value) {
            return;
        }

        const loadedEngines = await SearchEngineService.getAll();
        await searchStore.loadFromStorage();

        // 持久化的索引可能超出当前引擎列表范围，需要规范化
        const validIndex = Math.min(
            searchStore.selectedEngineIndex,
            Math.max(0, loadedEngines.length - 1)
        );
        if (loadedEngines.length > 0 && validIndex !== searchStore.selectedEngineIndex) {
            await searchStore.setSelectedEngineIndex(validIndex);
        }

        engines.value = loadedEngines;
        initialized.value = true;
    }

    function setQuery(value: string): void {
        query.value = value;
    }

    /**
     * 清空建议并取消未完成的请求
     */
    function clearSuggestions(): void {
        debouncedLoadSuggestions.cancel();
        abortController.value?.abort();
        abortController.value = null;
        suggestions.value = [];
        activeSuggestionIndex.value = -1;
        isLoadingSuggestions.value = false;
        suggestionError.value = null;
    }

    /**
     * 执行搜索
     *
     * @param rawQuery 搜索关键词，传入时覆盖当前 query
     * @returns 是否成功执行
     */
    async function executeSearch(rawQuery?: string): Promise<boolean> {
        if (typeof rawQuery === 'string') {
            query.value = rawQuery.trim();
        }

        const trimmedQuery = query.value.trim();
        const engine = currentEngine.value;
        if (!trimmedQuery || !engine) {
            return false;
        }

        const url = SearchEngineService.buildSearchUrl(engine, trimmedQuery);
        if (!url) {
            return false;
        }

        window.open(url, '_blank');
        clearSuggestions();
        await searchStore.addHistory(trimmedQuery);
        return true;
    }

    async function executeSearchWithSuggestion(suggestion: string): Promise<boolean> {
        query.value = suggestion;
        return executeSearch();
    }

    async function selectEngine(index: number): Promise<void> {
        if (engines.value.length === 0) {
            return;
        }
        const clamped = Math.max(0, Math.min(index, engines.value.length - 1));
        await searchStore.setSelectedEngineIndex(clamped);
    }

    async function nextEngine(): Promise<void> {
        if (engines.value.length === 0) {
            return;
        }
        const next = (searchStore.selectedEngineIndex + 1) % engines.value.length;
        await selectEngine(next);
    }

    async function prevEngine(): Promise<void> {
        if (engines.value.length === 0) {
            return;
        }
        const prev =
            (searchStore.selectedEngineIndex - 1 + engines.value.length) % engines.value.length;
        await selectEngine(prev);
    }

    async function addHistory(item: string): Promise<void> {
        await searchStore.addHistory(item);
    }

    async function removeHistory(item: string): Promise<void> {
        await searchStore.removeHistory(item);
    }

    async function clearHistory(): Promise<void> {
        await searchStore.clearHistory();
    }

    function moveSuggestionDown(): void {
        if (suggestions.value.length === 0) {
            return;
        }
        activeSuggestionIndex.value = Math.min(
            activeSuggestionIndex.value + 1,
            suggestions.value.length - 1
        );
    }

    function moveSuggestionUp(): void {
        activeSuggestionIndex.value = Math.max(activeSuggestionIndex.value - 1, -1);
    }

    function selectActiveSuggestion(): string | null {
        const index = activeSuggestionIndex.value;
        if (index < 0 || index >= suggestions.value.length) {
            return null;
        }
        const selected = suggestions.value[index];
        query.value = selected;
        activeSuggestionIndex.value = -1;
        suggestions.value = [];
        return selected;
    }

    /**
     * 监听 query 变化自动加载建议
     */
    const stopWatchQuery = watch(query, (newQuery) => {
        activeSuggestionIndex.value = -1;
        if (!newQuery.trim()) {
            debouncedLoadSuggestions.cancel();
            clearSuggestions();
        } else {
            debouncedLoadSuggestions(newQuery);
        }
    });

    onMounted(() => {
        init().catch((error) => {
            console.error('[useSearch] 初始化失败:', error);
        });
    });

    onUnmounted(() => {
        stopWatchQuery();
        clearSuggestions();
    });

    return {
        query,
        engines,
        currentEngineIndex,
        currentEngine,
        suggestions,
        activeSuggestionIndex,
        isLoadingSuggestions,
        suggestionError,
        canSearch,
        hasSuggestions,
        history: toRef(searchStore, 'history'),
        initialized,
        init,
        setQuery,
        executeSearch,
        executeSearchWithSuggestion,
        loadSuggestions: debouncedLoadSuggestions as (rawQuery: string) => void,
        clearSuggestions,
        selectEngine,
        nextEngine,
        prevEngine,
        addHistory,
        removeHistory,
        clearHistory,
        moveSuggestionDown,
        moveSuggestionUp,
        selectActiveSuggestion,
    };
}
