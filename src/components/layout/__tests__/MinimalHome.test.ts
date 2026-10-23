import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { computed, nextTick, ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import MinimalHome from '../MinimalHome.vue';
import MinimalSiteMenu from '../MinimalSiteMenu.vue';
import { useDataManager } from '@/composables/useDataManager';
import { useSearch } from '@/composables/useSearch';
import { useToast } from '@/composables/useToast';
import { useLayoutStore } from '@/stores/layout.store';
import type { AppItem, Category } from '@/types/app';

vi.mock('@/composables/useDataManager');
vi.mock('@/composables/useSearch');
vi.mock('@/composables/useToast');

const categories: Category[] = [
    { id: 'all', name: '全部应用' },
    { id: 'dev', name: '开发工具' },
    { id: 'media', name: '娱乐媒体' },
];

const baseApps: AppItem[] = [
    { id: 'a1', name: 'GitHub', url: 'https://github.com', category: 'dev' },
    { id: 'a2', name: 'Bilibili', url: 'https://www.bilibili.com', category: 'media' },
    { id: 'a3', name: 'MDN', url: 'https://developer.mozilla.org', category: 'dev', hidden: true },
];

function setupMocks(apps: AppItem[] = baseApps) {
    const appsRef = ref(apps);
    const isLoading = ref(false);

    const updateApp = vi.fn(async () => null);
    const updateAppsOrder = vi.fn(async () => undefined);

    const dataManager = {
        apps: computed(() => appsRef.value),
        categories: computed(() => categories),
        userCategories: computed(() => categories.filter((item) => item.id !== 'all')),
        isLoading,
        getAppsByCategory: (categoryId: string) =>
            appsRef.value.filter((app) => app.category === categoryId),
        getCategoryById: (id: string) => categories.find((item) => item.id === id),
        updateApp,
        updateAppsOrder,
    };

    vi.mocked(useDataManager).mockReturnValue(
        dataManager as unknown as ReturnType<typeof useDataManager>
    );

    vi.mocked(useSearch).mockReturnValue({
        query: ref(''),
        engines: ref([]),
        currentEngineIndex: ref(0),
        currentEngine: computed(() => undefined),
        suggestions: ref([]),
        activeSuggestionIndex: ref(-1),
        isLoadingSuggestions: ref(false),
        canSearch: computed(() => false),
        hasSuggestions: computed(() => false),
        executeSearch: vi.fn(async () => undefined),
        executeSearchWithSuggestion: vi.fn(async () => undefined),
        clearSuggestions: vi.fn(),
        moveSuggestionDown: vi.fn(),
        moveSuggestionUp: vi.fn(),
        selectActiveSuggestion: vi.fn(),
        selectEngine: vi.fn(async () => undefined),
    } as unknown as ReturnType<typeof useSearch>);

    const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn() };
    vi.mocked(useToast).mockReturnValue(toast as unknown as ReturnType<typeof useToast>);

    return { updateApp, updateAppsOrder, toast };
}

function mountHome(props: Record<string, unknown> = {}) {
    return mount(MinimalHome, { props, attachTo: document.body });
}

function findMenuItem(wrapper: ReturnType<typeof mountHome>, label: string) {
    return wrapper
        .findAll('.site-menu__item')
        .find((item) => item.text().includes(label));
}

describe('MinimalHome 站点操作', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        // MinimalHome 直接读 layout store 的 openMode 决定跳转方式
        setActivePinia(createPinia());
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('默认不渲染隐藏站点，开启揭示后渲染并标记 is-hidden', async () => {
        setupMocks();
        const wrapper = mountHome();

        expect(wrapper.findAll('.minimal-tile')).toHaveLength(2);
        expect(wrapper.text()).not.toContain('MDN');

        await wrapper.setProps({ showHidden: true });
        await nextTick();

        const tiles = wrapper.findAll('.minimal-tile');
        expect(tiles).toHaveLength(3);
        expect(tiles[2].classes()).toContain('is-hidden');

        wrapper.unmount();
    });

    it('当前分类站点全部隐藏时提示可显示', () => {
        setupMocks([{ id: 'h1', name: '隐藏站', url: 'https://hidden.com', category: 'dev', hidden: true }]);
        const wrapper = mountHome();

        expect(wrapper.find('.minimal-hint').text()).toContain('都已隐藏');
        expect(wrapper.find('.minimal-hint__link').text()).toBe('显示它们');

        wrapper.unmount();
    });

    it('右键磁贴打开操作菜单', async () => {
        setupMocks();
        const wrapper = mountHome();

        expect(wrapper.findComponent(MinimalSiteMenu).exists()).toBe(false);

        await wrapper.findAll('.minimal-tile')[0].trigger('contextmenu');
        await nextTick();

        const menu = wrapper.findComponent(MinimalSiteMenu);
        expect(menu.exists()).toBe(true);
        expect(menu.props('app')).toMatchObject({ id: 'a1' });

        wrapper.unmount();
    });

    it('菜单「隐藏此站点」写入 hidden 并提示', async () => {
        const { updateApp, toast } = setupMocks();
        const wrapper = mountHome();

        await wrapper.findAll('.minimal-tile')[0].trigger('contextmenu');
        await nextTick();
        await findMenuItem(wrapper, '隐藏此站点')!.trigger('click');
        await flushPromises();

        expect(updateApp).toHaveBeenCalledWith('a1', { hidden: true });
        expect(toast.success).toHaveBeenCalledWith('已隐藏「GitHub」');
        expect(wrapper.findComponent(MinimalSiteMenu).exists()).toBe(false);

        wrapper.unmount();
    });

    it('菜单「移动到分类」按分类写入', async () => {
        const { updateApp, toast } = setupMocks();
        const wrapper = mountHome();

        await wrapper.findAll('.minimal-tile')[0].trigger('contextmenu');
        await nextTick();

        await findMenuItem(wrapper, '移动到分类')!.trigger('click');
        const target = wrapper
            .findAll('.site-menu__item--sub')
            .find((item) => item.text().includes('娱乐媒体'))!;
        await target.trigger('click');
        await flushPromises();

        expect(updateApp).toHaveBeenCalledWith('a1', { category: 'media' });
        expect(toast.success).toHaveBeenCalledWith('已移动到「娱乐媒体」');

        wrapper.unmount();
    });

    it('菜单「删除」交给外层处理', async () => {
        setupMocks();
        const wrapper = mountHome();

        await wrapper.findAll('.minimal-tile')[0].trigger('contextmenu');
        await nextTick();
        await findMenuItem(wrapper, '删除')!.trigger('click');
        await flushPromises();

        const emitted = wrapper.emitted('delete-app');
        expect(emitted).toHaveLength(1);
        expect(emitted![0][0]).toMatchObject({ id: 'a1' });

        wrapper.unmount();
    });

    it('菜单「编辑」触发 edit-app', async () => {
        setupMocks();
        const wrapper = mountHome();

        await wrapper.findAll('.minimal-tile')[1].trigger('contextmenu');
        await nextTick();
        await findMenuItem(wrapper, '编辑')!.trigger('click');
        await flushPromises();

        expect(wrapper.emitted('edit-app')?.[0][0]).toMatchObject({ id: 'a2' });

        wrapper.unmount();
    });

    it('点击磁贴在新标签页打开站点', async () => {
        setupMocks();
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const wrapper = mountHome();

        await wrapper.findAll('.minimal-tile')[0].trigger('click');

        expect(openSpy).toHaveBeenCalledWith('https://github.com', '_blank');

        wrapper.unmount();
    });

    it('点击磁贴时按 openMode=current-tab 覆盖当前标签页', async () => {
        setupMocks();
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const assignSpy = vi.fn();
        vi.stubGlobal('location', { ...window.location, assign: assignSpy });

        const layoutStore = useLayoutStore();
        layoutStore.openMode = 'current-tab';

        const wrapper = mountHome();
        await wrapper.findAll('.minimal-tile')[0].trigger('click');

        expect(assignSpy).toHaveBeenCalledWith('https://github.com');
        expect(openSpy).not.toHaveBeenCalled();

        wrapper.unmount();
        vi.unstubAllGlobals();
    });

    it('控制区揭示按钮请求切换隐藏站点', async () => {
        setupMocks();
        const wrapper = mountHome();

        const revealBtn = wrapper
            .findAll('.minimal-controls__btn')
            .find((btn) => (btn.attributes('title') ?? '').includes('显示隐藏站点'))!;
        expect(revealBtn).toBeTruthy();

        await revealBtn.trigger('click');
        expect(wrapper.emitted('toggle-hidden-reveal')).toHaveLength(1);

        wrapper.unmount();
    });

    it('拖拽磁贴后按新顺序提交', async () => {
        const { updateAppsOrder, toast } = setupMocks();
        const wrapper = mountHome();
        const tiles = wrapper.findAll('.minimal-tile');

        await tiles[0].trigger('dragstart', {
            dataTransfer: { effectAllowed: '', setData: vi.fn() },
        });
        await tiles[1].trigger('dragover');
        await tiles[1].trigger('drop');
        await flushPromises();

        // GitHub 拖到 Bilibili 之前的位置：原本 a1 已在 a2 前面，顺序不变
        expect(updateAppsOrder).not.toHaveBeenCalled();

        await tiles[1].trigger('dragstart', {
            dataTransfer: { effectAllowed: '', setData: vi.fn() },
        });
        await tiles[0].trigger('dragover');
        await tiles[0].trigger('drop');
        await flushPromises();

        expect(updateAppsOrder).toHaveBeenCalledWith(['a2', 'a1', 'a3']);
        expect(toast.success).toHaveBeenCalledWith('排序已保存');

        wrapper.unmount();
    });
});
