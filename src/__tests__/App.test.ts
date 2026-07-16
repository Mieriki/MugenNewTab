import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import App from '@/App.vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import Sidebar from '@/components/layout/Sidebar.vue';
import MainContent from '@/components/layout/MainContent.vue';
import FabMenu from '@/components/layout/FabMenu.vue';
import SearchModal from '@/components/search/SearchModal.vue';
import AppEditModal from '@/components/appForm/AppEditModal.vue';
import CategoryEditModal from '@/components/category/CategoryEditModal.vue';
import { useDataManager } from '@/composables/useDataManager';
import { useTheme } from '@/composables/useTheme';
import { useConfirm, provideConfirm } from '@/composables/useConfirm';
import { useToast } from '@/composables/useToast';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS, type StorageValue, type StorageChangeListener } from '@/types/storage';

vi.mock('@/composables/useDataManager');
vi.mock('@/composables/useTheme');
vi.mock('@/composables/useConfirm');
vi.mock('@/composables/useToast');
vi.mock('@/services/storage.service');

const mockCategories = [
    { id: 'all', name: '全部应用', icon: './image/icons/menu.svg', monochrome: true },
    { id: 'dev', name: '开发工具', icon: './image/icons/code.svg', monochrome: true },
    { id: 'media', name: '娱乐媒体', icon: './image/icons/heart.svg', monochrome: true },
];

const mockApps = [
    { id: 'app_1', name: 'GitHub', url: 'https://github.com', category: 'dev', hidden: false },
    { id: 'app_2', name: 'Bilibili', url: 'https://www.bilibili.com', category: 'media', hidden: false },
    { id: 'app_3', name: 'Secret', url: 'https://example.com', category: 'dev', hidden: true },
];

function createMockDataManager() {
    const categories = ref(mockCategories);
    const apps = ref(mockApps);
    const visibleApps = computed(() => apps.value.filter((app) => !app.hidden));
    const hiddenApps = computed(() => apps.value.filter((app) => app.hidden));
    const userCategories = computed(() => categories.value.filter((c) => c.id !== 'all'));
    const initialized = ref(true);
    const isLoading = ref(false);

    return {
        categories,
        apps,
        visibleApps,
        hiddenApps,
        userCategories,
        allCategory: computed(() => categories.value.find((c) => c.id === 'all')),
        initialized,
        isLoading,
        init: vi.fn(),
        addApp: vi.fn(async (app) => ({ ...app, id: 'app_new' })),
        updateApp: vi.fn(),
        deleteApp: vi.fn(async () => true),
        updateAppsOrder: vi.fn(async () => undefined),
        addCategory: vi.fn(async (input) => ({ ...input, id: 'cat_new', icon: './image/icons/folder.svg' })),
        updateCategory: vi.fn(),
        deleteCategory: vi.fn(),
        updateCategoriesOrder: vi.fn(async () => undefined),
        exportData: vi.fn(async () => ({
            data: { categories: categories.value, apps: apps.value },
            userUiLib: { categories: [], items: [] },
            exportTime: new Date().toISOString(),
            version: '2.0',
        })),
        importData: vi.fn(async () => undefined),
        resetToDefault: vi.fn(),
        getAppsByCategory: (categoryId: string) =>
            apps.value.filter((app) => app.category === categoryId && !app.hidden),
        getCategoryById: (id: string) => categories.value.find((c) => c.id === id),
    };
}

function createMockTheme() {
    return {
        themes: computed(() => []),
        currentTheme: computed(() => undefined),
        selectedThemeId: computed(() => null),
        defaultThemeId: computed(() => 'material-rose'),
        isDark: computed(() => false),
        isReady: computed(() => true),
        isInitializing: ref(false),
        initError: ref(null),
        isFollowingSystem: computed(() => false),
        systemPrefersDark: computed(() => false),
        themeOptions: computed(() => []),
        availableThemeIds: computed(() => []),
        storeError: computed(() => null),
        initialize: vi.fn(async () => undefined),
        setTheme: vi.fn(),
        followSystemTheme: vi.fn(),
        toggleFollowSystem: vi.fn(),
        cycleTheme: vi.fn(),
        nextTheme: vi.fn(),
        previousTheme: vi.fn(),
        refreshThemes: vi.fn(),
        resolveDefaultThemeId: vi.fn(() => 'material-rose'),
    };
}

function createMockConfirm() {
    return {
        requests: ref([]),
        confirm: vi.fn(async () => true),
        prompt: vi.fn(async () => null),
        resolve: vi.fn(),
        cancel: vi.fn(),
        updateValue: vi.fn(),
        closeAll: vi.fn(),
    };
}

function createMockToast() {
    return {
        toasts: { value: [] },
        count: computed(() => 0),
        show: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
        dismiss: vi.fn(),
        dismissAll: vi.fn(),
        getIconPath: vi.fn(),
        createIconSvg: vi.fn(),
    };
}

function createMockStorage() {
    const store: Record<string, StorageValue> = {};
    return {
        get: vi.fn(async (key: string): Promise<StorageValue | null> => store[key] ?? null),
        set: vi.fn(async (key: string, value: StorageValue): Promise<void> => {
            store[key] = value;
        }),
        setMany: vi.fn(async (items: Record<string, StorageValue>): Promise<void> => {
            Object.assign(store, items);
        }),
        remove: vi.fn(),
        subscribe: vi.fn((_listener: StorageChangeListener) => vi.fn()),
    };
}

let mockStorage: ReturnType<typeof createMockStorage>;

describe('App.vue', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setActivePinia(createPinia());
        mockStorage = createMockStorage();
        vi.mocked(useDataManager).mockReturnValue(createMockDataManager() as unknown as ReturnType<typeof useDataManager>);
        vi.mocked(useTheme).mockReturnValue(createMockTheme() as unknown as ReturnType<typeof useTheme>);
        vi.mocked(useConfirm).mockReturnValue(createMockConfirm() as unknown as ReturnType<typeof useConfirm>);
        vi.mocked(provideConfirm).mockReturnValue(createMockConfirm() as unknown as ReturnType<typeof provideConfirm>);
        vi.mocked(useToast).mockReturnValue(createMockToast() as unknown as ReturnType<typeof useToast>);
        vi.spyOn(storageManager, 'get').mockImplementation(mockStorage.get);
        vi.spyOn(storageManager, 'set').mockImplementation(mockStorage.set);
        vi.spyOn(storageManager, 'setMany').mockImplementation(mockStorage.setMany);
        vi.spyOn(storageManager, 'subscribe').mockImplementation(mockStorage.subscribe);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    function mountApp() {
        return mount(App, {
            attachTo: document.body,
            global: {
                stubs: {
                    Teleport: true,
                },
            },
        });
    }

    it('渲染应用根结构', async () => {
        const wrapper = mountApp();
        await flushPromises();

        expect(wrapper.find('.app-root').exists()).toBe(true);
        expect(wrapper.findComponent(AppHeader).exists()).toBe(true);
        expect(wrapper.findComponent(Sidebar).exists()).toBe(true);
        expect(wrapper.findComponent(MainContent).exists()).toBe(true);
    });

    it('默认选中"全部应用"分类', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const sidebar = wrapper.findComponent(Sidebar);
        expect(sidebar.props('activeCategoryId')).toBe('all');
        expect(wrapper.find('.content-title').text()).toBe('全部应用');
    });

    it('点击分类切换当前分类', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const sidebar = wrapper.findComponent(Sidebar);
        await sidebar.vm.$emit('select-category', 'dev');
        await flushPromises();

        expect(sidebar.props('activeCategoryId')).toBe('dev');
        expect(wrapper.find('.content-title').text()).toBe('开发工具');
    });

    it('点击顶部栏折叠按钮切换侧边栏状态', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const header = wrapper.findComponent(AppHeader);
        await header.vm.$emit('toggle-sidebar');
        await flushPromises();

        expect(header.props('sidebarCollapsed')).toBe(true);
        expect(mockStorage.set).toHaveBeenCalledWith(STORAGE_KEYS.SIDEBAR_COLLAPSED, true);
    });

    it('点击搜索入口打开搜索模态框', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const sidebar = wrapper.findComponent(Sidebar);
        await sidebar.vm.$emit('open-search');
        await flushPromises();

        expect(wrapper.findComponent(SearchModal).props('modelValue')).toBe(true);
    });

    it('点击"显示已隐藏站点"切换隐藏视图', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const hiddenToggle = wrapper.find('.hidden-apps-toggle');
        expect(hiddenToggle.exists()).toBe(true);

        await hiddenToggle.trigger('click');
        await flushPromises();

        expect(wrapper.find('.content-title').text()).toBe('已隐藏的站点');
        expect(mockStorage.set).toHaveBeenCalledWith(STORAGE_KEYS.SHOW_HIDDEN_APPS, true);
    });

    it('双击 Logo 切换隐藏站点视图', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const header = wrapper.findComponent(AppHeader);
        const brand = header.find('.brand');
        expect(brand.exists()).toBe(true);

        await brand.trigger('dblclick');
        await flushPromises();

        expect(wrapper.find('.content-title').text()).toBe('已隐藏的站点');
    });

    it('分类排序改变时调用 updateCategoriesOrder', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const dataManagerMock = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        const sidebar = wrapper.findComponent(Sidebar);
        await sidebar.vm.$emit('order-change', ['media', 'dev']);
        await flushPromises();

        expect(dataManagerMock.updateCategoriesOrder).toHaveBeenCalledWith(['media', 'dev']);
    });

    it('FAB 菜单点击"添加网站"打开应用编辑模态框', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const fab = wrapper.findComponent(FabMenu);
        await fab.vm.$emit('select', 'add-app');
        await flushPromises();

        const modal = wrapper.findComponent(AppEditModal);
        expect(modal.props('modelValue')).toBe(true);
        expect(modal.props('app')).toBeNull();
    });

    it('FAB 菜单点击"添加分类"打开分类编辑模态框', async () => {
        const wrapper = mountApp();
        await flushPromises();

        const fab = wrapper.findComponent(FabMenu);
        await fab.vm.$emit('select', 'add-category');
        await flushPromises();

        const modal = wrapper.findComponent(CategoryEditModal);
        expect(modal.props('modelValue')).toBe(true);
        expect(modal.props('category')).toBeUndefined();
    });

    it('点击应用卡片在新标签页打开链接', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const wrapper = mountApp();
        await flushPromises();

        // 默认 all 分类会渲染 CategorySection，等待 DOM 更新
        await nextTick();
        const cards = wrapper.findAll('.app-card');
        expect(cards.length).toBeGreaterThan(0);

        await cards[0].trigger('click');
        expect(openSpy).toHaveBeenCalledWith('https://github.com', '_blank');

        openSpy.mockRestore();
    });
});
