import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useDataManager, type UseDataManagerOptions } from '@/composables/useDataManager';
import { useAppDataStore } from '@/stores/appData.store';
import { useUiLibStore } from '@/stores/uiLib.store';
import { storageManager } from '@/services/storage.service';
import { BrowserAPI } from '@/services/browserApi.service';
import { loadDefaultData, clearConfigCache } from '@/services/config.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { AppNavigatorData, AppItem, Category } from '@/types/app';

vi.mock('@/services/config.service', () => ({
    loadDefaultData: vi.fn(),
    clearConfigCache: vi.fn(),
}));

const mockedLoadDefaultData = vi.mocked(loadDefaultData);

const defaultAllCategory: Category = {
    id: 'all',
    name: '全部应用',
    icon: './image/icons/menu.svg',
    monochrome: true,
};

const mockDefaultAppData: AppNavigatorData = {
    categories: [
        { id: 'media', name: '娱乐媒体', icon: './image/icons/heart.svg', monochrome: true },
        { id: 'dev', name: '开发工具', icon: './image/icons/code.svg', monochrome: true },
    ],
    apps: [
        {
            id: 'app_1',
            name: 'Bilibili',
            description: '哔哩哔哩',
            icon: 'https://favicon.im/www.bilibili.com',
            url: 'https://www.bilibili.com',
            category: 'media',
        },
    ],
};

const mockDefaultDataConfig = {
    appNavigator: mockDefaultAppData,
    systemUiLib: {
        categories: [{ id: 'sys-cat-1', name: '系统分类' }],
        items: [{ id: 'sys-item-1', name: '系统图标', url: '/image/icons/menu.svg', category: 'sys-cat-1' }],
    },
    userUiLib: { categories: [], items: [] },
};

function setupFetchMock() {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockDefaultDataConfig,
        })
    );
}

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountUseDataManager(options: UseDataManagerOptions = {}) {
    let dm: ReturnType<typeof useDataManager> = null as unknown as ReturnType<typeof useDataManager>;
    const wrapper = mount({
        setup() {
            dm = useDataManager(options);
            return {};
        },
        template: '<div></div>',
    });
    return { wrapper, getDm: () => dm };
}

describe('useDataManager', () => {
    beforeEach(() => {
        localStorage.clear();
        clearConfigCache();
        vi.restoreAllMocks();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        setupFetchMock();
        setActivePinia(createPinia());
        mockedLoadDefaultData.mockReset();
        mockedLoadDefaultData.mockResolvedValue(mockDefaultDataConfig);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    describe('初始化', () => {
        it('默认应在挂载后自动初始化两个 store', async () => {
            const { getDm, wrapper } = mountUseDataManager();
            await flushPromises();
            await nextTick();

            expect(getDm().initialized.value).toBe(true);
            expect(getDm().categories.value[0]).toEqual(defaultAllCategory);
            expect(getDm().uiCategories.value).toHaveLength(1);
            wrapper.unmount();
        });

        it('autoInit: false 时挂载后不应自动初始化', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await flushPromises();
            await nextTick();

            expect(getDm().initialized.value).toBe(false);
            wrapper.unmount();
        });

        it('手动调用 init 应完成初始化', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            expect(getDm().initialized.value).toBe(true);
            expect(getDm().apps.value).toHaveLength(1);
            wrapper.unmount();
        });

        it('重复并发调用 init 应返回同一 Promise', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            const p1 = getDm().init();
            const p2 = getDm().init();
            await Promise.all([p1, p2]);

            expect(p1).toBe(p2);
            wrapper.unmount();
        });
    });

    describe('应用 CRUD', () => {
        it('addApp 应添加应用并持久化', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const app = await getDm().addApp({
                name: 'GitHub',
                url: 'https://github.com',
                category: 'dev',
            });

            expect(app.id).toMatch(/^app_/);
            expect(getDm().apps.value.map((a: AppItem) => a.id)).toContain(app.id);

            const saved = (await storageManager.get(STORAGE_KEYS.MAIN_DATA)) as AppNavigatorData;
            expect(saved.apps.map((a) => a.id)).toContain(app.id);
            wrapper.unmount();
        });

        it('updateApp 应更新应用', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const app = getDm().apps.value[0];
            const updated = await getDm().updateApp(app.id, { name: '哔哩哔哩', hidden: true });

            expect(updated?.name).toBe('哔哩哔哩');
            expect(updated?.hidden).toBe(true);
            expect(getDm().apps.value.find((a) => a.id === app.id)?.name).toBe('哔哩哔哩');
            wrapper.unmount();
        });

        it('deleteApp 应删除应用', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const app = getDm().apps.value[0];
            const deleted = await getDm().deleteApp(app.id);

            expect(deleted).toBe(true);
            expect(getDm().apps.value.find((a) => a.id === app.id)).toBeUndefined();

            const saved = (await storageManager.get(STORAGE_KEYS.MAIN_DATA)) as AppNavigatorData;
            expect(saved.apps.find((a) => a.id === app.id)).toBeUndefined();
            wrapper.unmount();
        });

        it('visibleApps / hiddenApps 应正确过滤', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const app = getDm().apps.value[0];
            await getDm().updateApp(app.id, { hidden: true });

            expect(getDm().hiddenApps.value).toHaveLength(1);
            expect(getDm().visibleApps.value).toHaveLength(0);
            wrapper.unmount();
        });
    });

    describe('分类 CRUD', () => {
        it('addCategory 应添加分类', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const category = await getDm().addCategory({ name: '工具' });

            expect(category.id).toMatch(/^cat_/);
            expect(getDm().categories.value.map((c) => c.id)).toContain(category.id);
            wrapper.unmount();
        });

        it('deleteCategory 应删除分类及其应用', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const category = getDm().userCategories.value.find((c) => c.id === 'media')!;
            const deleted = await getDm().deleteCategory(category.id);

            expect(deleted).toBe(true);
            expect(getDm().categories.value.map((c) => c.id)).not.toContain('media');
            expect(getDm().apps.value.map((a) => a.category)).not.toContain('media');
            wrapper.unmount();
        });
    });

    describe('排序', () => {
        it('updateAppsOrder 应按 ID 排序应用', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            await getDm().addApp({ name: 'A', url: 'https://a.test', category: 'dev' });
            await getDm().addApp({ name: 'B', url: 'https://b.test', category: 'dev' });

            const ids = [...getDm().apps.value.map((a) => a.id)].reverse();
            await getDm().updateAppsOrder(ids);

            expect(getDm().apps.value.map((a) => a.id)).toEqual(ids);
            wrapper.unmount();
        });

        it('updateCategoriesOrder 应保持“全部应用”在最前', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const ids = getDm().userCategories.value.map((c) => c.id).reverse();
            await getDm().updateCategoriesOrder(ids);

            expect(getDm().categories.value[0].id).toBe('all');
            expect(getDm().categories.value.slice(1).map((c) => c.id)).toEqual(ids);
            wrapper.unmount();
        });
    });

    describe('UI 图标库 CRUD', () => {
        it('addUiCategory 应添加用户 UI 分类', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const category = await getDm().addUiCategory({ name: '用户分类' });

            expect(category.id).toMatch(/^uicat_/);
            expect(getDm().uiCategories.value.map((c) => c.id)).toContain(category.id);
            expect(getDm().userUiLib.value.categories).toHaveLength(1);
            wrapper.unmount();
        });

        it('addUiItem 应添加用户图标并使用默认 SVG', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const category = await getDm().addUiCategory({ name: '图标分类' });
            const item = await getDm().addUiItem({ name: '图标', url: '', category: category.id });

            expect(item.id).toMatch(/^uiitem_/);
            expect(item.url).toBe('/image/icons/picture.svg');
            expect(getDm().uiItems.value.map((i) => i.id)).toContain(item.id);
            wrapper.unmount();
        });

        it('addUiItem 传入 emoji 应抛出错误', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const category = await getDm().addUiCategory({ name: '图标分类' });
            await expect(
                getDm().addUiItem({ name: '非法图标', url: '😀', category: category.id })
            ).rejects.toThrow('图标地址格式无效');
            wrapper.unmount();
        });

        it('deleteUiItem 应删除用户图标', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const category = await getDm().addUiCategory({ name: '图标分类' });
            const item = await getDm().addUiItem({ name: '待删除', url: '/image/icons/folder.svg', category: category.id });

            const deleted = await getDm().deleteUiItem(item.id);
            expect(deleted).toBe(true);
            expect(getDm().uiItems.value.map((i) => i.id)).not.toContain(item.id);
            wrapper.unmount();
        });
    });

    describe('导入导出', () => {
        it('exportData 应导出当前数据', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const backup = await getDm().exportData();
            expect(backup.data).toBeDefined();
            expect(backup.version).toBe('2.0');
            wrapper.unmount();
        });

        it('importData 应全量替换数据', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const imported: AppNavigatorData = {
                categories: [{ id: 'imported', name: '导入分类', icon: './image/icons/folder.svg' }],
                apps: [{ id: 'app_imported', name: '导入应用', url: 'https://import.test', category: 'imported' }],
            };
            await getDm().importData({ data: imported });

            expect(getDm().categories.value.map((c) => c.id)).toContain('imported');
            expect(getDm().apps.value.map((a) => a.id)).toContain('app_imported');
            wrapper.unmount();
        });

        it('resetToDefault 应恢复默认数据', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            await getDm().deleteCategory('media');
            expect(getDm().categories.value.map((c) => c.id)).not.toContain('media');

            await getDm().resetToDefault();
            expect(getDm().categories.value.map((c) => c.id)).toContain('media');
            wrapper.unmount();
        });
    });

    describe('副作用清理', () => {
        it('挂载时应订阅 appDataStore 外部变更，卸载时应取消订阅', async () => {
            const appDataStore = useAppDataStore();
            const unsubscribe = vi.fn();
            const subscribeSpy = vi.spyOn(appDataStore, 'subscribeToExternalChanges').mockReturnValue(unsubscribe);

            const { wrapper } = mountUseDataManager({ autoInit: false });
            await flushPromises();
            await nextTick();

            expect(subscribeSpy).toHaveBeenCalledTimes(1);
            expect(unsubscribe).not.toHaveBeenCalled();

            wrapper.unmount();
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });

        it('卸载时应中止正在进行的初始化且不抛出未捕获异常', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            const appDataStore = useAppDataStore();

            // 延迟 init 完成，确保卸载时仍在进行中
            let resolveInit: () => void;
            vi.spyOn(appDataStore, 'init').mockImplementation(
                () => new Promise((resolve) => {
                    resolveInit = resolve;
                })
            );

            const initPromise = getDm().init();
            wrapper.unmount();
            resolveInit!();

            await expect(initPromise).resolves.toBeUndefined();
        });
    });

    describe('状态一致性', () => {
        it('通过 uiLibStore 修改用户图标库后，存储应持久化', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            await getDm().init();

            const category = await getDm().addUiCategory({ name: '同步测试' });
            const saved = (await storageManager.get(STORAGE_KEYS.USER_UI_LIB)) as { categories: { id: string }[] };

            expect(saved.categories.map((c) => c.id)).toContain(category.id);
            wrapper.unmount();
        });

        it('isLoading 应合并两个 store 的加载状态', async () => {
            const { getDm, wrapper } = mountUseDataManager({ autoInit: false });
            const appDataStore = useAppDataStore();
            const uiLibStore = useUiLibStore();

            expect(getDm().isLoading.value).toBe(false);

            appDataStore.isLoading = true;
            expect(getDm().isLoading.value).toBe(true);

            appDataStore.isLoading = false;
            uiLibStore.isLoading = true;
            expect(getDm().isLoading.value).toBe(true);

            uiLibStore.isLoading = false;
            expect(getDm().isLoading.value).toBe(false);
            wrapper.unmount();
        });
    });
});
