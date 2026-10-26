/**
 * IconSvg 组件单元测试
 * 覆盖系统图标渲染、src 优先、错误回退、emoji 拒绝与内联 SVG。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import IconSvg from '@/components/icon/IconSvg.vue';
import { mediaCacheService } from '@/services/mediaCache.service';

const PLACEHOLDER_PATTERN = /^data:image\/svg\+xml/;

describe('IconSvg', () => {
    beforeEach(() => {
        // 远程图标会先查缓存再抓取：测试里直接判定「未命中且抓不到」，
        // 避免真的发网络请求，同时走「回退到原始地址」的分支
        vi.spyOn(mediaCacheService, 'resolve').mockResolvedValue(null);
        vi.spyOn(mediaCacheService, 'fetchAndCache').mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('根据 name 渲染系统 SVG 图标（mask 方式，颜色跟随 currentColor）', () => {
        const wrapper = mount(IconSvg, {
            props: { name: 'home', size: 24, monochrome: true, alt: '首页' }
        });
        // 系统图标不再用 <img>，而是把 SVG 当遮罩，背景色取 currentColor
        expect(wrapper.find('img').exists()).toBe(false);
        const mask = wrapper.find('.icon-svg__mask');
        expect(mask.exists()).toBe(true);
        expect(mask.attributes('style')).toContain('/image/icons/home.svg');
        // 无障碍名称留在根节点上，遮罩本身对读屏隐藏
        expect(wrapper.attributes('aria-label')).toBe('首页');
        expect(mask.attributes('aria-hidden')).toBe('true');
    });

    it('color 属性可以给系统图标上色（不再被 img 的黑色限制）', () => {
        const wrapper = mount(IconSvg, {
            props: { name: 'palette', color: 'var(--md-sys-color-primary)' }
        });
        const style = wrapper.attributes('style') ?? '';
        expect(style).toContain('--icon-fill: var(--md-sys-color-primary)');
        expect(wrapper.find('.icon-svg__mask').exists()).toBe(true);
    });

    it('src 指向内置 image/icons 下的 svg 时同样走 mask，并归一化成绝对路径', () => {
        const wrapper = mount(IconSvg, { props: { src: './image/icons/folder.svg' } });
        expect(wrapper.find('img').exists()).toBe(false);
        const mask = wrapper.find('.icon-svg__mask');
        expect(mask.exists()).toBe(true);
        // 相对路径必须归一化：--icon-mask 会被样式表里的 mask-image: var() 使用，
        // 相对路径会按样式表位置解析（打包后在 /js/ 下），导致 404
        expect(mask.attributes('style')).toContain('/image/icons/folder.svg');
        expect(mask.attributes('style')).not.toContain('./image/icons/folder.svg');
    });

    it('远程图片图标仍然用 <img>，不会被当成遮罩', async () => {
        const wrapper = mount(IconSvg, {
            props: { src: 'https://example.com/favicon.png' },
        });
        await flushPromises();
        expect(wrapper.find('.icon-svg__mask').exists()).toBe(false);
        expect(wrapper.find('img').attributes('src')).toBe('https://example.com/favicon.png');
    });

    it('优先使用 src 属性', async () => {
        const wrapper = mount(IconSvg, {
            props: { src: 'https://example.com/icon.png', name: 'home' }
        });
        await flushPromises();
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

    it('系统图标（name 且无 src）自动标记为单色图标', () => {
        const wrapper = mount(IconSvg, { props: { name: 'search' } });
        expect(wrapper.classes()).toContain('is-monochrome');
        // 但走的是 mask，不需要 filter 反转
        expect(wrapper.find('img').exists()).toBe(false);
    });

    it('显式 src 的应用品牌图标不自动反转', async () => {
        const wrapper = mount(IconSvg, {
            props: { src: 'https://example.com/logo.png', name: 'site' },
        });
        await flushPromises();
        expect(wrapper.classes()).not.toContain('is-monochrome');
    });

    it('内联 path 图标用 currentColor 绘制，不自动反转', () => {
        const wrapper = mount(IconSvg, { props: { path: 'M0 0h24v24H0z' } });
        expect(wrapper.classes()).not.toContain('is-monochrome');
    });

    it('name 不是系统图标名（是 URL）时不自动反转', () => {
        const wrapper = mount(IconSvg, { props: { name: 'https://example.com/a.svg' } });
        expect(wrapper.classes()).not.toContain('is-monochrome');
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

    it('回退图也加载失败时不再重复赋值 img.src（无无限 error 循环）', async () => {
        const srcSetter = vi.spyOn(HTMLImageElement.prototype, 'src', 'set');
        const wrapper = mount(IconSvg, {
            props: { src: 'invalid.png', fallback: './missing/fallback.svg' },
        });
        const img = wrapper.find('img');
        await img.trigger('error');
        const callsAfterFirstError = srcSetter.mock.calls.length;
        // 回退图再次失败：不应再次重写 src，否则会形成 error → 赋值 → error 死循环
        await img.trigger('error');
        await img.trigger('error');
        expect(srcSetter.mock.calls.length).toBe(callsAfterFirstError);
        expect(img.attributes('src')).toBe('./missing/fallback.svg');
    });

    it('源变化后重置错误状态，新地址可正常显示而非停留在回退图', async () => {
        const wrapper = mount(IconSvg, {
            props: { src: 'invalid.png', fallback: 'home' },
        });
        await wrapper.find('img').trigger('error');
        expect(wrapper.find('img').attributes('src')).toBe('/image/icons/home.svg');

        await wrapper.setProps({ src: 'https://example.com/ok.png' });
        await flushPromises();

        // 解析缓存期间 <img> 不渲染，元素会重建，所以重新查一次
        expect(wrapper.find('img').attributes('src')).toBe('https://example.com/ok.png');
    });
});
