/**
 * UiLibManager 组件单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import UiLibManager from '@/components/uiLib/UiLibManager.vue';
import { MntConfirmHost } from '@/composables/useConfirm';
import { clearConfigCache } from '@/services/config.service';
import { BrowserAPI } from '@/services/browserApi.service';
import type { DefaultDataConfig } from '@/types/config';

const mockDefaultData: DefaultDataConfig = {
    appNavigator: { categories: [], apps: [] },
    systemUiLib: {
        categories: [
            { id: 'sys-cat-1', name: '系统分类' },
        ],
        items: [
            { id: 'sys-item-1', name: '系统图标', url: '/image/icons/menu.svg', category: 'sys-cat-1' },
        ],
    },
    userUiLib: { categories: [], items: [] },
};

function setupFetchMock() {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockDefaultData,
        })
    );
}

async function wait(ms = 50) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await nextTick();
}

/** 挂载确认对话框宿主，供测试触发确认操作 */
function mountConfirmHost() {
    return mount(MntConfirmHost, { attachTo: document.body });
}

/** 点击当前确认对话框的确定按钮 */
async function clickConfirmOk() {
    await wait();
    const okBtn = Array.from(document.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('确定')
    );
    okBtn?.click();
    await nextTick();
}

describe('UiLibManager', () => {
    beforeEach(() => {
        localStorage.clear();
        clearConfigCache();
        vi.restoreAllMocks();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        setupFetchMock();
        setActivePinia(createPinia());
        document.body.innerHTML = '';
    });

    it('modelValue 为 false 时隐藏管理器内容', () => {
        mount(UiLibManager, {
            props: { modelValue: false },
            attachTo: document.body,
        });
        const overlay = document.querySelector('.mnt-modal-overlay') as HTMLElement;
        expect(overlay).not.toBeNull();
        expect(overlay.style.display).toBe('none');
    });

    it('打开时默认显示分类管理标签页', async () => {
        mount(UiLibManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        const activeTab = document.querySelector('.ui-lib-manager__tab.is-active');
        expect(activeTab?.textContent?.trim()).toBe('分类管理');

        const listItems = document.querySelectorAll('.ui-lib-manager__list-item');
        expect(listItems.length).toBe(1);
        expect(listItems[0].textContent).toContain('系统分类');
        expect(listItems[0].textContent).toContain('系统');
    });

    it('添加用户分类并刷新列表', async () => {
        mount(UiLibManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        const input = document.querySelector('input') as HTMLInputElement;
        input.value = '新分类';
        input.dispatchEvent(new Event('input'));
        await nextTick();

        const addBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('添加')
        );
        addBtn?.click();
        await wait();

        const listItems = document.querySelectorAll('.ui-lib-manager__list-item');
        expect(listItems.length).toBe(2);
        expect(document.body.textContent).toContain('新分类');
    });

    it('删除用户分类需要确认', async () => {
        mount(UiLibManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        mountConfirmHost();
        await wait();

        // 先添加一个用户分类
        const input = document.querySelector('input') as HTMLInputElement;
        input.value = '待删除';
        input.dispatchEvent(new Event('input'));
        await nextTick();

        const addBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('添加')
        );
        addBtn?.click();
        await wait();

        // 找到删除按钮并点击
        const deleteBtn = document.querySelector('button[aria-label="删除分类"]') as HTMLButtonElement;
        deleteBtn?.click();
        await nextTick();

        // 确认删除
        await clickConfirmOk();
        await wait();

        const listItems = document.querySelectorAll('.ui-lib-manager__list-item');
        expect(listItems.length).toBe(1);
        expect(listItems[0].textContent).toContain('系统分类');
    });

    it('切换到图标管理标签页并添加图标', async () => {
        mount(UiLibManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        // 先添加一个分类用于选择
        const input = document.querySelector('input') as HTMLInputElement;
        input.value = '用户分类';
        input.dispatchEvent(new Event('input'));
        await nextTick();
        const addBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('添加')
        );
        addBtn?.click();
        await wait();

        // 切换到图标管理
        const itemsTab = Array.from(document.querySelectorAll('.ui-lib-manager__tab')).find(
            (tab) => tab.textContent?.trim() === '图标管理'
        ) as HTMLButtonElement;
        itemsTab?.click();
        await wait();

        // 选择分类
        const select = document.querySelector('select') as HTMLSelectElement;
        const targetOption = Array.from(select.options).find(
            (opt) => opt.textContent?.includes('用户分类')
        );
        select.value = targetOption?.value ?? '';
        select.dispatchEvent(new Event('change'));
        await nextTick();

        // 填写名称和 URL
        const inputs = document.querySelectorAll('input');
        const nameInput = inputs[0];
        const urlInput = inputs[1];
        nameInput.value = '用户图标';
        nameInput.dispatchEvent(new Event('input'));
        urlInput.value = '/image/icons/home.svg';
        urlInput.dispatchEvent(new Event('input'));
        await nextTick();

        // 添加图标
        const addItemBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('添加图标')
        );
        addItemBtn?.click();
        await wait();

        expect(document.body.textContent).toContain('用户图标');
        const listItems = document.querySelectorAll('.ui-lib-manager__list-item');
        expect(listItems.length).toBeGreaterThan(0);
    });

    it('删除图标需要确认', async () => {
        mount(UiLibManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        mountConfirmHost();
        await wait();

        // 添加分类和图标
        const input = document.querySelector('input') as HTMLInputElement;
        input.value = '用户分类';
        input.dispatchEvent(new Event('input'));
        await nextTick();
        const addBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('添加')
        );
        addBtn?.click();
        await wait();

        const itemsTab = Array.from(document.querySelectorAll('.ui-lib-manager__tab')).find(
            (tab) => tab.textContent?.trim() === '图标管理'
        ) as HTMLButtonElement;
        itemsTab?.click();
        await wait();

        const select = document.querySelector('select') as HTMLSelectElement;
        const targetOption = Array.from(select.options).find(
            (opt) => opt.textContent?.includes('用户分类')
        );
        select.value = targetOption?.value ?? '';
        select.dispatchEvent(new Event('change'));
        await nextTick();

        const inputs = document.querySelectorAll('input');
        inputs[0].value = '待删图标';
        inputs[0].dispatchEvent(new Event('input'));
        inputs[1].value = '/image/icons/star.svg';
        inputs[1].dispatchEvent(new Event('input'));
        await nextTick();

        const addItemBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('添加图标')
        );
        addItemBtn?.click();
        await wait();

        // 删除
        const deleteBtn = document.querySelector('button[aria-label="删除图标"]') as HTMLButtonElement;
        deleteBtn?.click();
        await nextTick();
        await clickConfirmOk();
        await wait();

        const listItems = document.querySelectorAll('.ui-lib-manager__list-item');
        expect(listItems.length).toBe(0);
    });

    it('点击图标项打开预览模态框', async () => {
        mount(UiLibManager, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        const itemsTab = Array.from(document.querySelectorAll('.ui-lib-manager__tab')).find(
            (tab) => tab.textContent?.trim() === '图标管理'
        ) as HTMLButtonElement;
        itemsTab?.click();
        await wait();

        const listItem = document.querySelector('.ui-lib-manager__list-item--clickable') as HTMLElement;
        listItem?.click();
        await wait();

        expect(document.querySelector('.ui-lib-manager__preview')).not.toBeNull();
        expect(document.querySelector('.ui-lib-manager__preview-name')?.textContent).toBe('系统图标');
    });
});
