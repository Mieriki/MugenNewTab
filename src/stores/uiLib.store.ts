/**
 * UI 图标库 Pinia Store
 * 管理系统 UI（来自 public/config/defaultData.json）与用户 UI 的合并，
 * 提供 UI 分类 / 图标的 CRUD，所有变更最终持久化到 StorageManager。
 */

import { defineStore } from 'pinia';
import { ref, computed, toRaw } from 'vue';
import type {
    UiLib,
    UserUiLib,
    UiCategory,
    UiItem,
    UiCategoryInput,
    UiItemInput,
} from '@/types/ui';
import { STORAGE_KEYS } from '@/types/storage';
import { storageManager } from '@/services/storage.service';
import { loadDefaultData } from '@/services/config.service';
import {
    generateUiCategoryId,
    generateUiItemId,
} from '@/utils/id.util';
import { isImageIcon, getSystemIconUrl } from '@/utils/image.util';

const USER_UI_LIB_KEY = STORAGE_KEYS.USER_UI_LIB;
const DATA_UPDATED_AT_KEY = STORAGE_KEYS.DATA_UPDATED_AT;

/** 深拷贝辅助（兼容 Vue reactive proxy） */
function clone<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }
    // 先解包 Vue 代理，避免 structuredClone 无法克隆 Proxy
    const raw = toRaw(value as object);
    // UI 库数据均为 JSON 可序列化的纯对象/数组，JSON 往返足以深拷贝且更兼容测试环境
    return JSON.parse(JSON.stringify(raw)) as T;
}

/** 校验 UiLib 数据结构 */
function isValidUiLib(data: unknown): data is UiLib {
    return Boolean(
        data &&
        typeof data === 'object' &&
        Array.isArray((data as UiLib).categories) &&
        Array.isArray((data as UiLib).items)
    );
}

/** 校验用户 UI 库数据结构 */
function isValidUserUiLib(data: unknown): data is UserUiLib {
    return isValidUiLib(data);
}

/** 校验图标地址：禁止 emoji / data URL，必须为图片或 SVG 路径 */
function validateIconUrl(url: string): void {
    if (!url) {
        return;
    }
    if (url.startsWith('data:')) {
        throw new Error('UI 图标库不支持 data URL');
    }
    if (!isImageIcon(url)) {
        throw new Error('图标地址格式无效，请使用图片 URL 或系统 SVG 路径');
    }
}

/** 获取默认图标（系统 SVG） */
function getDefaultItemIcon(): string {
    return getSystemIconUrl('picture');
}

export const useUiLibStore = defineStore('uiLib', () => {
    // ==================== State ====================
    /** 系统 UI 图标库（来自 defaultData.json，只读） */
    const systemUiLib = ref<UiLib>({ categories: [], items: [] });
    /** 用户 UI 图标库（可持久化） */
    const userUiLib = ref<UserUiLib>({ categories: [], items: [] });
    /** 是否已完成初始化 */
    const initialized = ref(false);
    /** 是否正在加载 */
    const isLoading = ref(false);

    /** 写锁队列，保证并发写操作串行执行 */
    let writeQueue: Promise<unknown> = Promise.resolve();

    // ==================== Getters ====================
    /** 合并后的全部分类（系统在前，用户在后） */
    const categories = computed<UiCategory[]>(() => [
        ...systemUiLib.value.categories,
        ...userUiLib.value.categories,
    ]);

    /** 合并后的全部图标项（系统项标记 isSystem: true） */
    const items = computed<UiItem[]>(() => [
        ...systemUiLib.value.items.map(item => ({ ...item, isSystem: true as const })),
        ...userUiLib.value.items.map(item => ({ ...item, isSystem: false as const })),
    ]);

    /** 合并后的完整 UI 库 */
    const uiLib = computed<UiLib>(() => ({
        categories: categories.value,
        items: items.value,
    }));

    /** 用户分类 ID 集合 */
    const userCategoryIds = computed(() => new Set(userUiLib.value.categories.map(c => c.id)));
    /** 用户图标项 ID 集合 */
    const userItemIds = computed(() => new Set(userUiLib.value.items.map(i => i.id)));

    // ==================== 内部方法 ====================
    /**
     * 写锁封装
     * 所有会修改用户 UI 库的操作必须经此包装，保证顺序执行。
     */
    function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
        const result = writeQueue.then(task, task);
        writeQueue = result.catch(() => undefined);
        return result;
    }

    /**
     * 提交用户 UI 库到持久化存储
     * 写入失败时回滚内存状态。
     */
    async function commitUserUiLib(data: UserUiLib): Promise<void> {
        if (!isValidUserUiLib(data)) {
            throw new TypeError('用户图标库格式无效');
        }
        const previous = userUiLib.value;
        userUiLib.value = clone(data);
        try {
            await storageManager.setMany({
                [USER_UI_LIB_KEY]: toRaw(userUiLib.value),
                [DATA_UPDATED_AT_KEY]: Date.now(),
            });
        } catch (error) {
            userUiLib.value = previous;
            throw error;
        }
    }

    /** 加载系统 UI 库 */
    async function loadSystemUiLib(): Promise<void> {
        const defaultData = await loadDefaultData();
        if (defaultData?.systemUiLib && isValidUiLib(defaultData.systemUiLib)) {
            systemUiLib.value = clone(defaultData.systemUiLib);
        } else {
            systemUiLib.value = { categories: [], items: [] };
        }
    }

    /** 加载用户 UI 库 */
    async function loadUserUiLib(): Promise<void> {
        const saved = await storageManager.get(USER_UI_LIB_KEY);
        if (isValidUserUiLib(saved)) {
            userUiLib.value = clone(saved as UserUiLib);
        } else {
            userUiLib.value = { categories: [], items: [] };
        }
    }

    /** 确保已完成初始化 */
    async function ensureInitialized(): Promise<void> {
        if (!initialized.value) {
            await init();
        }
    }

    /**
     * 在用户 UI 库上执行可变操作
     * 写前重读持久化数据，避免旧缓存覆盖外部更新；失败时回滚。
     */
    async function mutateUserUiLib<T>(mutator: (draft: UserUiLib) => T): Promise<T> {
        await ensureInitialized();
        return withWriteLock(async () => {
            const persisted = await storageManager.get(USER_UI_LIB_KEY);
            const draft = clone(
                isValidUserUiLib(persisted)
                    ? (persisted as UserUiLib)
                    : userUiLib.value
            );
            const result = mutator(draft);
            await commitUserUiLib(draft);
            return clone(result);
        });
    }

    // ==================== Actions ====================
    /** 初始化：加载系统与用户 UI 库 */
    async function init(): Promise<void> {
        if (initialized.value) {
            return;
        }
        isLoading.value = true;
        try {
            await loadSystemUiLib();
            await loadUserUiLib();
            initialized.value = true;
        } finally {
            isLoading.value = false;
        }
    }

    /** 保存用户 UI 库（外部批量写入入口） */
    async function saveUserUiLib(data: UserUiLib): Promise<void> {
        await ensureInitialized();
        return withWriteLock(() => commitUserUiLib(clone(data)));
    }

    /** 重置用户 UI 库为空 */
    async function resetUserUiLib(): Promise<void> {
        await saveUserUiLib({ categories: [], items: [] });
    }

    // ----- 分类 CRUD -----
    /** 添加用户分类 */
    async function addCategory(input: UiCategoryInput): Promise<UiCategory> {
        const name = (input.name || '').trim();
        if (!name) {
            throw new Error('分类名称不能为空');
        }
        return mutateUserUiLib(uiLib => {
            const category: UiCategory = {
                id: generateUiCategoryId(),
                name,
            };
            uiLib.categories.push(category);
            return category;
        });
    }

    /** 更新用户分类 */
    async function updateCategory(
        id: string,
        input: Partial<UiCategoryInput>
    ): Promise<UiCategory | null> {
        if (!userCategoryIds.value.has(id)) {
            return null;
        }
        return mutateUserUiLib(uiLib => {
            const index = uiLib.categories.findIndex(c => c.id === id);
            if (index === -1) {
                return null;
            }
            const name = input.name?.trim();
            if (name !== undefined) {
                if (!name) {
                    throw new Error('分类名称不能为空');
                }
                uiLib.categories[index].name = name;
            }
            return uiLib.categories[index];
        });
    }

    /** 删除用户分类，同时移除该分类下的用户图标 */
    async function deleteCategory(id: string): Promise<boolean> {
        if (systemUiLib.value.categories.some(c => c.id === id)) {
            return false;
        }
        return mutateUserUiLib(uiLib => {
            const before = uiLib.categories.length;
            uiLib.categories = uiLib.categories.filter(c => c.id !== id);
            const deleted = uiLib.categories.length !== before;
            if (deleted) {
                uiLib.items = uiLib.items.filter(item => item.category !== id);
            }
            return deleted;
        });
    }

    /** 更新用户分类顺序（局部排序，未出现的分类保持原有相对顺序放在末尾） */
    async function updateCategoriesOrder(orderedIds: string[]): Promise<void> {
        return mutateUserUiLib(uiLib => {
            const categoriesById = new Map(uiLib.categories.map(c => [c.id, c]));
            const ordered: UiCategory[] = [];
            for (const id of orderedIds) {
                if (categoriesById.has(id)) {
                    ordered.push(categoriesById.get(id)!);
                    categoriesById.delete(id);
                }
            }
            uiLib.categories = [...ordered, ...categoriesById.values()];
        });
    }

    // ----- 图标项 CRUD -----
    /** 添加用户图标 */
    async function addItem(input: UiItemInput): Promise<UiItem> {
        const name = (input.name || '').trim();
        if (!name) {
            throw new Error('图标名称不能为空');
        }
        const url = (input.url || '').trim() || getDefaultItemIcon();
        validateIconUrl(url);
        if (!input.category) {
            throw new Error('请选择图标分类');
        }
        return mutateUserUiLib(uiLib => {
            const item: UiItem = {
                id: generateUiItemId(),
                name,
                url,
                category: input.category,
            };
            uiLib.items.push(item);
            return item;
        });
    }

    /** 更新用户图标 */
    async function updateItem(
        id: string,
        input: Partial<UiItemInput>
    ): Promise<UiItem | null> {
        if (!userItemIds.value.has(id)) {
            return null;
        }
        return mutateUserUiLib(uiLib => {
            const index = uiLib.items.findIndex(i => i.id === id);
            if (index === -1) {
                return null;
            }
            const name = input.name?.trim();
            if (name !== undefined) {
                if (!name) {
                    throw new Error('图标名称不能为空');
                }
                uiLib.items[index].name = name;
            }
            if (input.url !== undefined) {
                const url = (input.url || '').trim() || getDefaultItemIcon();
                validateIconUrl(url);
                uiLib.items[index].url = url;
            }
            if (input.category !== undefined) {
                if (!input.category) {
                    throw new Error('请选择图标分类');
                }
                uiLib.items[index].category = input.category;
            }
            return uiLib.items[index];
        });
    }

    /** 删除用户图标 */
    async function deleteItem(id: string): Promise<boolean> {
        if (systemUiLib.value.items.some(i => i.id === id)) {
            return false;
        }
        return mutateUserUiLib(uiLib => {
            const before = uiLib.items.length;
            uiLib.items = uiLib.items.filter(i => i.id !== id);
            return uiLib.items.length !== before;
        });
    }

    /** 更新用户图标顺序（局部排序） */
    async function updateItemsOrder(orderedIds: string[]): Promise<void> {
        return mutateUserUiLib(uiLib => {
            const itemsById = new Map(uiLib.items.map(i => [i.id, i]));
            const ordered: UiItem[] = [];
            for (const id of orderedIds) {
                if (itemsById.has(id)) {
                    ordered.push(itemsById.get(id)!);
                    itemsById.delete(id);
                }
            }
            uiLib.items = [...ordered, ...itemsById.values()];
        });
    }

    // ==================== 存储变更订阅 ====================
    /** 监听外部存储变更并同步到 store */
    let unsubscribeStorage: (() => void) | null = null;
    function subscribeStorageChanges(): void {
        if (unsubscribeStorage) {
            return;
        }
        unsubscribeStorage = storageManager.subscribe(changes => {
            const uiChange = changes[USER_UI_LIB_KEY];
            if (uiChange && isValidUserUiLib(uiChange.newValue)) {
                const next = clone(uiChange.newValue as UserUiLib);
                if (JSON.stringify(userUiLib.value) !== JSON.stringify(next)) {
                    userUiLib.value = next;
                }
            }
        });
    }
    subscribeStorageChanges();

    return {
        // State
        systemUiLib,
        userUiLib,
        initialized,
        isLoading,
        // Getters
        categories,
        items,
        uiLib,
        userCategoryIds,
        userItemIds,
        // Actions
        init,
        loadSystemUiLib,
        loadUserUiLib,
        saveUserUiLib,
        resetUserUiLib,
        addCategory,
        updateCategory,
        deleteCategory,
        updateCategoriesOrder,
        addItem,
        updateItem,
        deleteItem,
        updateItemsOrder,
    };
});
