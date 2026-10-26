import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AppCard from '@/components/app/AppCard.vue';
import { mediaCacheService } from '@/services/mediaCache.service';
import type { AppItem } from '@/types/app';

function createApp(overrides: Partial<AppItem> = {}): AppItem {
    return {
        id: 'app_test_1',
        name: '测试应用',
        description: '测试描述',
        url: 'https://example.com',
        category: 'cat_test',
        hidden: false,
        ...overrides
    };
}

describe('AppCard', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        // 远程图标先查缓存再抓取：固定为「未命中且抓不到」，避免测试真的发网络请求
        vi.spyOn(mediaCacheService, 'resolve').mockResolvedValue(null);
        vi.spyOn(mediaCacheService, 'fetchAndCache').mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('渲染应用名称与描述', () => {
        const app = createApp();
        const wrapper = mount(AppCard, { props: { app } });

        expect(wrapper.text()).toContain('测试应用');
        expect(wrapper.text()).toContain('测试描述');
        expect(wrapper.find('.app-card__name').attributes('title')).toBe('测试应用');
    });

    it('隐藏应用附加 is-hidden 类', () => {
        const app = createApp({ hidden: true });
        const wrapper = mount(AppCard, { props: { app } });

        expect(wrapper.find('.app-card').classes()).toContain('is-hidden');
    });

    it('点击卡片主体触发 click 事件并携带应用数据', async () => {
        const app = createApp();
        const wrapper = mount(AppCard, { props: { app } });

        await wrapper.find('.app-card').trigger('click');
        expect(wrapper.emitted('click')).toHaveLength(1);
        expect(wrapper.emitted('click')?.[0]).toEqual([app]);
    });

    it('点击编辑按钮触发 edit 事件且不触发 click', async () => {
        const app = createApp();
        const wrapper = mount(AppCard, { props: { app } });

        const editBtn = wrapper.find('[aria-label*="编辑"]');
        expect(editBtn.exists()).toBe(true);

        await editBtn.trigger('click');
        expect(wrapper.emitted('edit')).toHaveLength(1);
        expect(wrapper.emitted('edit')?.[0]).toEqual([app]);
        expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('点击删除按钮触发 delete 事件且不触发 click', async () => {
        const app = createApp();
        const wrapper = mount(AppCard, { props: { app } });

        const deleteBtn = wrapper.find('[aria-label*="删除"]');
        expect(deleteBtn.exists()).toBe(true);

        await deleteBtn.trigger('click');
        expect(wrapper.emitted('delete')).toHaveLength(1);
        expect(wrapper.emitted('delete')?.[0]).toEqual([app]);
        expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('隐藏操作按钮时不再渲染操作区', () => {
        const app = createApp();
        const wrapper = mount(AppCard, {
            props: { app, editable: false, deletable: false }
        });

        expect(wrapper.find('.app-card__actions').exists()).toBe(false);
    });

    it('键盘 Enter 触发 click 事件', async () => {
        const app = createApp();
        const wrapper = mount(AppCard, { props: { app } });

        await wrapper.find('.app-card').trigger('keydown', { key: 'Enter' });
        expect(wrapper.emitted('click')).toHaveLength(1);
    });

    it('拖拽与按压状态类正确应用', () => {
        const app = createApp();
        const wrapper = mount(AppCard, {
            props: { app, draggable: true, dragging: true, pressing: true }
        });

        const card = wrapper.find('.app-card');
        expect(card.classes()).toContain('is-draggable');
        expect(card.classes()).toContain('is-dragging');
        expect(card.classes()).toContain('is-pressing');
    });

    it('iconBackground 为 false 时附加 no-icon-bg 类，默认不附加', () => {
        const app = createApp();
        const withTransparent = mount(AppCard, {
            props: { app, iconBackground: false }
        });
        expect(withTransparent.find('.app-card').classes()).toContain('no-icon-bg');

        const byDefault = mount(AppCard, { props: { app } });
        expect(byDefault.find('.app-card').classes()).not.toContain('no-icon-bg');
    });

    it('未设置图标时显示默认站点图标（系统图标遮罩，颜色跟随主题）', () => {
        const app = createApp({ icon: undefined });
        const wrapper = mount(AppCard, { props: { app } });

        // 没有自定义图标 → 退回系统图标库的 site.svg，走 mask 渲染
        expect(wrapper.find('.app-card__icon img').exists()).toBe(false);
        const mask = wrapper.find('.app-card__icon .icon-svg__mask');
        expect(mask.exists()).toBe(true);
        expect(mask.attributes('style')).toContain('/image/icons/site.svg');
    });

    it('图标加载失败时回退为默认站点图标', async () => {
        const app = createApp({ icon: 'https://example.com/favicon.ico' });
        const wrapper = mount(AppCard, { props: { app } });

        // 缓存解析是异步的，解析完成前不渲染 <img>
        await flushPromises();
        const img = wrapper.find('.app-card__icon img');
        await img.trigger('error');
        expect(img.attributes('src')).toBe('/image/icons/site.svg');
    });
});
