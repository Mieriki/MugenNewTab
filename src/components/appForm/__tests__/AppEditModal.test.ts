import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, computed } from 'vue';
import AppEditModal from '../AppEditModal.vue';
import { useDataManager } from '@/composables/useDataManager';
import { useToast } from '@/composables/useToast';
import type { AppItem } from '@/types/app';

vi.mock('@/composables/useDataManager');
vi.mock('@/composables/useToast');

const mockCategories = [
    { id: 'dev', name: '开发工具', icon: './image/icons/code.svg', monochrome: true },
    { id: 'media', name: '娱乐媒体', icon: './image/icons/heart.svg', monochrome: true },
];

const mockUiItems = [
    { id: 'ui1', name: 'Menu', url: '/image/icons/menu.svg', category: 'sys', isSystem: true },
    { id: 'ui2', name: 'Folder', url: '/image/icons/folder.svg', category: 'sys', isSystem: true },
];

function createMockDataManager() {
    return {
        userCategories: computed(() => mockCategories),
        uiItems: computed(() => mockUiItems),
        addCategory: vi.fn(async (input: { name: string }) => ({
            id: 'cat_new',
            name: input.name,
            icon: './image/icons/folder.svg',
        })),
        addApp: vi.fn(async (app: Omit<AppItem, 'id'>) => ({ ...app, id: 'app_new' })),
        updateApp: vi.fn(async (id: string, updates: Partial<AppItem>) => ({ ...updates, id } as AppItem)),
    };
}

function createMockToast() {
    return {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
        show: vi.fn(),
    };
}

async function wait(ms = 50) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await nextTick();
}

describe('AppEditModal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.mocked(useDataManager).mockReturnValue(createMockDataManager() as unknown as ReturnType<typeof useDataManager>);
        vi.mocked(useToast).mockReturnValue(createMockToast() as unknown as ReturnType<typeof useToast>);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.body.style.overflow = '';
        vi.clearAllMocks();
    });

    function mountModal(props: Record<string, unknown> = {}) {
        return mount(AppEditModal, {
            props: { modelValue: true, ...props },
            attachTo: document.body,
        });
    }

    it('添加模式下渲染标题与表单字段', async () => {
        mountModal();
        await wait();

        expect(document.querySelector('.mnt-modal-title')?.textContent).toBe('添加网站');
        expect(document.querySelector('input[placeholder="例如：GitHub"]')).not.toBeNull();
        expect(document.querySelector('input[type="url"]')).not.toBeNull();
        expect(document.querySelector('#app-edit-category')).not.toBeNull();
        expect(document.querySelector('input[type="checkbox"]')).not.toBeNull();
    });

    it('编辑模式下回显应用数据并显示编辑标题', async () => {
        const app: AppItem = {
            id: 'app_1',
            name: 'GitHub',
            url: 'https://github.com',
            category: 'dev',
            description: '代码托管',
            icon: 'https://favicon.im/github.com',
            hidden: true,
        };
        mountModal({ app });
        await wait();

        expect(document.querySelector('.mnt-modal-title')?.textContent).toBe('编辑网站');
        expect((document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement)?.value).toBe('GitHub');
        expect((document.querySelector('input[type="url"]') as HTMLInputElement)?.value).toBe('https://github.com');
        expect((document.querySelector('#app-edit-category') as HTMLSelectElement)?.value).toBe('dev');
        expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement)?.checked).toBe(true);
    });

    it('initialCategoryId 在添加模式下默认选中分类', async () => {
        mountModal({ initialCategoryId: 'media' });
        await wait();

        expect((document.querySelector('#app-edit-category') as HTMLSelectElement)?.value).toBe('media');
    });

    it('表单校验失败时阻止提交并显示错误', async () => {
        mountModal();
        await wait();

        const saveBtn = document.querySelector('.mnt-base-button--primary') as HTMLButtonElement;
        saveBtn.click();
        await flushPromises();

        const mockDm = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        expect(mockDm.addApp).not.toHaveBeenCalled();

        const toast = vi.mocked(useToast).mock.results[0]?.value as ReturnType<typeof useToast>;
        expect(toast.error).toHaveBeenCalledWith('请填写必填项');
        expect(document.querySelector('.form-error')).not.toBeNull();
    });

    it('填写必填项后添加应用并触发 saved 事件', async () => {
        const wrapper = mountModal();
        await wait();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
        const categorySelect = document.querySelector('#app-edit-category') as HTMLSelectElement;

        nameInput.value = 'GitHub';
        nameInput.dispatchEvent(new Event('input'));
        urlInput.value = 'github.com';
        urlInput.dispatchEvent(new Event('input'));
        categorySelect.value = 'dev';
        categorySelect.dispatchEvent(new Event('change'));

        await flushPromises();

        const saveBtn = document.querySelector('.mnt-base-button--primary') as HTMLButtonElement;
        saveBtn.click();
        await flushPromises();

        const mockDm = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        expect(mockDm.addApp).toHaveBeenCalledOnce();
        expect(mockDm.addApp).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'GitHub',
                url: 'https://github.com',
                category: 'dev',
            })
        );

        const toast = vi.mocked(useToast).mock.results[0]?.value as ReturnType<typeof useToast>;
        expect(toast.success).toHaveBeenCalledWith('网站已添加');
        expect(wrapper.emitted('saved')).toHaveLength(1);
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('选择新建分类时显示新分类输入框并创建分类', async () => {
        const wrapper = mountModal();
        await wait();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
        const categorySelect = document.querySelector('#app-edit-category') as HTMLSelectElement;

        nameInput.value = 'V2EX';
        nameInput.dispatchEvent(new Event('input'));
        urlInput.value = 'v2ex.com';
        urlInput.dispatchEvent(new Event('input'));
        categorySelect.value = '__new__';
        categorySelect.dispatchEvent(new Event('change'));
        await flushPromises();

        expect(document.querySelector('input[placeholder="例如：学习资源"]')).not.toBeNull();

        const newCatInput = document.querySelector('input[placeholder="例如：学习资源"]') as HTMLInputElement;
        newCatInput.value = '社区';
        newCatInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const saveBtn = document.querySelector('.mnt-base-button--primary') as HTMLButtonElement;
        saveBtn.click();
        await flushPromises();

        const mockDm = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        expect(mockDm.addCategory).toHaveBeenCalledWith({ name: '社区' });
        expect(mockDm.addApp).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'cat_new',
            })
        );
        expect(wrapper.emitted('saved')).toHaveLength(1);
    });

    it('编辑应用时调用 updateApp 并触发 saved 事件', async () => {
        const app: AppItem = {
            id: 'app_1',
            name: 'Bilibili',
            url: 'https://www.bilibili.com',
            category: 'media',
        };
        const wrapper = mountModal({ app });
        await wait();

        const nameInput = document.querySelector('input[placeholder="例如：GitHub"]') as HTMLInputElement;
        nameInput.value = '哔哩哔哩';
        nameInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const saveBtn = document.querySelector('.mnt-base-button--primary') as HTMLButtonElement;
        saveBtn.click();
        await flushPromises();

        const mockDm = vi.mocked(useDataManager).mock.results[0]?.value as ReturnType<typeof useDataManager>;
        expect(mockDm.updateApp).toHaveBeenCalledOnce();
        expect(mockDm.updateApp).toHaveBeenCalledWith(
            'app_1',
            expect.objectContaining({ name: '哔哩哔哩' })
        );
        expect(wrapper.emitted('saved')).toHaveLength(1);
    });

    it('URL 失焦且图标为空时自动获取 favicon', async () => {
        mountModal();
        await wait();

        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
        urlInput.value = 'github.com';
        urlInput.dispatchEvent(new Event('input'));
        await flushPromises();

        urlInput.dispatchEvent(new Event('blur'));
        await flushPromises();

        const iconInput = document.querySelector('input[placeholder="图标 URL 或系统图标名称"]') as HTMLInputElement;
        expect(iconInput.value).toContain('https://favicon.im/github.com');

        const toast = vi.mocked(useToast).mock.results[0]?.value as ReturnType<typeof useToast>;
        expect(toast.success).toHaveBeenCalledWith('图标已自动获取');
    });

    it('点击自动获取图标按钮填充图标输入', async () => {
        mountModal();
        await wait();

        const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
        urlInput.value = 'example.com';
        urlInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const fetchBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('自动获取图标')
        ) as HTMLButtonElement;
        fetchBtn.click();
        await flushPromises();

        const iconInput = document.querySelector('input[placeholder="图标 URL 或系统图标名称"]') as HTMLInputElement;
        expect(iconInput.value).toContain('https://favicon.im/example.com');
    });

    it('清除按钮清空图标输入', async () => {
        mountModal();
        await wait();

        const iconInput = document.querySelector('input[placeholder="图标 URL 或系统图标名称"]') as HTMLInputElement;
        iconInput.value = 'https://example.com/icon.png';
        iconInput.dispatchEvent(new Event('input'));
        await flushPromises();

        const clearBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('清除')
        ) as HTMLButtonElement;
        clearBtn.click();
        await flushPromises();

        expect(iconInput.value).toBe('');
    });

    it('展开 UI 图标库并选择图标', async () => {
        mountModal();
        await wait();

        const chooseBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('选择')
        ) as HTMLButtonElement;
        chooseBtn.click();
        await flushPromises();

        const pickerItems = document.querySelectorAll('.icon-picker-item');
        expect(pickerItems.length).toBe(mockUiItems.length);

        pickerItems[1].dispatchEvent(new Event('click'));
        await flushPromises();

        const iconInput = document.querySelector('input[placeholder="图标 URL 或系统图标名称"]') as HTMLInputElement;
        expect(iconInput.value).toBe('/image/icons/folder.svg');
        expect(document.querySelector('.icon-picker')).toBeNull();
    });

    it('点击取消按钮关闭模态框', async () => {
        const wrapper = mountModal();
        await wait();

        const cancelBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('取消')
        ) as HTMLButtonElement;
        cancelBtn.click();
        await flushPromises();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });
});
