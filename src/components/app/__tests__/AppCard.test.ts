import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AppCard from '@/components/app/AppCard.vue';
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
});
