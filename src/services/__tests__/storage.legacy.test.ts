/**
 * 原 tests/storage.test.js 的 Vitest 迁移版
 * 保留旧版 DataManager 的 5 个核心契约，针对 Vue3 + Pinia 新架构中的
 * appDataStore 与 StorageManager 进行回归验证。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppDataStore } from '@/stores/appData.store';
import { BrowserAPI } from '@/services/browserApi.service';
import { storageManager } from '@/services/storage.service';
import { loadDefaultData } from '@/services/config.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { AppNavigatorData } from '@/types/app';

vi.mock('@/services/config.service', () => ({
    loadDefaultData: vi.fn(),
    clearConfigCache: vi.fn(),
}));

const mockedLoadDefaultData = vi.mocked(loadDefaultData);

function createStore() {
    setActivePinia(createPinia());
    return useAppDataStore();
}

function readBackend(): AppNavigatorData {
    const raw = localStorage.getItem(STORAGE_KEYS.MAIN_DATA);
    return raw ? (JSON.parse(raw) as AppNavigatorData) : { categories: [], apps: [] };
}

function setBackend(data: AppNavigatorData) {
    localStorage.setItem(STORAGE_KEYS.MAIN_DATA, JSON.stringify(data));
}

beforeEach(() => {
    localStorage.clear();
    delete (window as unknown as { chrome?: unknown }).chrome;
    delete (window as unknown as { browser?: unknown }).browser;
    BrowserAPI.resetDetection();

    mockedLoadDefaultData.mockReset();
    mockedLoadDefaultData.mockResolvedValue({
        appNavigator: {
            categories: [{ id: 'cat_default', name: '默认', icon: './image/icons/folder.svg' }],
            apps: [],
        },
        systemUiLib: { categories: [], items: [] },
        userUiLib: { categories: [], items: [] },
    });
});

describe('storage 旧版核心契约回归', () => {
    it('写操作返回前已经持久化', async () => {
        const store = createStore();
        await store.init();

        const app = await store.addApp({
            name: '示例',
            url: 'https://example.com',
            category: 'cat_default',
        });

        const backend = readBackend();
        expect(backend.apps).toHaveLength(1);
        expect(backend.apps[0].id).toBe(app.id);
    });

    it('修改前重新读取最新快照，避免旧缓存覆盖外部更新', async () => {
        const store = createStore();
        await store.init();

        const backend = readBackend();
        backend.apps.push({
            id: 'app_from_popup',
            name: 'Popup 添加',
            url: 'https://popup.example',
            category: 'cat_default',
        });
        setBackend(backend);

        await store.addApp({
            name: '主页面添加',
            url: 'https://main.example',
            category: 'cat_default',
        });

        const saved = readBackend();
        expect(saved.apps.map((app) => app.name)).toEqual(['Popup 添加', '主页面添加']);
    });

    it('存储失败会拒绝操作并回滚内存缓存', async () => {
        const store = createStore();
        await store.init();
        const originalAppCount = store.apps.length;

        const originalSetItem = localStorage.setItem.bind(localStorage);
        const setItemSpy = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(function (this: Storage, key: string, value: string) {
                if (key === STORAGE_KEYS.MAIN_DATA) {
                    throw new Error('quota exceeded');
                }
                return originalSetItem.call(this, key, value);
            });

        try {
            await expect(
                store.addApp({
                    name: '不会保存',
                    url: 'https://failed.example',
                    category: 'cat_default',
                })
            ).rejects.toThrow(/数据未保存/);

            expect(store.apps).toHaveLength(originalAppCount);
            expect(readBackend().apps).toHaveLength(originalAppCount);
        } finally {
            setItemSpy.mockRestore();
        }
    });

    it('分类局部排序不会删除未出现在排序列表中的分类', async () => {
        const store = createStore();
        await store.init();

        const extra = await store.addCategory({ name: '额外分类', icon: './image/icons/folder.svg' });
        await store.updateCategoriesOrder(['cat_default']);

        const saved = readBackend();
        expect(saved.categories.map((category) => category.id)).toEqual([
            'all',
            'cat_default',
            extra.id,
        ]);
    });

    it('旧数据缺少全部应用分类时会无损补齐', async () => {
        setBackend({
            categories: [{ id: 'cat_legacy', name: '旧分类', icon: './image/icons/folder.svg' }],
            apps: [
                {
                    id: 'app_legacy',
                    name: '旧网站',
                    url: 'https://legacy.example',
                    category: 'cat_legacy',
                },
            ],
        });
        localStorage.setItem(STORAGE_KEYS.USER_UI_LIB, JSON.stringify({ categories: [], items: [] }));

        const store = createStore();
        await store.init();

        const saved = readBackend();
        expect(saved.categories.map((category) => category.id)).toEqual(['all', 'cat_legacy']);
        expect(saved.apps[0].id).toBe('app_legacy');
        expect(store.allCategory).toBeDefined();
    });
});

describe('storage 迁移元数据', () => {
    it('StorageManager 单例与导出常量应保持原项目键名', () => {
        expect(storageManager).toBeDefined();
        expect(STORAGE_KEYS.MAIN_DATA).toBe('appNavigator_data');
        expect(STORAGE_KEYS.USER_UI_LIB).toBe('appNavigator_user_uiLib');
        expect(STORAGE_KEYS.DATA_UPDATED_AT).toBe('appNavigator_dataUpdatedAt');
    });
});
