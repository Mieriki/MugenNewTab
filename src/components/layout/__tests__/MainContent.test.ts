import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MainContent from '@/components/layout/MainContent.vue';

describe('MainContent', () => {
    it('渲染标题与默认插槽内容', () => {
        const wrapper = mount(MainContent, {
            props: { title: '测试标题' },
            slots: { default: '<p>内容区</p>' }
        });
        expect(wrapper.text()).toContain('测试标题');
        expect(wrapper.text()).toContain('内容区');
    });

    it('支持 header-title 插槽覆盖标题', () => {
        const wrapper = mount(MainContent, {
            props: { title: '默认标题' },
            slots: { 'header-title': '<strong>自定义标题</strong>' }
        });
        expect(wrapper.text()).toContain('自定义标题');
        expect(wrapper.text()).not.toContain('默认标题');
    });

    it('折叠态应用 collapsed 类', () => {
        const wrapper = mount(MainContent, {
            props: { collapsed: true }
        });
        expect(wrapper.find('.main-content').classes()).toContain('collapsed');
    });
});
