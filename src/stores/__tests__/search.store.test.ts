import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSearchStore, type SearchHistoryItem } from '@/stores/search.store';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';

function expectHistoryQueries(history: SearchHistoryItem[], queries: string[]) {
    expect(history.map(item => item.query)).toEqual(queries);
}

describe('useSearchStore', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('初始化为默认值', () => {
        const store = useSearchStore();

        expect(store.selectedEngineIndex).toBe(0);
        expect(store.history).toEqual([]);
        expect(store.historyCount).toBe(0);
        expect(store.isHistoryEmpty).toBe(true);
        expect(store.initialized).toBe(false);
    });

    it('loadFromStorage 读取已持久化的值', async () => {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SEARCH_ENGINE, '3');
        localStorage.setItem(
            STORAGE_KEYS.SEARCH_HISTORY,
            JSON.stringify([
                { query: 'vue', time: 1700000000000 },
                { query: 'pinia', time: 1700000001000 },
            ])
        );

        const store = useSearchStore();
        await store.loadFromStorage();

        expect(store.selectedEngineIndex).toBe(3);
        expectHistoryQueries(store.history, ['vue', 'pinia']);
        expect(store.initialized).toBe(true);
    });

    it('loadFromStorage 兼容旧版 string[]', async () => {
        localStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(['vue', 'pinia']));

        const store = useSearchStore();
        await store.loadFromStorage();

        expectHistoryQueries(store.history, ['vue', 'pinia']);
    });

    it('loadFromStorage 规范化非法 persisted 值', async () => {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SEARCH_ENGINE, 'invalid');
        localStorage.setItem(
            STORAGE_KEYS.SEARCH_HISTORY,
            JSON.stringify([123, '', { query: 'valid' }, null, '  ', { query: '' }])
        );

        const store = useSearchStore();
        await store.loadFromStorage();

        expect(store.selectedEngineIndex).toBe(0);
        expectHistoryQueries(store.history, ['valid']);
    });

    it('setSelectedEngineIndex 持久化索引', async () => {
        const store = useSearchStore();
        await store.setSelectedEngineIndex(2);

        expect(store.selectedEngineIndex).toBe(2);
        expect(localStorage.getItem(STORAGE_KEYS.SELECTED_SEARCH_ENGINE)).toBe('2');
    });

    it('setSelectedEngineIndex 将非法/负数索引规范化为 0', async () => {
        const store = useSearchStore();
        await store.setSelectedEngineIndex(-1);

        expect(store.selectedEngineIndex).toBe(0);
    });

    it('addHistory 添加关键词并持久化', async () => {
        const store = useSearchStore();
        await store.addHistory('vue');

        expectHistoryQueries(store.history, ['vue']);

        const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY) || '[]');
        expect(persisted).toHaveLength(1);
        expect(persisted[0].query).toBe('vue');
        expect(typeof persisted[0].time).toBe('number');
    });

    it('addHistory 将重复查询移动到最前', async () => {
        const store = useSearchStore();
        await store.addHistory('pinia');
        await store.addHistory('vue');
        await store.addHistory('pinia');

        expectHistoryQueries(store.history, ['pinia', 'vue']);
    });

    it('addHistory 历史记录最多保留 10 条', async () => {
        const store = useSearchStore();
        for (let i = 1; i <= 12; i++) {
            await store.addHistory(`query ${i}`);
        }

        expect(store.history).toHaveLength(10);
        expect(store.history[0].query).toBe('query 12');
        expect(store.history[9].query).toBe('query 3');
    });

    it('addHistory 忽略空字符串与纯空白查询', async () => {
        const store = useSearchStore();
        await store.addHistory('  ');

        expect(store.history).toEqual([]);
        expect(localStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY)).toBeNull();
    });

    it('removeHistory 移除指定关键词', async () => {
        const store = useSearchStore();
        await store.addHistory('vue');
        await store.addHistory('pinia');
        await store.removeHistory('vue');

        expectHistoryQueries(store.history, ['pinia']);
    });

    it('clearHistory 清空所有历史', async () => {
        const store = useSearchStore();
        await store.addHistory('vue');
        await store.addHistory('pinia');
        await store.clearHistory();

        expect(store.history).toEqual([]);
        expect(localStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY)).toBe(JSON.stringify([]));
    });

    it('写入失败时回滚内存状态', async () => {
        const store = useSearchStore();
        const setSpy = vi.spyOn(storageManager, 'set').mockRejectedValueOnce(new Error('storage error'));

        await expect(store.addHistory('vue')).rejects.toThrow('storage error');
        expect(store.history).toEqual([]);

        setSpy.mockRestore();
    });

    it('写前重读，避免覆盖并发/外部更新', async () => {
        const store = useSearchStore();
        await store.addHistory('vue');

        // 模拟外部并发写入
        localStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify([{ query: 'pinia', time: Date.now() }]));

        await store.addHistory('react');

        expectHistoryQueries(store.history, ['react', 'pinia']);
    });
});
