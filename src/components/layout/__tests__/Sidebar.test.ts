import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Sidebar from '@/components/layout/Sidebar.vue';
import type { Category } from '@/types/app';

const mockCategories: Category[] = [
    { id: 'all', name: '全部应用', icon: './image/icons/menu.svg', monochrome: true },
    { id: 'media', name: '娱乐媒体', icon: './image/icons/heart.svg', monochrome: true },
    { id: 'dev', name: '开发工具', icon: './image/icons/code.svg', monochrome: true }
];

describe('Sidebar', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('根据 props 渲染分类列表', () => {
        const wrapper = mount(Sidebar, {
            props: {
                categories: mockCategories,
                activeCategoryId: 'media'
            }
        });
        const items = wrapper.findAll('.nav-item');
        expect(items).toHaveLength(3);
        expect(items[1]?.classes()).toContain('active');
        expect(wrapper.text()).toContain('娱乐媒体');
    });

    it('点击分类触发 select-category 事件', async () => {
        const wrapper = mount(Sidebar, {
            props: { categories: mockCategories }
        });
        await wrapper.findAll('.nav-item')[2]?.trigger('click');
        expect(wrapper.emitted('select-category')).toHaveLength(1);
        expect(wrapper.emitted('select-category')![0]).toEqual(['dev']);
    });

    it('点击搜索项触发 open-search 事件', async () => {
        const wrapper = mount(Sidebar, {
            props: { categories: mockCategories }
        });
        await wrapper.find('.search-nav-item').trigger('click');
        expect(wrapper.emitted('open-search')).toHaveLength(1);
    });

    it('移动端打开时渲染遮罩并支持关闭', async () => {
        const wrapper = mount(Sidebar, {
            props: { categories: mockCategories, mobileOpen: true }
        });
        expect(wrapper.find('.sidebar-overlay').exists()).toBe(true);
        await wrapper.find('.sidebar-overlay').trigger('click');
        expect(wrapper.emitted('update:mobileOpen')).toHaveLength(1);
        expect(wrapper.emitted('update:mobileOpen')![0]).toEqual([false]);
    });

    it('折叠态添加 collapsed 类', () => {
        const wrapper = mount(Sidebar, {
            props: { categories: mockCategories, collapsed: true }
        });
        expect(wrapper.find('.sidebar').classes()).toContain('collapsed');
    });
});
