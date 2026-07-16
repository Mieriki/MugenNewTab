/**
 * UiLibPicker 组件单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import UiLibPicker from '@/components/uiLib/UiLibPicker.vue';
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

describe('UiLibPicker', () => {
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
        mount(UiLibPicker, {
            props: { modelValue: false },
            attachTo: document.body,
        });
        const overlay = document.querySelector('.mnt-modal-overlay') as HTMLElement;
        expect(overlay).not.toBeNull();
        expect(overlay.style.display).toBe('none');
    });

    it('打开时加载并渲染分类标签与图标网格', async () => {
        mount(UiLibPicker, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        const tabs = document.querySelectorAll('.ui-lib-picker__tab');
        expect(tabs.length).toBe(1);
        expect(tabs[0].textContent).toBe('系统分类');

        const items = document.querySelectorAll('.ui-lib-picker__item');
        expect(items.length).toBe(1);
        expect(items[0].getAttribute('title')).toBe('系统图标');
    });

    it('点击图标触发 select 事件并关闭面板', async () => {
        const wrapper = mount(UiLibPicker, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        const item = document.querySelector('.ui-lib-picker__item') as HTMLButtonElement;
        item.click();
        await nextTick();

        expect(wrapper.emitted('select')).toBeTruthy();
        expect(wrapper.emitted('select')?.[0]).toEqual(['/image/icons/menu.svg']);
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('根据 selected 高亮当前图标', async () => {
        mount(UiLibPicker, {
            props: { modelValue: true, selected: '/image/icons/menu.svg' },
            attachTo: document.body,
        });
        await wait();

        const item = document.querySelector('.ui-lib-picker__item');
        expect(item?.classList.contains('is-selected')).toBe(true);
    });

    it('点击管理按钮触发 manage 事件', async () => {
        const wrapper = mount(UiLibPicker, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        const manageBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('管理 UI 库')
        );
        manageBtn?.click();
        await nextTick();

        expect(wrapper.emitted('manage')).toBeTruthy();
    });

    it('点击关闭按钮关闭面板', async () => {
        const wrapper = mount(UiLibPicker, {
            props: { modelValue: true },
            attachTo: document.body,
        });
        await wait();

        const closeBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent?.includes('关闭')
        );
        closeBtn?.click();
        await nextTick();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });
});
