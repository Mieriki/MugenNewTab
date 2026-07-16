import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppGrid from '@/components/app/AppGrid.vue';
import AppCard from '@/components/app/AppCard.vue';
import type { AppItem } from '@/types/app';

function createApp(id: string, overrides: Partial<AppItem> = {}): AppItem {
    return {
        id,
        name: `应用 ${id}`,
        description: '描述',
        url: 'https://example.com',
        category: 'cat_test',
        hidden: false,
        ...overrides
    };
}

describe('AppGrid', () => {
    it('渲染多个 AppCard', () => {
        const apps = [createApp('app_1'), createApp('app_2')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const cards = wrapper.findAllComponents(AppCard);
        expect(cards).toHaveLength(2);
    });

    it('无应用时渲染空状态插槽', () => {
        const wrapper = mount(AppGrid, {
            props: { apps: [], categoryId: 'cat_test' }
        });

        expect(wrapper.findAllComponents(AppCard)).toHaveLength(0);
        expect(wrapper.find('.app-grid__empty').exists()).toBe(true);
        expect(wrapper.text()).toContain('该分类下暂无应用');
    });

    it('透传 app-click 事件', async () => {
        const apps = [createApp('app_1')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const card = wrapper.findComponent(AppCard);
        await card.vm.$emit('click', apps[0]);

        expect(wrapper.emitted('app-click')).toHaveLength(1);
        expect(wrapper.emitted('app-click')?.[0]).toEqual([apps[0]]);
    });

    it('透传 edit-app 与 delete-app 事件', async () => {
        const apps = [createApp('app_1')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const card = wrapper.findComponent(AppCard);
        await card.vm.$emit('edit', apps[0]);
        await card.vm.$emit('delete', apps[0]);

        expect(wrapper.emitted('edit-app')).toHaveLength(1);
        expect(wrapper.emitted('delete-app')).toHaveLength(1);
    });

    it('渲染自定义空状态插槽', () => {
        const wrapper = mount(AppGrid, {
            props: { apps: [], categoryId: 'cat_test' },
            slots: { empty: '<p class="custom-empty">自定义空状态</p>' }
        });

        expect(wrapper.find('.custom-empty').exists()).toBe(true);
        expect(wrapper.text()).toContain('自定义空状态');
    });
});
