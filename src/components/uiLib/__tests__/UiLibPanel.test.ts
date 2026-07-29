/**
 * UiLibPanel 组件单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import UiLibPanel from '@/components/uiLib/UiLibPanel.vue';
import { MntConfirmHost } from '@/composables/useConfirm';
import { useUiLibStore } from '@/stores/uiLib.store';
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
            { id: 'sys-item-1', name: '菜单', url: '/image/icons/menu.svg', category: 'sys-cat-1' },
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

/** 通过 store 预置一个用户分类与用户图标 */
async function seedUserData() {
    const store = useUiLibStore();
    await store.init();
    const category = await store.addCategory({ name: '用户分类' });
    await store.addItem({ name: '首页', url: '/image/icons/home.svg', category: category.id });
    return category;
}

function mountPanel() {
    return mount(UiLibPanel, {
        props: { modelValue: true },
        attachTo: document.body,
    });
}

describe('UiLibPanel', () => {
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

    it('modelValue 为 false 时隐藏面板内容', () => {
        mount(UiLibPanel, {
            props: { modelValue: false },
            attachTo: document.body,
        });
        const overlay = document.querySelector('.mnt-modal-overlay') as HTMLElement;
        expect(overlay).not.toBeNull();
        expect(overlay.style.display).toBe('none');
    });

    it('打开时渲染分类标签（含计数）与图标网格', async () => {
        mountPanel();
        await wait();

        const tabs = document.querySelectorAll('.ui-lib-panel__tab');
        expect(tabs.length).toBe(1);
        expect(tabs[0].textContent).toContain('系统分类');
        expect(tabs[0].querySelector('.ui-lib-panel__tab-count')?.textContent).toBe('1');

        const items = document.querySelectorAll('.ui-lib-panel__item');
        expect(items.length).toBe(1);
        expect(items[0].getAttribute('title')).toBe('菜单');

        expect(document.querySelector('.ui-lib-panel__footer-total')?.textContent).toContain('1 个图标');
    });

    it('搜索关键词跨分类过滤图标，清空后恢复当前分类视图', async () => {
        await seedUserData();
        mountPanel();
        await wait();

        // 默认显示第一个分类（系统分类）的图标
        expect(document.querySelectorAll('.ui-lib-panel__item').length).toBe(1);

        const searchInput = document.querySelector('.ui-lib-panel__search input') as HTMLInputElement;
        searchInput.value = '首页';
        searchInput.dispatchEvent(new Event('input'));
        await wait();

        let items = document.querySelectorAll('.ui-lib-panel__item');
        expect(items.length).toBe(1);
        expect(items[0].getAttribute('title')).toBe('首页');

        // 清空搜索后回到当前分类视图
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        await wait();

        items = document.querySelectorAll('.ui-lib-panel__item');
        expect(items.length).toBe(1);
        expect(items[0].getAttribute('title')).toBe('菜单');
    });

    it('搜索无结果时显示提示', async () => {
        mountPanel();
        await wait();

        const searchInput = document.querySelector('.ui-lib-panel__search input') as HTMLInputElement;
        searchInput.value = '不存在';
        searchInput.dispatchEvent(new Event('input'));
        await wait();

        expect(document.querySelectorAll('.ui-lib-panel__item').length).toBe(0);
        expect(document.body.textContent).toContain('未找到匹配的图标');
    });

    it('通过 + 按钮内联新建分类并切换为该分类', async () => {
        mountPanel();
        await wait();

        const addTabBtn = document.querySelector('.ui-lib-panel__tab-add') as HTMLButtonElement;
        addTabBtn.click();
        await nextTick();

        const input = document.querySelector('.ui-lib-panel__tab-input') as HTMLInputElement;
        expect(input).not.toBeNull();
        input.value = '新分类';
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await wait();

        const tabs = document.querySelectorAll('.ui-lib-panel__tab');
        expect(tabs.length).toBe(2);
        const activeTab = document.querySelector('.ui-lib-panel__tab.is-active');
        expect(activeTab?.textContent).toContain('新分类');
    });

    it('通过底部添加行展开表单并添加图标', async () => {
        await seedUserData();
        mountPanel();
        await wait();

        const addRow = document.querySelector('.ui-lib-panel__add-row') as HTMLButtonElement;
        addRow.click();
        await nextTick();

        const form = document.querySelector('.ui-lib-panel__item-form') as HTMLElement;
        expect(form).not.toBeNull();

        const inputs = form.querySelectorAll('input');
        (inputs[0] as HTMLInputElement).value = '星标';
        inputs[0].dispatchEvent(new Event('input'));
        (inputs[1] as HTMLInputElement).value = '/image/icons/star.svg';
        inputs[1].dispatchEvent(new Event('input'));

        const select = form.querySelector('select') as HTMLSelectElement;
        const targetOption = Array.from(select.options).find(opt => opt.textContent?.includes('用户分类'));
        select.value = targetOption?.value ?? '';
        select.dispatchEvent(new Event('change'));
        await nextTick();

        const submitBtn = Array.from(form.querySelectorAll('button')).find(
            btn => btn.textContent?.includes('添加图标')
        ) as HTMLButtonElement;
        submitBtn.click();
        await wait();

        // 切换到用户分类查看新图标
        const userTab = Array.from(document.querySelectorAll('.ui-lib-panel__tab')).find(
            tab => tab.textContent?.includes('用户分类')
        ) as HTMLButtonElement;
        userTab.click();
        await wait();

        const names = Array.from(document.querySelectorAll('.ui-lib-panel__item')).map(
            el => el.getAttribute('title')
        );
        expect(names).toContain('星标');
    });

    it('系统图标无删除按钮，用户图标删除需确认', async () => {
        await seedUserData();
        mountPanel();
        mountConfirmHost();
        await wait();

        // 系统图标：无删除按钮
        const systemItem = document.querySelector('.ui-lib-panel__item') as HTMLElement;
        expect(systemItem.querySelector('.ui-lib-panel__item-delete')).toBeNull();

        // 切换到用户分类
        const userTab = Array.from(document.querySelectorAll('.ui-lib-panel__tab')).find(
            tab => tab.textContent?.includes('用户分类')
        ) as HTMLButtonElement;
        userTab.click();
        await wait();

        const userItem = document.querySelector('.ui-lib-panel__item') as HTMLElement;

        const deleteBtn = userItem.querySelector('[aria-label="删除图标"]') as HTMLElement;
        expect(deleteBtn).not.toBeNull();
        deleteBtn.click();
        await nextTick();
        await clickConfirmOk();
        await wait();

        expect(document.querySelectorAll('.ui-lib-panel__item').length).toBe(0);
    });

    it('点击图标卡片打开预览弹层', async () => {
        mountPanel();
        await wait();

        const item = document.querySelector('.ui-lib-panel__item') as HTMLButtonElement;
        item.click();
        await wait();

        expect(document.querySelector('.ui-lib-panel__preview')).not.toBeNull();
        expect(document.querySelector('.ui-lib-panel__preview-name')?.textContent).toBe('菜单');
        expect(document.querySelector('.ui-lib-panel__preview-desc')?.textContent).toContain('系统分类');
    });

    it('点击关闭按钮关闭面板', async () => {
        const wrapper = mountPanel();
        await wait();

        const closeBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('关闭')
        );
        closeBtn?.click();
        await nextTick();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });
});
