import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppDataStore } from '@/stores/appData.store';
import { storageManager } from '@/services/storage.service';
import { BrowserAPI } from '@/services/browserApi.service';
import { loadDefaultData } from '@/services/config.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { AppNavigatorData, Category } from '@/types/app';

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

const mockDefaultData: AppNavigatorData = {
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
    appNavigator: mockDefaultData,
    systemUiLib: { categories: [], items: [] },
    userUiLib: { categories: [], items: [] },
};

function createStore() {
    setActivePinia(createPinia());
    return useAppDataStore();
}

describe('useAppDataStore', () => {
    beforeEach(async () => {
        localStorage.clear();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        mockedLoadDefaultData.mockReset();
        mockedLoadDefaultData.mockResolvedValue(mockDefaultDataConfig);
    });

    describe('初始化', () => {
        it('存储为空时应加载默认数据并补齐“全部应用”分类', async () => {
            const store = createStore();
            await store.init();

            expect(store.initialized).toBe(true);
            expect(store.categories[0]).toEqual(defaultAllCategory);
            expect(store.categories.map(c => c.id)).toContain('media');
            expect(store.categories.map(c => c.id)).toContain('dev');
            expect(store.apps).toHaveLength(1);

            const saved = await storageManager.get(STORAGE_KEYS.MAIN_DATA) as AppNavigatorData;
            expect(saved.categories[0].id).toBe('all');
        });

        it('存储已有合法数据时应直接加载', async () => {
            const existing: AppNavigatorData = {
                categories: [defaultAllCategory, { id: 'custom', name: '自定义', icon: './image/icons/folder.svg' }],
                apps: [{ id: 'app_custom', name: 'Custom', url: 'https://custom.test', category: 'custom' }],
            };
            await storageManager.set(STORAGE_KEYS.MAIN_DATA, existing);

            const store = createStore();
            await store.init();

            expect(store.categories.map(c => c.id)).toEqual(['all', 'custom']);
            expect(store.apps[0].name).toBe('Custom');
        });

        it('缺失“全部应用”分类时应自动补齐并持久化', async () => {
            const existing: AppNavigatorData = {
                categories: [{ id: 'custom', name: '自定义', icon: './image/icons/folder.svg' }],
                apps: [],
            };
            await storageManager.set(STORAGE_KEYS.MAIN_DATA, existing);

            const store = createStore();
            await store.init();

            expect(store.categories[0].id).toBe('all');
            const saved = await storageManager.get(STORAGE_KEYS.MAIN_DATA) as AppNavigatorData;
            expect(saved.categories[0].id).toBe('all');
        });

        it('初始化后再次调用应直接返回', async () => {
            const store = createStore();
            await store.init();
            const categories = store.categories;
            await store.init();
            expect(store.categories).toBe(categories);
        });
    });

    describe('应用 CRUD', () => {
        it('addApp 应生成 ID 并持久化', async () => {
            const store = createStore();
            await store.init();

            const newApp = await store.addApp({
                name: 'GitHub',
                url: 'https://github.com',
                category: 'dev',
                description: '代码托管',
            });

            expect(newApp.id).toMatch(/^app_/);
            expect(newApp.name).toBe('GitHub');
            expect(store.apps).toContainEqual(newApp);

            const saved = await storageManager.get(STORAGE_KEYS.MAIN_DATA) as AppNavigatorData;
            expect(saved.apps).toContainEqual(newApp);
        });

        it('updateApp 应更新指定应用', async () => {
            const store = createStore();
            await store.init();
            const app = store.apps[0];

            const updated = await store.updateApp(app.id, { name: '哔哩哔哩', hidden: true });

            expect(updated).not.toBeNull();
            expect(updated!.name).toBe('哔哩哔哩');
            expect(updated!.hidden).toBe(true);
            expect(store.apps.find(a => a.id === app.id)?.name).toBe('哔哩哔哩');
        });

        it('updateApp 对不存在 ID 应返回 null', async () => {
            const store = createStore();
            await store.init();
            const updated = await store.updateApp('not-exist', { name: 'Test' });
            expect(updated).toBeNull();
        });

        it('deleteApp 应删除应用', async () => {
            const store = createStore();
            await store.init();
            const app = store.apps[0];
            const deleted = await store.deleteApp(app.id);

            expect(deleted).toBe(true);
            expect(store.apps.find(a => a.id === app.id)).toBeUndefined();

            const saved = await storageManager.get(STORAGE_KEYS.MAIN_DATA) as AppNavigatorData;
            expect(saved.apps.find(a => a.id === app.id)).toBeUndefined();
        });

        it('visibleApps / hiddenApps getter 应正确过滤', async () => {
            const store = createStore();
            await store.init();
            const app = store.apps[0];
            await store.updateApp(app.id, { hidden: true });

            expect(store.hiddenApps).toHaveLength(1);
            expect(store.visibleApps).toHaveLength(0);
        });

        it('getAppsByCategory 应按分类返回应用', async () => {
            const store = createStore();
            await store.init();
            expect(store.getAppsByCategory('media')).toHaveLength(1);
            expect(store.getAppsByCategory('dev')).toHaveLength(0);
        });
    });

    describe('分类 CRUD', () => {
        it('addCategory 应生成 ID 并使用默认 SVG 图标', async () => {
            const store = createStore();
            await store.init();
            const category = await store.addCategory({ name: '工具' });

            expect(category.id).toMatch(/^cat_/);
            expect(category.name).toBe('工具');
            expect(category.icon).toBe('./image/icons/folder.svg');
            expect(store.categories.map(c => c.id)).toContain(category.id);
        });

        it('updateCategory 应更新分类', async () => {
            const store = createStore();
            await store.init();
            const category = store.userCategories[0];
            const updated = await store.updateCategory(category.id, { name: '娱乐' });

            expect(updated!.name).toBe('娱乐');
            expect(store.getCategoryById(category.id)?.name).toBe('娱乐');
        });

        it('deleteCategory 应删除分类及其应用', async () => {
            const store = createStore();
            await store.init();
            const category = store.userCategories.find(c => c.id === 'media')!;
            const deleted = await store.deleteCategory(category.id);

            expect(deleted).toBe(true);
            expect(store.categories.map(c => c.id)).not.toContain('media');
            expect(store.apps.map(a => a.category)).not.toContain('media');
        });

        it('禁止删除“全部应用”分类', async () => {
            const store = createStore();
            await store.init();
            const deleted = await store.deleteCategory('all');
            expect(deleted).toBe(false);
            expect(store.allCategory).toBeDefined();
        });
    });

    describe('排序', () => {
        it('updateAppsOrder 应按指定 ID 排序', async () => {
            const store = createStore();
            await store.init();
            await store.addApp({ name: 'A', url: 'https://a.test', category: 'dev' });
            await store.addApp({ name: 'B', url: 'https://b.test', category: 'dev' });

            const ids = [...store.apps.map(a => a.id)].reverse();
            await store.updateAppsOrder(ids);

            expect(store.apps.map(a => a.id)).toEqual(ids);
        });

        it('updateCategoriesOrder 应保持“全部应用”在最前', async () => {
            const store = createStore();
            await store.init();
            const ids = store.userCategories.map(c => c.id).reverse();
            await store.updateCategoriesOrder(ids);

            expect(store.categories[0].id).toBe('all');
            expect(store.categories.slice(1).map(c => c.id)).toEqual(ids);
        });
    });

    describe('导入导出', () => {
        it('exportData 应导出当前数据', async () => {
            const store = createStore();
            await store.init();
            const backup = await store.exportData();

            expect(backup.data).toBeDefined();
            expect(backup.version).toBe('2.0');
            expect(backup.data!.categories[0].id).toBe('all');
        });

        it('importData 应全量替换并补齐“全部应用”', async () => {
            const store = createStore();
            await store.init();

            const imported: AppNavigatorData = {
                categories: [{ id: 'imported', name: '导入分类', icon: './image/icons/folder.svg' }],
                apps: [{ id: 'app_imported', name: '导入应用', url: 'https://import.test', category: 'imported' }],
            };
            await store.importData({ data: imported });

            expect(store.categories[0].id).toBe('all');
            expect(store.categories.map(c => c.id)).toContain('imported');
            expect(store.apps.map(a => a.id)).toContain('app_imported');
        });

        it('resetToDefault 应恢复默认数据', async () => {
            const store = createStore();
            await store.init();
            await store.deleteCategory('media');
            expect(store.categories.map(c => c.id)).not.toContain('media');

            await store.resetToDefault();
            expect(store.categories.map(c => c.id)).toContain('media');
        });
    });

    describe('写前重读与失败回滚', () => {
        it('并发修改不应互相覆盖（写前重读）', async () => {
            const store = createStore();
            await store.init();

            const [app1, app2] = await Promise.all([
                store.addApp({ name: '并发1', url: 'https://c1.test', category: 'dev' }),
                store.addApp({ name: '并发2', url: 'https://c2.test', category: 'dev' }),
            ]);

            expect(store.apps.map(a => a.id)).toContain(app1.id);
            expect(store.apps.map(a => a.id)).toContain(app2.id);

            const saved = await storageManager.get(STORAGE_KEYS.MAIN_DATA) as AppNavigatorData;
            expect(saved.apps.map(a => a.id)).toContain(app1.id);
            expect(saved.apps.map(a => a.id)).toContain(app2.id);
        });

        it('持久化失败时应回滚内存状态', async () => {
            const store = createStore();
            await store.init();
            const originalApps = store.apps.map(a => a.id);

            vi.spyOn(storageManager, 'setMany').mockRejectedValueOnce(new Error('QuotaExceeded'));

            await expect(
                store.addApp({ name: '失败应用', url: 'https://fail.test', category: 'dev' })
            ).rejects.toThrow();

            expect(store.apps.map(a => a.id)).toEqual(originalApps);
        });
    });

    describe('云同步接口', () => {
        it('syncNow 应将当前状态写入存储', async () => {
            const store = createStore();
            await store.init();
            await store.addApp({ name: '同步应用', url: 'https://sync.test', category: 'dev' });

            const setManySpy = vi.spyOn(storageManager, 'setMany');
            await store.syncNow();

            expect(setManySpy).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    [STORAGE_KEYS.MAIN_DATA]: expect.objectContaining({
                        categories: expect.any(Array),
                        apps: expect.any(Array),
                    }),
                })
            );
        });

        it('applyStorageSnapshot 应应用云端快照', async () => {
            const store = createStore();
            await store.init();

            const cloudData: AppNavigatorData = {
                categories: [defaultAllCategory, { id: 'cloud', name: '云端分类', icon: './image/icons/folder.svg' }],
                apps: [{ id: 'app_cloud', name: '云端应用', url: 'https://cloud.test', category: 'cloud' }],
            };

            const applied = await store.applyStorageSnapshot({
                [STORAGE_KEYS.MAIN_DATA]: cloudData,
            });

            expect(applied).toBe(true);
            expect(store.categories.map(c => c.id)).toContain('cloud');
            expect(store.apps.map(a => a.id)).toContain('app_cloud');
        });

        it('applyStorageSnapshot 不含主数据键时返回 false', async () => {
            const store = createStore();
            await store.init();
            const applied = await store.applyStorageSnapshot({ otherKey: 'value' });
            expect(applied).toBe(false);
        });
    });

    describe('外部存储变更监听', () => {
        it('订阅外部变更后应同步更新 state', async () => {
            const store = createStore();
            await store.init();
            const unsubscribe = store.subscribeToExternalChanges();

            const externalData: AppNavigatorData = {
                categories: [defaultAllCategory, { id: 'external', name: '外部', icon: './image/icons/folder.svg' }],
                apps: [],
            };
            await storageManager.set(STORAGE_KEYS.MAIN_DATA, externalData);

            expect(store.categories.map(c => c.id)).toContain('external');
            unsubscribe();
        });
    });

    describe('图标规范', () => {
        it('默认分类图标应使用系统 SVG，不含 emoji', async () => {
            const store = createStore();
            await store.init();
            const category = await store.addCategory({ name: 'SVG测试' });

            expect(category.icon).toMatch(/^\.?\/image\/icons\/[a-zA-Z0-9_-]+\.svg$/);
            expect(/\p{Emoji}/u.test(category.icon ?? '')).toBe(false);
        });
    });
});
