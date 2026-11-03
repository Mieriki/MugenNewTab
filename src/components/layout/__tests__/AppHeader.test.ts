import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AppHeader from '@/components/layout/AppHeader.vue';

describe('AppHeader', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('渲染品牌标题', () => {
        const wrapper = mount(AppHeader, {
            props: {
                title: 'Mugen'
            }
        });
        expect(wrapper.text()).toContain('Mugen');
    });

    it('折叠按钮位于品牌区右侧', () => {
        const wrapper = mount(AppHeader);
        const children = Array.from(wrapper.find('.header-brand').element.children);
        const brandIndex = children.findIndex((el) => el.classList.contains('brand'));
        const collapseIndex = children.findIndex((el) => el.classList.contains('collapse-toggle-btn'));

        expect(brandIndex).toBeGreaterThanOrEqual(0);
        expect(collapseIndex).toBeGreaterThan(brandIndex);
    });

    it('点击折叠按钮触发 toggle-sidebar 事件', async () => {
        const wrapper = mount(AppHeader);
        await wrapper.find('.collapse-toggle-btn').trigger('click');
        expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1);
    });

    it('点击移动端菜单按钮触发 menu-click 事件', async () => {
        const wrapper = mount(AppHeader);
        await wrapper.find('.menu-toggle').trigger('click');
        expect(wrapper.emitted('menu-click')).toHaveLength(1);
    });

    it('双击品牌区触发 brand-dblclick 事件', async () => {
        const wrapper = mount(AppHeader);

        // 双击落在 Logo 图片上也要能冒泡到 .brand
        await wrapper.find('.brand-icon img').trigger('dblclick');
        expect(wrapper.emitted('brand-dblclick')).toHaveLength(1);

        await wrapper.find('.brand').trigger('dblclick');
        expect(wrapper.emitted('brand-dblclick')).toHaveLength(2);
    });

    it('品牌区不暴露隐藏站点的提示文案（入口刻意保持隐蔽）', () => {
        const wrapper = mount(AppHeader);
        const brand = wrapper.find('.brand');
        expect(brand.attributes('title')).toBeUndefined();
        expect(brand.text()).not.toContain('隐藏');
    });
});
