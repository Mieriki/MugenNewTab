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
        expect(store.showAllCategory).toBe(true);
        expect(store.allViewFlat).toBe(false);
        expect(store.showIconBackground).toBe(true);
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
        await store.setShowAllCategory(false);
        await store.setAllViewFlat(true);
        await store.setShowIconBackground(false);

        expect(storageManager.set).toHaveBeenCalledWith(STORAGE_KEYS.LAYOUT_SETTINGS, {
            columns: 3,
            paginate: true,
            pageSize: 12,
            showAllCategory: false,
            allViewFlat: true,
            showIconBackground: false,
            minimalMode: false,
            openMode: 'new-tab',
        });
    });

    it('默认以新标签页方式打开链接', () => {
        const store = useLayoutStore();

        expect(store.openMode).toBe('new-tab');
    });

    it('init 加载已保存的打开方式', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ openMode: 'current-tab' });

        const store = useLayoutStore();
        await store.init();

        expect(store.openMode).toBe('current-tab');
    });

    it('setOpenMode 持久化打开方式', async () => {
        const store = useLayoutStore();
        await store.init();

        await store.setOpenMode('current-tab');

        expect(store.openMode).toBe('current-tab');
        expect(storageManager.set).toHaveBeenLastCalledWith(
            STORAGE_KEYS.LAYOUT_SETTINGS,
            expect.objectContaining({ openMode: 'current-tab' })
        );
    });

    it('非法的打开方式被忽略，保持原值', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ openMode: 'same-window' });

        const store = useLayoutStore();
        await store.init();
        expect(store.openMode).toBe('new-tab');

        await store.setOpenMode('blank' as never);
        expect(store.openMode).toBe('new-tab');
    });

    it('旧数据缺少 showIconBackground 字段时保持默认显示', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ columns: 4, allViewFlat: true });

        const store = useLayoutStore();
        await store.init();

        expect(store.columns).toBe(4);
        expect(store.allViewFlat).toBe(true);
        expect(store.showIconBackground).toBe(true);
    });

    it('非法 pageSize 被忽略', async () => {
        const store = useLayoutStore();
        await store.init();

        await store.setPageSize(0);

        expect(store.pageSize).toBe(24);
    });
});
