import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PopupApp from '@/PopupApp.vue';
import { useDataManager } from '@/composables/useDataManager';
import { useCurrentTab } from '@/composables/useCurrentTab';
import { useToast } from '@/composables/useToast';
import { browserApi } from '@/services/browserApi.service';

vi.mock('@/composables/useDataManager');
vi.mock('@/composables/useCurrentTab');
vi.mock('@/composables/useToast');
vi.mock('@/services/browserApi.service');

const mockCategories = [
    { id: 'dev', name: '开发工具', icon: './image/icons/code.svg', monochrome: true },
    { id: 'media', name: '娱乐媒体', icon: './image/icons/heart.svg', monochrome: true },
];

function createMockDataManager() {
    return {
        categories: computed(() => [{ id: 'all', name: '全部应用', icon: './image/icons/menu.svg', monochrome: true }, ...mockCategories]),
        userCategories: computed(() => mockCategories),
        apps: computed(() => []),
        visibleApps: computed(() => []),
        hiddenApps: computed(() => []),
        initialized: ref(true),
        isLoading: ref(false),
        init: vi.fn(),
        addApp: vi.fn(async (app) => ({ ...app, id: 'app_new' })),
        addCategory: vi.fn(async (input) => ({ ...input, id: 'cat_new', icon: './image/icons/folder.svg' })),
    };
}

function createMockCurrentTab(overrides: Partial<ReturnType<typeof useCurrentTab>> = {}) {
    return {
        tab: ref(null),
        title: computed(() => overrides.title?.value ?? 'GitHub'),
        url: computed(() => overrides.url?.value ?? 'https://github.com'),
        favicon: computed(() => overrides.favicon?.value ?? 'https://github.com/favicon.ico'),
        hasFavicon: computed(() => true),
        isValid: computed(() => overrides.isValid?.value ?? true),
        isLoading: ref(overrides.isLoading?.value ?? false),
        error: ref(null),
        refresh: vi.fn(),
    };
}

function createMockToast() {
    return {
        success: vi.fn(),
        error: vi.fn(),
    };
}

describe('PopupApp.vue', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setActivePinia(createPinia());
        vi.mocked(useDataManager).mockReturnValue(createMockDataManager() as unknown as ReturnType<typeof useDataManager>);
        vi.mocked(useCurrentTab).mockReturnValue(createMockCurrentTab() as unknown as ReturnType<typeof useCurrentTab>);
        vi.mocked(useToast).mockReturnValue(createMockToast() as unknown as ReturnType<typeof useToast>);
        vi.spyOn(browserApi, 'isExtension', 'get').mockReturnValue(true);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    function mountPopup() {
        return mount(PopupApp, {
            attachTo: document.body,
        });
    }

    it('渲染 popup 头部与表单', async () => {
        const wrapper = mountPopup();
        await flushPromises();

        expect(wrapper.find('.popup-root').exists()).toBe(true);
        expect(wrapper.find('.popup-title').text()).toContain('添加到 Mugen新标签页');
        expect(wrapper.find('input[placeholder="例如：GitHub"]').exists()).toBe(true);
        expect(wrapper.find('input[type="url"]').exists()).toBe(true);
        expect(wrapper.find('#popup-category').exists()).toBe(true);
    });

    it('自动填充当前标签页信息', async () => {
        mountPopup();
        await flushPromises();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;

        expect(nameInput.value).toBe('GitHub');
        expect(urlInput.value).toBe('https://github.com');
    });

    it('无效页面显示提示信息', async () => {
        vi.mocked(useCurrentTab).mockReturnValue(
            createMockCurrentTab({
                title: computed(() => ''),
                url: computed(() => 'chrome://extensions'),
                favicon: computed(() => ''),
                isValid: computed(() => false),
            }) as unknown as ReturnType<typeof useCurrentTab>
        );

        const wrapper = mountPopup();
        await flushPromises();

        expect(wrapper.find('.popup-state--error').exists()).toBe(true);
        expect(wrapper.text()).toContain('当前页面无法添加');
    });

    it('选择"新建分类"时显示新分类输入框', async () => {
        mountPopup();
        await flushPromises();

        const categorySelect = document.querySelector('#popup-category') as HTMLSelectElement;
        categorySelect.value = '__new__';
        categorySelect.dispatchEvent(new Event('change'));
        await flushPromises();

        expect(document.querySelector('input[placeholder="例如：学习资源"]')).not.toBeNull();
    });

    it('提交表单添加网站', async () => {
        mountPopup();
        await flushPromises();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
        const categorySelect = document.querySelector('#popup-category') as HTMLSelectElement;

        nameInput.value = 'V2EX';
        nameInput.dispatchEvent(new Event('input'));
        urlInput.value = 'v2ex.com';
        urlInput.dispatchEvent(new Event('input'));
        categorySelect.value = 'dev';
        categorySelect.dispatchEvent(new Event('change'));
        await flushPromises();

        const saveBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('保存网站')
        ) as HTMLButtonElement;
        saveBtn.click();
        await flushPromises();

        const mockDm = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        expect(mockDm.addApp).toHaveBeenCalledOnce();
        expect(mockDm.addApp).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'V2EX',
                url: 'https://v2ex.com',
                category: 'dev',
            })
        );

        const toast = vi.mocked(useToast).mock.results[0]?.value as ReturnType<typeof useToast>;
        expect(toast.success).toHaveBeenCalledWith('网站已添加');
    });

    it('新建分类时先创建分类再保存网站', async () => {
        mountPopup();
        await flushPromises();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
        const categorySelect = document.querySelector('#popup-category') as HTMLSelectElement;

        nameInput.value = 'Example';
        nameInput.dispatchEvent(new Event('input'));
        urlInput.value = 'example.com';
        urlInput.dispatchEvent(new Event('input'));
        categorySelect.value = '__new__';
        categorySelect.dispatchEvent(new Event('change'));
        await flushPromises();

        const newCatInput = document.querySelector('input[placeholder="例如：学习资源"]') as HTMLInputElement;
        newCatInput.value = '社区';
        newCatInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const saveBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('保存网站')
        ) as HTMLButtonElement;
        saveBtn.click();
        await flushPromises();

        const mockDm = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        expect(mockDm.addCategory).toHaveBeenCalledWith({ name: '社区' });
        expect(mockDm.addApp).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'cat_new',
            })
        );
    });

    it('校验失败时阻止提交', async () => {
        mountPopup();
        await flushPromises();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        nameInput.value = '';
        nameInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const saveBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('保存网站')
        ) as HTMLButtonElement;
        saveBtn.click();
        await flushPromises();

        const mockDm = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        expect(mockDm.addApp).not.toHaveBeenCalled();

        const toast = vi.mocked(useToast).mock.results[0]?.value as ReturnType<typeof useToast>;
        expect(toast.error).toHaveBeenCalledWith('请填写必填项');
    });

    it('点击重置按钮清空表单', async () => {
        mountPopup();
        await flushPromises();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        nameInput.value = 'Changed';
        nameInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const resetBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('重置')
        ) as HTMLButtonElement;
        resetBtn.click();
        await flushPromises();

        expect(nameInput.value).toBe('GitHub');
    });

    it('勾选高清图标后自动获取的地址包含 larger=true', async () => {
        mountPopup();
        await flushPromises();

        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
        urlInput.value = 'example.com';
        urlInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const largerToggle = document.querySelector('.icon-larger-toggle input[type="checkbox"]') as HTMLInputElement;
        expect(largerToggle).not.toBeNull();
        largerToggle.checked = true;
        largerToggle.dispatchEvent(new Event('change'));
        await flushPromises();

        const fetchBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('自动获取')
        ) as HTMLButtonElement;
        fetchBtn.click();
        await flushPromises();

        const iconInput = document.querySelector('input[placeholder="图标 URL 或系统图标名称"]') as HTMLInputElement;
        expect(iconInput.value).toContain('https://favicon.im/example.com');
        expect(iconInput.value).toContain('larger=true');
    });
});
