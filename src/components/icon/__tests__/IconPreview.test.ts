/**
 * IconPreview 组件单元测试
 * 覆盖默认占位、名称解析、URL 保留、标签/按钮与事件。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import IconPreview from '@/components/icon/IconPreview.vue';
import IconSvg from '@/components/icon/IconSvg.vue';

describe('IconPreview', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('渲染默认占位图标', () => {
        const wrapper = mount(IconPreview);
        const svg = wrapper.findComponent(IconSvg);
        expect(svg.exists()).toBe(true);
        expect(svg.props('src')).toBe('');
        expect(wrapper.classes()).toContain('is-empty');
    });

    it('将纯名称解析为系统图标', () => {
        const wrapper = mount(IconPreview, {
            props: { modelValue: 'home', size: 'large' },
        });
        const svg = wrapper.findComponent(IconSvg);
        expect(svg.props('src')).toBe('/image/icons/home.svg');
        expect(wrapper.classes()).toContain('is-large');
    });

    it('保留 URL 不被转换', () => {
        const url = 'https://example.com/favicon.ico';
        const wrapper = mount(IconPreview, {
            props: { modelValue: url },
        });
        const svg = wrapper.findComponent(IconSvg);
        expect(svg.props('src')).toBe(url);
    });

    it('显示标签与操作按钮', () => {
        const wrapper = mount(IconPreview, {
            props: {
                modelValue: 'star',
                label: '分类图标',
                editable: true,
                showClear: true,
            },
        });
        expect(wrapper.find('.icon-preview__label').text()).toBe('分类图标');
        expect(wrapper.findAll('button')).toHaveLength(2);
    });

    it('清除按钮更新 modelValue 并触发 clear 事件', async () => {
        const wrapper = mount(IconPreview, {
            props: {
                modelValue: 'star',
                showClear: true,
            },
        });
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
        expect(wrapper.emitted('update:modelValue')![0]).toEqual(['']);
        expect(wrapper.emitted('clear')).toHaveLength(1);
    });

    it('选择按钮触发 select 事件', async () => {
        const wrapper = mount(IconPreview, {
            props: {
                modelValue: 'star',
                editable: true,
            },
        });
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('select')).toHaveLength(1);
    });

    it('支持 actions 插槽', () => {
        const wrapper = mount(IconPreview, {
            slots: {
                actions: '<button data-testid="custom">自定义</button>',
            },
        });
        expect(wrapper.find('[data-testid="custom"]').exists()).toBe(true);
    });
});
