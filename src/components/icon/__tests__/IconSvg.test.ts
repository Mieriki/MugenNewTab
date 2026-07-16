/**
 * IconSvg 组件单元测试
 * 覆盖系统图标渲染、src 优先、错误回退、emoji 拒绝与内联 SVG。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import IconSvg from '@/components/icon/IconSvg.vue';

const PLACEHOLDER_PATTERN = /^data:image\/svg\+xml/;

describe('IconSvg', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('根据 name 渲染系统 SVG 图标', () => {
        const wrapper = mount(IconSvg, {
            props: { name: 'home', size: 24, monochrome: true, alt: '首页' }
        });
        const img = wrapper.find('img');
        expect(img.exists()).toBe(true);
        expect(img.attributes('src')).toBe('/image/icons/home.svg');
        expect(img.attributes('alt')).toBe('首页');
    });

    it('优先使用 src 属性', () => {
        const wrapper = mount(IconSvg, {
            props: { src: 'https://example.com/icon.png', name: 'home' }
        });
        expect(wrapper.find('img').attributes('src')).toBe('https://example.com/icon.png');
    });

    it('无 name/src 时使用占位 SVG', () => {
        const wrapper = mount(IconSvg);
        expect(wrapper.find('img').attributes('src')).toMatch(PLACEHOLDER_PATTERN);
    });

    it('emoji 被替换为占位图标', () => {
        const wrapper = mount(IconSvg, {
            props: { src: '🚀', size: 24 },
        });
        const img = wrapper.find('img');
        expect(img.exists()).toBe(true);
        expect(img.attributes('src')).toMatch(PLACEHOLDER_PATTERN);
    });

    it('monochrome 类正确应用', () => {
        const wrapper = mount(IconSvg, {
            props: { name: 'menu', monochrome: true },
        });
        expect(wrapper.classes()).toContain('is-monochrome');
    });

    it('内联 SVG 字符串以内联方式渲染', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
        const wrapper = mount(IconSvg, {
            props: { src: svg, inline: true, size: 24 },
        });
        expect(wrapper.find('img').exists()).toBe(false);
        const inline = wrapper.find('.icon-svg__inline');
        expect(inline.exists()).toBe(true);
        expect(inline.find('svg').exists()).toBe(true);
    });

    it('图片加载失败触发 error 事件并切换到回退图', async () => {
        const wrapper = mount(IconSvg, {
            props: { src: 'invalid.png', fallback: 'home' },
        });
        const img = wrapper.find('img');
        await img.trigger('error');
        expect(img.attributes('src')).toBe('/image/icons/home.svg');
        expect(wrapper.emitted('error')).toHaveLength(1);
    });
});
