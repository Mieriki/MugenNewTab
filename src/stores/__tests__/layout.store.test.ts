/**
 * layout.store 单元测试
 *
 * 覆盖默认值、设置加载、setter 持久化与非法值处理。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLayoutStore } from '@/stores/layout.store';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';

describe('layout.store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.spyOn(storageManager, 'get').mockResolvedValue(null);
        vi.spyOn(storageManager, 'set').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('默认值为自适应列数、关闭分页', () => {
        const store = useLayoutStore();

        expect(store.columns).toBe('auto');
        expect(store.paginate).toBe(false);
        expect(store.pageSize).toBe(24);
    });

    it('init 加载已保存的布局设置', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ columns: 4, paginate: true, pageSize: 48 });

        const store = useLayoutStore();
        await store.init();

        expect(store.columns).toBe(4);
        expect(store.paginate).toBe(true);
        expect(store.pageSize).toBe(48);
        expect(store.initialized).toBe(true);
    });

    it('setter 更新并持久化设置', async () => {
        const store = useLayoutStore();
        await store.init();

        await store.setColumns(3);
        await store.setPaginate(true);
        await store.setPageSize(12);

        expect(storageManager.set).toHaveBeenCalledWith(STORAGE_KEYS.LAYOUT_SETTINGS, {
            columns: 3,
            paginate: true,
            pageSize: 12,
        });
    });

    it('非法 pageSize 被忽略', async () => {
        const store = useLayoutStore();
        await store.init();

        await store.setPageSize(0);

        expect(store.pageSize).toBe(24);
    });
});
