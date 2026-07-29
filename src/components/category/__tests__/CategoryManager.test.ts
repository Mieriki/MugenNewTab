import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CategoryManager from '@/components/category/CategoryManager.vue';
import { loadDefaultData } from '@/services/config.service';
import { storageManager } from '@/services/storage.service';
import { BrowserAPI } from '@/services/browserApi.service';
import { STORAGE_KEYS } from '@/types/storage';
import type { AppNavigatorData, Category } from '@/types/app';

vi.mock('@/services/config.service', () => ({
    loadDefaultData: vi.fn(),
    clearConfigCache: vi.fn(),
}));

vi.mock('@/composables/useConfirm', () => ({
    useConfirm: vi.fn(() => ({
        confirm: vi.fn(() => Promise.resolve(true)),
    })),
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
        defaultAllCategory,
        { id: 'media', name: '娱乐媒体', icon: './image/icons/heart.svg', monochrome: true },
        { id: 'dev', name: '开发工具', icon: './image/icons/code.svg', monochrome: true },
    ],
    apps: [
        { id: 'app_1', name: 'Bilibili', url: 'https://www.bilibili.com', category: 'media' },
        { id: 'app_2', name: 'GitHub', url: 'https://github.com', category: 'dev' },
        { id: 'app_3', name: 'Vite', url: 'https://vitejs.dev', category: 'dev' },
    ],
};

const mockDefaultDataConfig = {
    appNavigator: mockDefaultData,
    systemUiLib: { categories: [], items: [] },
    userUiLib: { categories: [], items: [] },
};

describe('CategoryManager', () => {
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

    it('打开时渲染分类列表并排除“全部应用”', async () => {
        mount(CategoryManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const items = document.querySelectorAll('.mnt-category-manager__item');
        expect(items).toHaveLength(2);
        expect(document.body.textContent).toContain('娱乐媒体');
        expect(document.body.textContent).toContain('开发工具');
        expect(document.body.textContent).not.toContain('全部应用');
    });

    it('显示每个分类下的网站数量', async () => {
        mount(CategoryManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        expect(document.body.textContent).toContain('1 个网站');
        expect(document.body.textContent).toContain('2 个网站');
    });

    it('空分类时显示空状态', async () => {
        mockedLoadDefaultData.mockResolvedValue({
            appNavigator: { categories: [defaultAllCategory], apps: [] },
            systemUiLib: { categories: [], items: [] },
            userUiLib: { categories: [], items: [] },
        });

        mount(CategoryManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        expect(document.querySelector('.mnt-category-manager__empty')).not.toBeNull();
        expect(document.body.textContent).toContain('暂无自定义分类');
    });

    it('点击编辑按钮触发 edit 事件', async () => {
        const wrapper = mount(CategoryManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const firstItem = document.querySelector('.mnt-category-manager__item');
        const editBtn = firstItem?.querySelectorAll('.mnt-base-button--text')[0] as HTMLButtonElement | undefined;
        editBtn?.click();
        await flushPromises();

        expect(wrapper.emitted('edit')).toHaveLength(1);
        expect((wrapper.emitted('edit')![0] as [Category])[0].id).toBe('media');
    });

    it('点击新建分类按钮触发 add 事件', async () => {
        const wrapper = mount(CategoryManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const addBtn = Array.from(document.querySelectorAll('.mnt-modal-footer .mnt-base-button--primary')).find(
            (btn) => btn.textContent?.includes('新建分类')
        ) as HTMLButtonElement | undefined;
        addBtn?.click();
        await flushPromises();

        expect(wrapper.emitted('add')).toHaveLength(1);
    });

    it('点击列表底部新建分类行触发 add 事件', async () => {
        const wrapper = mount(CategoryManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const addRow = document.querySelector('.mnt-category-manager__add-row') as HTMLButtonElement | null;
        addRow?.click();
        await flushPromises();

        expect(wrapper.emitted('add')).toHaveLength(1);
    });

    it('点击删除按钮并从存储中移除分类及其应用', async () => {
        mount(CategoryManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await flushPromises();

        const firstItem = document.querySelector('.mnt-category-manager__item');
        const deleteBtn = firstItem?.querySelectorAll('.mnt-base-button--text')[1] as HTMLButtonElement | undefined;
        deleteBtn?.click();
        await flushPromises();

        const saved = (await storageManager.get(STORAGE_KEYS.MAIN_DATA)) as AppNavigatorData;
        expect(saved.categories.map((c) => c.id)).not.toContain('media');
        expect(saved.apps.map((a) => a.id)).not.toContain('app_1');
    });
});
