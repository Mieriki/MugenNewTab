/**
 * 搜索状态管理（Pinia Store）
 *
 * 管理当前选中的搜索引擎索引与搜索历史，所有变更持久化到 StorageManager。
 * 与原项目保持一致的数据结构：
 *   - selectedSearchEngine: number（搜索引擎在配置列表中的索引）
 *   - searchHistory: SearchHistoryItem[]（最多保留 10 条，按时间倒序）
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS, type StorageValue } from '@/types/storage';

/** 搜索历史最大保留条数 */
const MAX_HISTORY_SIZE = 10;

/** 单条搜索历史记录 */
export interface SearchHistoryItem {
    query: string;
    time: number;
}

export const useSearchStore = defineStore('search', () => {
    // State
    const selectedEngineIndex = ref<number>(0);
    const history = ref<SearchHistoryItem[]>([]);
    const initialized = ref(false);

    // Getters
    const historyCount = computed(() => history.value.length);
    const isHistoryEmpty = computed(() => history.value.length === 0);

    /**
     * 规范化搜索引擎索引
     * 非负整数回退到 0，与原项目行为一致。
     */
    function normalizeEngineIndex(value: unknown): number {
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed >= 0) {
                return parsed;
            }
        }
        return 0;
    }

    /**
     * 规范化搜索历史数组
     *
     * 兼容旧版 string[] 与新版的 SearchHistoryItem[]，过滤空 query。
     * 旧版字符串会被转换为当前时间戳的 SearchHistoryItem，保留原有顺序。
     */
    function normalizeHistory(value: unknown): SearchHistoryItem[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((item): SearchHistoryItem | null => {
                if (typeof item === 'string') {
                    const query = item.trim();
                    return query ? { query, time: Date.now() } : null;
                }

                if (item && typeof item === 'object') {
                    const raw = item as Partial<SearchHistoryItem>;
                    const query = typeof raw.query === 'string' ? raw.query.trim() : '';
                    const time = typeof raw.time === 'number' ? raw.time : Date.now();
                    return query ? { query, time } : null;
                }

                return null;
            })
            .filter((item): item is SearchHistoryItem => item !== null);
    }

    /**
     * 持久化单个状态值
     *
     * 先更新内存状态，再写入 StorageManager；写入失败时将内存状态回滚到旧值，
     * 保证调用方在 Promise resolve 时数据已持久化，reject 时内存状态不会脏写。
     */
    async function persistValue<T extends StorageValue>(
        key: string,
        stateRef: { value: T },
        nextValue: T
    ): Promise<void> {
        const previousValue = stateRef.value;
        stateRef.value = nextValue;
        try {
            await storageManager.set(key, nextValue);
        } catch (error) {
            stateRef.value = previousValue;
            throw error;
        }
    }

    /**
     * 从 StorageManager 加载 persisted 状态到 store
     */
    async function loadFromStorage(): Promise<void> {
        const [indexValue, historyValue] = await Promise.all([
            storageManager.get(STORAGE_KEYS.SELECTED_SEARCH_ENGINE),
            storageManager.get(STORAGE_KEYS.SEARCH_HISTORY),
        ]);

        selectedEngineIndex.value = normalizeEngineIndex(indexValue);
        history.value = normalizeHistory(historyValue);
        initialized.value = true;
    }

    /**
     * 设置当前选中的搜索引擎索引
     */
    async function setSelectedEngineIndex(index: number): Promise<void> {
        const nextIndex = normalizeEngineIndex(index);
        await persistValue(STORAGE_KEYS.SELECTED_SEARCH_ENGINE, selectedEngineIndex, nextIndex);
    }

    /**
     * 将搜索关键词加入历史
     *
     * 写前重读 persisted 历史，避免并发/跨标签页写入互相覆盖；
     * 重复查询会移动到最前并刷新时间戳，历史总量限制为 MAX_HISTORY_SIZE。
     */
    async function addHistory(query: string): Promise<void> {
        const trimmed = query.trim();
        if (!trimmed) {
            return;
        }

        const persisted = await storageManager.get(STORAGE_KEYS.SEARCH_HISTORY);
        const currentHistory = normalizeHistory(persisted);
        const filtered = currentHistory.filter(item => item.query !== trimmed);
        const nextHistory = [{ query: trimmed, time: Date.now() }, ...filtered].slice(
            0,
            MAX_HISTORY_SIZE
        );

        await persistValue(STORAGE_KEYS.SEARCH_HISTORY, history, nextHistory);
    }

    /**
     * 从搜索历史中移除指定关键词
     */
    async function removeHistory(query: string): Promise<void> {
        const trimmed = query.trim();
        if (!trimmed) {
            return;
        }

        const persisted = await storageManager.get(STORAGE_KEYS.SEARCH_HISTORY);
        const currentHistory = normalizeHistory(persisted);
        const nextHistory = currentHistory.filter(item => item.query !== trimmed);

        if (nextHistory.length === currentHistory.length) {
            return;
        }

        await persistValue(STORAGE_KEYS.SEARCH_HISTORY, history, nextHistory);
    }

    /**
     * 清空搜索历史
     */
    async function clearHistory(): Promise<void> {
        await persistValue(STORAGE_KEYS.SEARCH_HISTORY, history, []);
    }

    return {
        selectedEngineIndex,
        history,
        historyCount,
        isHistoryEmpty,
        initialized,
        loadFromStorage,
        setSelectedEngineIndex,
        addHistory,
        removeHistory,
        clearHistory,
    };
});
