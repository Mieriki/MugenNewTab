/**
 * useDataManager
 * 封装 appDataStore 与 uiLibStore 的常用数据操作，
 * 为页面/组件提供统一、清晰的初始化、CRUD、排序、导入导出入口。
 */

import { computed, onMounted, onUnmounted, type ComputedRef } from 'vue';
import { useAppDataStore } from '@/stores/appData.store';
import { useUiLibStore } from '@/stores/uiLib.store';
import type { AppItem, AppInput, Category, CategoryInput, AppNavigatorData } from '@/types/app';
import type { UiItem, UiCategory, UiItemInput, UiCategoryInput } from '@/types/ui';
import type { BackupData } from '@/types/storage';

export interface UseDataManagerOptions {
    /** 是否在 onMounted 时自动初始化，默认为 true */
    autoInit?: boolean;
}

export interface UseDataManagerReturn {
    // 加载与状态
    isLoading: ComputedRef<boolean>;
    initialized: ComputedRef<boolean>;
    error: ComputedRef<string | null>;

    // 应用数据
    appData: ComputedRef<AppNavigatorData>;
    categories: ComputedRef<Category[]>;
    apps: ComputedRef<AppItem[]>;
    visibleApps: ComputedRef<AppItem[]>;
    hiddenApps: ComputedRef<AppItem[]>;
    userCategories: ComputedRef<Category[]>;
    allCategory: ComputedRef<Category | undefined>;

    // UI 图标库数据
    uiLib: ComputedRef<{ categories: UiCategory[]; items: UiItem[] }>;
    uiCategories: ComputedRef<UiCategory[]>;
    uiItems: ComputedRef<UiItem[]>;
    systemUiLib: ComputedRef<{ categories: UiCategory[]; items: UiItem[] }>;
    userUiLib: ComputedRef<{ categories: UiCategory[]; items: Array<Omit<UiItem, 'isSystem'>> }>;

    // 初始化与同步
    init: () => Promise<void>;
    syncNow: () => Promise<void>;

    // 应用 CRUD
    addApp: (app: AppInput) => Promise<AppItem>;
    updateApp: (id: string, updates: Partial<Omit<AppItem, 'id'>>) => Promise<AppItem | null>;
    deleteApp: (id: string) => Promise<boolean>;
    updateAppsOrder: (orderedIds: string[]) => Promise<void>;

    // 分类 CRUD
    addCategory: (category: CategoryInput) => Promise<Category>;
    updateCategory: (id: string, updates: Partial<Omit<Category, 'id'>>) => Promise<Category | null>;
    deleteCategory: (id: string) => Promise<boolean>;
    updateCategoriesOrder: (orderedIds: string[]) => Promise<void>;

    // UI 分类 CRUD
    addUiCategory: (input: UiCategoryInput) => Promise<UiCategory>;
    updateUiCategory: (id: string, input: Partial<UiCategoryInput>) => Promise<UiCategory | null>;
    deleteUiCategory: (id: string) => Promise<boolean>;
    updateUiCategoriesOrder: (orderedIds: string[]) => Promise<void>;

    // UI 图标 CRUD
    addUiItem: (input: UiItemInput) => Promise<UiItem>;
    updateUiItem: (id: string, input: Partial<UiItemInput>) => Promise<UiItem | null>;
    deleteUiItem: (id: string) => Promise<boolean>;
    updateUiItemsOrder: (orderedIds: string[]) => Promise<void>;

    // 导入导出与重置
    exportData: () => Promise<BackupData>;
    importData: (backup: BackupData) => Promise<void>;
    resetToDefault: () => Promise<void>;

    // 查询辅助
    getAppsByCategory: (categoryId: string) => AppItem[];
    getCategoryById: (id: string) => Category | undefined;
}

/**
 * 创建 DataManager composable
 * @param options 配置项
 */
export function useDataManager(options: UseDataManagerOptions = {}): UseDataManagerReturn {
    const { autoInit = true } = options;

    const appDataStore = useAppDataStore();
    const uiLibStore = useUiLibStore();

    // ==================== 响应式状态 ====================
    const isLoading = computed(() => appDataStore.isLoading || uiLibStore.isLoading);
    const initialized = computed(() => appDataStore.initialized && uiLibStore.initialized);
    const error = computed(() => appDataStore.error);

    const appData = computed(() => appDataStore.data);
    const categories = computed(() => appDataStore.categories);
    const apps = computed(() => appDataStore.apps);
    const visibleApps = computed(() => appDataStore.visibleApps);
    const hiddenApps = computed(() => appDataStore.hiddenApps);
    const userCategories = computed(() => appDataStore.userCategories);
    const allCategory = computed(() => appDataStore.allCategory);

    const uiLib = computed(() => uiLibStore.uiLib);
    const uiCategories = computed(() => uiLibStore.categories);
    const uiItems = computed(() => uiLibStore.items);
    const systemUiLib = computed(() => uiLibStore.systemUiLib);
    const userUiLib = computed(() => uiLibStore.userUiLib);

    // ==================== 初始化控制 ====================
    let initAbortController: AbortController | null = null;
    let initPromise: Promise<void> | null = null;

    /**
     * 初始化两个 store。
     * 重复调用会返回同一 Promise；组件卸载时若仍在初始化，结果会被丢弃。
     */
    function init(): Promise<void> {
        if (initPromise) {
            return initPromise;
        }

        initAbortController?.abort();
        initAbortController = new AbortController();
        const signal = initAbortController.signal;

        initPromise = (async () => {
            await Promise.all([appDataStore.init(), uiLibStore.init()]);
            if (signal.aborted) {
                // 初始化过程中组件已卸载，丢弃结果，避免未处理的 rejection
                return;
            }
        })();

        initPromise.finally(() => {
            if (initAbortController?.signal === signal) {
                initAbortController = null;
                initPromise = null;
            }
        });

        return initPromise;
    }

    // ==================== 外部变更订阅 ====================
    // uiLibStore 在创建时自动订阅；appDataStore 需要显式订阅以保持同步。
    let unsubscribeExternalChanges: (() => void) | null = null;

    function startExternalChangeSubscription(): void {
        if (unsubscribeExternalChanges) return;
        unsubscribeExternalChanges = appDataStore.subscribeToExternalChanges();
    }

    function stopExternalChangeSubscription(): void {
        unsubscribeExternalChanges?.();
        unsubscribeExternalChanges = null;
    }

    // ==================== 生命周期 ====================
    onMounted(() => {
        startExternalChangeSubscription();
        if (autoInit && !initialized.value) {
            init().catch((e) => {
                // 自动初始化失败或已取消，静默处理避免未捕获异常
                console.error('useDataManager 自动初始化失败:', e);
            });
        }
    });

    onUnmounted(() => {
        initAbortController?.abort();
        stopExternalChangeSubscription();
    });

    // ==================== 应用 CRUD 代理 ====================
    function addApp(app: AppInput): Promise<AppItem> {
        return appDataStore.addApp(app);
    }

    function updateApp(id: string, updates: Partial<Omit<AppItem, 'id'>>): Promise<AppItem | null> {
        return appDataStore.updateApp(id, updates);
    }

    function deleteApp(id: string): Promise<boolean> {
        return appDataStore.deleteApp(id);
    }

    function updateAppsOrder(orderedIds: string[]): Promise<void> {
        return appDataStore.updateAppsOrder(orderedIds);
    }

    // ==================== 分类 CRUD 代理 ====================
    function addCategory(category: CategoryInput): Promise<Category> {
        return appDataStore.addCategory(category);
    }

    function updateCategory(id: string, updates: Partial<Omit<Category, 'id'>>): Promise<Category | null> {
        return appDataStore.updateCategory(id, updates);
    }

    function deleteCategory(id: string): Promise<boolean> {
        return appDataStore.deleteCategory(id);
    }

    function updateCategoriesOrder(orderedIds: string[]): Promise<void> {
        return appDataStore.updateCategoriesOrder(orderedIds);
    }

    // ==================== UI 分类 CRUD 代理 ====================
    function addUiCategory(input: UiCategoryInput): Promise<UiCategory> {
        return uiLibStore.addCategory(input);
    }

    function updateUiCategory(id: string, input: Partial<UiCategoryInput>): Promise<UiCategory | null> {
        return uiLibStore.updateCategory(id, input);
    }

    function deleteUiCategory(id: string): Promise<boolean> {
        return uiLibStore.deleteCategory(id);
    }

    function updateUiCategoriesOrder(orderedIds: string[]): Promise<void> {
        return uiLibStore.updateCategoriesOrder(orderedIds);
    }

    // ==================== UI 图标 CRUD 代理 ====================
    function addUiItem(input: UiItemInput): Promise<UiItem> {
        return uiLibStore.addItem(input);
    }

    function updateUiItem(id: string, input: Partial<UiItemInput>): Promise<UiItem | null> {
        return uiLibStore.updateItem(id, input);
    }

    function deleteUiItem(id: string): Promise<boolean> {
        return uiLibStore.deleteItem(id);
    }

    function updateUiItemsOrder(orderedIds: string[]): Promise<void> {
        return uiLibStore.updateItemsOrder(orderedIds);
    }

    // ==================== 导入导出与重置 ====================
    function syncNow(): Promise<void> {
        return appDataStore.syncNow();
    }

    function exportData(): Promise<BackupData> {
        return appDataStore.exportData();
    }

    function importData(backup: BackupData): Promise<void> {
        return appDataStore.importData(backup);
    }

    async function resetToDefault(): Promise<void> {
        await appDataStore.resetToDefault();
        // 重新初始化 uiLibStore，使系统图标库与用户图标库状态与默认值保持一致
        await uiLibStore.init();
    }

    // ==================== 查询辅助 ====================
    function getAppsByCategory(categoryId: string): AppItem[] {
        return appDataStore.getAppsByCategory(categoryId);
    }

    function getCategoryById(id: string): Category | undefined {
        return appDataStore.getCategoryById(id);
    }

    return {
        // 状态
        isLoading,
        initialized,
        error,

        // 应用数据
        appData,
        categories,
        apps,
        visibleApps,
        hiddenApps,
        userCategories,
        allCategory,

        // UI 图标库数据
        uiLib,
        uiCategories,
        uiItems,
        systemUiLib,
        userUiLib,

        // 初始化与同步
        init,
        syncNow,

        // 应用 CRUD
        addApp,
        updateApp,
        deleteApp,
        updateAppsOrder,

        // 分类 CRUD
        addCategory,
        updateCategory,
        deleteCategory,
        updateCategoriesOrder,

        // UI 分类 CRUD
        addUiCategory,
        updateUiCategory,
        deleteUiCategory,
        updateUiCategoriesOrder,

        // UI 图标 CRUD
        addUiItem,
        updateUiItem,
        deleteUiItem,
        updateUiItemsOrder,

        // 导入导出与重置
        exportData,
        importData,
        resetToDefault,

        // 查询辅助
        getAppsByCategory,
        getCategoryById,
    };
}

export default useDataManager;
