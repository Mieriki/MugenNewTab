import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppHeader from '@/components/layout/AppHeader.vue';

describe('AppHeader', () => {
    it('渲染品牌标题与副标题', () => {
        const wrapper = mount(AppHeader, {
            props: {
                title: 'Mugen',
                subtitle: 'Test Subtitle'
            }
        });
        expect(wrapper.text()).toContain('Mugen');
        expect(wrapper.text()).toContain('Test Subtitle');
    });

    it('点击折叠按钮触发 toggle-sidebar 事件', async () => {
        const wrapper = mount(AppHeader);
        await wrapper.find('.collapse-toggle-btn').trigger('click');
        expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1);
    });

    it('点击个性化按钮触发 toggle-personalization 事件', async () => {
        const wrapper = mount(AppHeader);
        await wrapper.find('.personalization-toggle-btn').trigger('click');
        expect(wrapper.emitted('toggle-personalization')).toHaveLength(1);
    });

    it('点击移动端菜单按钮触发 menu-click 事件', async () => {
        const wrapper = mount(AppHeader);
        await wrapper.find('.menu-toggle').trigger('click');
        expect(wrapper.emitted('menu-click')).toHaveLength(1);
    });
});
