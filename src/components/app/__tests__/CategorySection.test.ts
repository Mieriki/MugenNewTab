import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CategorySection from '@/components/app/CategorySection.vue';
import AppGrid from '@/components/app/AppGrid.vue';
import AppCard from '@/components/app/AppCard.vue';
import type { AppItem, Category } from '@/types/app';

function createCategory(overrides: Partial<Category> = {}): Category {
    return {
        id: 'cat_test',
        name: '测试分类',
        icon: './image/icons/heart.svg',
        monochrome: true,
        ...overrides
    };
}

function createApp(id: string): AppItem {
    return {
        id,
        name: `应用 ${id}`,
        url: 'https://example.com',
        category: 'cat_test',
        hidden: false
    };
}

describe('CategorySection', () => {
    it('渲染分类标题与图标', () => {
        const category = createCategory();
        const wrapper = mount(CategorySection, {
            props: { category, apps: [] }
        });

        expect(wrapper.text()).toContain('测试分类');
        expect(wrapper.find('.category-section__title').exists()).toBe(true);
    });

    it('可隐藏分类标题', () => {
        const category = createCategory();
        const wrapper = mount(CategorySection, {
            props: { category, apps: [], showTitle: false }
        });

        expect(wrapper.find('.category-section__title').exists()).toBe(false);
    });

    it('将应用传入 AppGrid 并渲染卡片', () => {
        const category = createCategory();
        const apps = [createApp('app_1'), createApp('app_2')];
        const wrapper = mount(CategorySection, {
            props: { category, apps }
        });

        const grid = wrapper.findComponent(AppGrid);
        expect(grid.exists()).toBe(true);
        expect(grid.props('apps')).toEqual(apps);
        expect(wrapper.findAllComponents(AppCard)).toHaveLength(2);
    });

    it('透传 app-click、edit-app、delete-app 事件', async () => {
        const category = createCategory();
        const apps = [createApp('app_1')];
        const wrapper = mount(CategorySection, {
            props: { category, apps }
        });

        const card = wrapper.findComponent(AppCard);
        await card.vm.$emit('click', apps[0]);
        await card.vm.$emit('edit', apps[0]);
        await card.vm.$emit('delete', apps[0]);

        expect(wrapper.emitted('app-click')).toHaveLength(1);
        expect(wrapper.emitted('edit-app')).toHaveLength(1);
        expect(wrapper.emitted('delete-app')).toHaveLength(1);
    });
});
