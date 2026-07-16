import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CategoryEditModal from '@/components/category/CategoryEditModal.vue';
import { loadDefaultData } from '@/services/config.service';
import { storageManager } from '@/services/storage.service';
import { BrowserAPI } from '@/services/browserApi.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { Category, AppNavigatorData } from '@/types/app';

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
    categories: [defaultAllCategory, { id: 'dev', name: '开发工具', icon: './image/icons/code.svg', monochrome: true }],
    apps: [],
};

const mockDefaultDataConfig = {
    appNavigator: mockDefaultData,
    systemUiLib: { categories: [], items: [] },
    userUiLib: { categories: [], items: [] },
};

function queryInputs() {
    return Array.from(document.querySelectorAll('.mnt-category-form input[type="text"]')) as HTMLInputElement[];
}

function clickPrimaryButton(label: string) {
    const buttons = Array.from(document.querySelectorAll('.mnt-base-button--primary'));
    const target = buttons.find((btn) => btn.textContent?.includes(label)) as HTMLButtonElement | undefined;
    target?.click();
}

describe('CategoryEditModal', () => {
    beforeEach(async () => {
        document.body.innerHTML = '';
        document.body.style.overflow = '';
        localStorage.clear();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        mockedLoadDefaultData.mockReset();
        mockedLoadDefaultData.mockResolvedValue(mockDefaultDataConfig);
        setActivePinia(createPinia());
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.body.style.overflow = '';
    });

    it('新增模式下渲染标题与表单字段', async () => {
        mount(CategoryEditModal, {
            props: { modelValue: false },
            attachTo: document.body,
        });
        await flushPromises();

        const inputs = queryInputs();
        expect(document.querySelector('.mnt-modal-title')?.textContent).toBe('添加分类');
        expect(inputs.length).toBeGreaterThanOrEqual(1);
        expect(inputs[0]?.placeholder).toContain('开发工具');
    });

    it('编辑模式下回填分类数据', async () => {
        const category: Category = {
            id: 'dev',
            name: '开发工具',
            icon: './image/icons/code.svg',
            iconDark: './image/icons/code-white.svg',
            monochrome: true,
        };
        mount(CategoryEditModal, {
            props: { modelValue: false, category },
            attachTo: document.body,
        });
        await flushPromises();

        const inputs = queryInputs();
        expect(document.querySelector('.mnt-modal-title')?.textContent).toBe('编辑分类');
        expect(inputs[0]?.value).toBe('开发工具');
        expect(inputs[1]?.value).toBe('./image/icons/code.svg');
    });

    it('分类名称为空时阻止保存并显示错误', async () => {
        mount(CategoryEditModal, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        clickPrimaryButton('保存');
        await flushPromises();

        expect(document.body.textContent).toContain('请输入分类名称');
    });

    it('新增分类时持久化到存储并触发 saved 事件', async () => {
        const wrapper = mount(CategoryEditModal, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const inputs = queryInputs();
        inputs[0]!.value = '设计工具';
        inputs[0]!.dispatchEvent(new Event('input'));
        inputs[1]!.value = './image/icons/image.svg';
        inputs[1]!.dispatchEvent(new Event('input'));
        await flushPromises();

        clickPrimaryButton('保存');
        await flushPromises();

        expect(wrapper.emitted('saved')).toBeTruthy();
        const saved = (await storageManager.get(STORAGE_KEYS.MAIN_DATA)) as AppNavigatorData;
        expect(saved.categories.map((c) => c.name)).toContain('设计工具');
    });

    it('编辑分类时更新存储并触发 saved 事件', async () => {
        const category: Category = {
            id: 'dev',
            name: '开发工具',
            icon: './image/icons/code.svg',
            monochrome: true,
        };
        const wrapper = mount(CategoryEditModal, {
            props: { modelValue: true, category },
            attachTo: document.body,
        });
        await flushPromises();

        const inputs = queryInputs();
        inputs[0]!.value = '开发者工具';
        inputs[0]!.dispatchEvent(new Event('input'));
        await flushPromises();

        clickPrimaryButton('保存');
        await flushPromises();

        expect(wrapper.emitted('saved')).toBeTruthy();
        const saved = (await storageManager.get(STORAGE_KEYS.MAIN_DATA)) as AppNavigatorData;
        expect(saved.categories.find((c) => c.id === 'dev')?.name).toBe('开发者工具');
    });

    it('点击常用图标按钮填充图标输入', async () => {
        mount(CategoryEditModal, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const selectBtn = Array.from(document.querySelectorAll('.mnt-base-button--secondary')).find(
            (btn) => btn.textContent?.includes('选择')
        ) as HTMLButtonElement | undefined;
        selectBtn?.click();
        await flushPromises();

        expect(document.querySelector('.mnt-category-form__presets')).not.toBeNull();

        const firstPreset = document.querySelector('.mnt-category-form__preset-btn') as HTMLButtonElement | null;
        firstPreset?.click();
        await flushPromises();

        const inputs = queryInputs();
        expect(inputs[1]?.value).toMatch(/^\.\/image\/icons\/[a-zA-Z0-9_-]+\.svg$/);
    });

    it('恢复默认按钮重置图标与单色设置', async () => {
        mount(CategoryEditModal, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const inputs = queryInputs();
        inputs[1]!.value = './image/icons/code.svg';
        inputs[1]!.dispatchEvent(new Event('input'));

        const checkbox = document.querySelector('.mnt-category-form input[type="checkbox"]') as HTMLInputElement;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        await flushPromises();

        const restoreBtn = Array.from(document.querySelectorAll('.mnt-base-button--text')).find(
            (btn) => btn.textContent?.includes('恢复默认')
        ) as HTMLButtonElement | undefined;
        restoreBtn?.click();
        await flushPromises();

        expect(inputs[1]?.value).toBe('./image/icons/folder.svg');
        expect(checkbox.checked).toBe(false);
    });
});
