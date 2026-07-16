import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { BrowserAPI } from '@/services/browserApi.service';
import { clearConfigCache } from '@/services/config.service';
import { storageManager } from '@/services/storage.service';
import { useUiLibStore } from '@/stores/uiLib.store';
import { STORAGE_KEYS } from '@/types/storage';
import type { DefaultDataConfig } from '@/types/config';

const mockDefaultData: DefaultDataConfig = {
    appNavigator: { categories: [], apps: [] },
    systemUiLib: {
        categories: [
            { id: 'sys-cat-1', name: '系统分类一' },
        ],
        items: [
            { id: 'sys-item-1', name: '系统图标一', url: '/image/icons/menu.svg', category: 'sys-cat-1' },
        ],
    },
    userUiLib: { categories: [], items: [] },
};

function setupFetchMock() {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockDefaultData,
        })
    );
}

describe('useUiLibStore', () => {
    beforeEach(() => {
        localStorage.clear();
        clearConfigCache();
        vi.restoreAllMocks();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        setupFetchMock();
        setActivePinia(createPinia());
    });

    it('初始化应加载系统与用户 UI 库并正确合并', async () => {
        await storageManager.set(STORAGE_KEYS.USER_UI_LIB, {
            categories: [{ id: 'user-cat-1', name: '用户分类一' }],
            items: [{ id: 'user-item-1', name: '用户图标一', url: '/image/icons/folder.svg', category: 'user-cat-1' }],
        });

        const store = useUiLibStore();
        await store.init();

        expect(store.initialized).toBe(true);
        expect(store.systemUiLib.categories).toHaveLength(1);
        expect(store.userUiLib.categories).toHaveLength(1);
        expect(store.categories).toHaveLength(2);
        expect(store.items).toHaveLength(2);
    });

    it('合并后的系统项应标记 isSystem 为 true，用户项为 false', async () => {
        const store = useUiLibStore();
        await store.init();
        const category = await store.addCategory({ name: '用户分类' });
        const userItemAdded = await store.addItem({
            name: '用户图标',
            url: '/image/icons/folder.svg',
            category: category.id,
        });

        const sysItem = store.items.find(i => i.id === 'sys-item-1');
        const userItem = store.items.find(i => i.id === userItemAdded.id);

        expect(sysItem?.isSystem).toBe(true);
        expect(userItem?.isSystem).toBe(false);
    });

    it('addCategory 应添加用户分类并持久化', async () => {
        const store = useUiLibStore();
        await store.init();

        const category = await store.addCategory({ name: '新建分类' });

        expect(category.name).toBe('新建分类');
        expect(category.id).toMatch(/^uicat_/);
        expect(store.userUiLib.categories).toHaveLength(1);

        const persisted = await storageManager.get(STORAGE_KEYS.USER_UI_LIB);
        expect((persisted as { categories: unknown[] }).categories).toHaveLength(1);
    });

    it('addCategory 传入空名称应抛出错误', async () => {
        const store = useUiLibStore();
        await store.init();

        await expect(store.addCategory({ name: '   ' })).rejects.toThrow('分类名称不能为空');
    });

    it('updateCategory 应更新用户分类', async () => {
        const store = useUiLibStore();
        await store.init();
        const added = await store.addCategory({ name: '旧名称' });

        const updated = await store.updateCategory(added.id, { name: '新名称' });

        expect(updated?.name).toBe('新名称');
        expect(store.userUiLib.categories[0].name).toBe('新名称');
    });

    it('updateCategory 不能修改系统分类', async () => {
        const store = useUiLibStore();
        await store.init();

        const result = await store.updateCategory('sys-cat-1', { name: '篡改' });

        expect(result).toBeNull();
        expect(store.systemUiLib.categories[0].name).toBe('系统分类一');
    });

    it('deleteCategory 应删除用户分类及其下图标', async () => {
        const store = useUiLibStore();
        await store.init();
        const category = await store.addCategory({ name: '待删除分类' });
        const item = await store.addItem({
            name: '待删除图标',
            url: '/image/icons/folder.svg',
            category: category.id,
        });

        const deleted = await store.deleteCategory(category.id);

        expect(deleted).toBe(true);
        expect(store.userUiLib.categories).toHaveLength(0);
        expect(store.userUiLib.items.some(i => i.id === item.id)).toBe(false);
    });

    it('deleteCategory 不能删除系统分类', async () => {
        const store = useUiLibStore();
        await store.init();

        const result = await store.deleteCategory('sys-cat-1');

        expect(result).toBe(false);
        expect(store.systemUiLib.categories).toHaveLength(1);
    });

    it('addItem 空 url 时应使用默认系统 SVG 图标', async () => {
        const store = useUiLibStore();
        await store.init();
        const category = await store.addCategory({ name: '图标分类' });

        const item = await store.addItem({ name: '无地址图标', url: '', category: category.id });

        expect(item.url).toBe('/image/icons/picture.svg');
        expect(store.userUiLib.items[0].url).toBe('/image/icons/picture.svg');
    });

    it('addItem 传入 data URL 应抛出错误', async () => {
        const store = useUiLibStore();
        await store.init();
        const category = await store.addCategory({ name: '图标分类' });

        await expect(
            store.addItem({ name: '非法图标', url: 'data:image/svg+xml;base64,xxx', category: category.id })
        ).rejects.toThrow('不支持 data URL');
    });

    it('addItem 传入 emoji 类非图片地址应抛出错误', async () => {
        const store = useUiLibStore();
        await store.init();
        const category = await store.addCategory({ name: '图标分类' });

        await expect(store.addItem({ name: '非法图标', url: '😀', category: category.id })).rejects.toThrow(
            '图标地址格式无效'
        );
    });

    it('updateItem 应更新用户图标', async () => {
        const store = useUiLibStore();
        await store.init();
        const category = await store.addCategory({ name: '图标分类' });
        const item = await store.addItem({ name: '旧图标', url: '/image/icons/folder.svg', category: category.id });

        const updated = await store.updateItem(item.id, { name: '新图标', url: '/image/icons/menu.svg' });

        expect(updated?.name).toBe('新图标');
        expect(updated?.url).toBe('/image/icons/menu.svg');
    });

    it('updateItem 不能修改系统图标', async () => {
        const store = useUiLibStore();
        await store.init();

        const result = await store.updateItem('sys-item-1', { name: '篡改' });

        expect(result).toBeNull();
        expect(store.systemUiLib.items[0].name).toBe('系统图标一');
    });

    it('deleteItem 不能删除系统图标', async () => {
        const store = useUiLibStore();
        await store.init();

        const result = await store.deleteItem('sys-item-1');

        expect(result).toBe(false);
        expect(store.systemUiLib.items).toHaveLength(1);
    });

    it('updateCategoriesOrder 应为局部排序且保留未出现分类', async () => {
        const store = useUiLibStore();
        await store.init();
        const c1 = await store.addCategory({ name: '分类一' });
        const c2 = await store.addCategory({ name: '分类二' });
        const c3 = await store.addCategory({ name: '分类三' });

        await store.updateCategoriesOrder([c3.id, c1.id]);

        const ids = store.userUiLib.categories.map(c => c.id);
        expect(ids).toEqual([c3.id, c1.id, c2.id]);
    });

    it('updateItemsOrder 应为局部排序且保留未出现图标', async () => {
        const store = useUiLibStore();
        await store.init();
        const category = await store.addCategory({ name: '图标分类' });
        const i1 = await store.addItem({ name: '图标一', url: '/image/icons/folder.svg', category: category.id });
        const i2 = await store.addItem({ name: '图标二', url: '/image/icons/menu.svg', category: category.id });
        const i3 = await store.addItem({ name: '图标三', url: '/image/icons/picture.svg', category: category.id });

        await store.updateItemsOrder([i3.id, i1.id]);

        const ids = store.userUiLib.items.map(i => i.id);
        expect(ids).toEqual([i3.id, i1.id, i2.id]);
    });

    it('复杂写操作前应重读持久化数据，避免覆盖外部更新', async () => {
        const store = useUiLibStore();
        await store.init();

        // 外部直接写入新的用户分类
        await storageManager.set(STORAGE_KEYS.USER_UI_LIB, {
            categories: [{ id: 'external-cat', name: '外部分类' }],
            items: [],
        });

        // store  addCategory 会重读持久化数据，因此不会覆盖外部分类
        await store.addCategory({ name: 'store 分类' });

        expect(store.userUiLib.categories).toHaveLength(2);
        expect(store.userUiLib.categories.some(c => c.id === 'external-cat')).toBe(true);
    });

    it('写入失败时应回滚内存状态', async () => {
        const store = useUiLibStore();
        await store.init();

        const spy = vi.spyOn(storageManager, 'setMany').mockRejectedValueOnce(new Error('QuotaExceeded'));

        await expect(store.addCategory({ name: '回滚测试' })).rejects.toThrow('QuotaExceeded');
        expect(store.userUiLib.categories).toHaveLength(0);

        spy.mockRestore();
    });

    it('saveUserUiLib 应支持批量替换用户 UI 库', async () => {
        const store = useUiLibStore();
        await store.init();
        await store.addCategory({ name: '旧分类' });

        await store.saveUserUiLib({
            categories: [{ id: 'new-cat', name: '新分类' }],
            items: [],
        });

        expect(store.userUiLib.categories).toHaveLength(1);
        expect(store.userUiLib.categories[0].id).toBe('new-cat');
    });

    it('resetUserUiLib 应清空用户数据', async () => {
        const store = useUiLibStore();
        await store.init();
        await store.addCategory({ name: '待清空' });

        await store.resetUserUiLib();

        expect(store.userUiLib.categories).toHaveLength(0);
        expect(store.userUiLib.items).toHaveLength(0);
    });

    it('外部存储变更应同步更新 store', async () => {
        const store = useUiLibStore();
        await store.init();

        await storageManager.set(STORAGE_KEYS.USER_UI_LIB, {
            categories: [{ id: 'sync-cat', name: '同步分类' }],
            items: [],
        });

        expect(store.userUiLib.categories).toHaveLength(1);
        expect(store.userUiLib.categories[0].id).toBe('sync-cat');
    });
});
