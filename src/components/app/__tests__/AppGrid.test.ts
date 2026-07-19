import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AppGrid from '@/components/app/AppGrid.vue';
import AppCard from '@/components/app/AppCard.vue';
import { useAppCardDrag } from '@/composables/useAppCardDrag';
import type { AppItem } from '@/types/app';

function createApp(id: string, overrides: Partial<AppItem> = {}): AppItem {
    return {
        id,
        name: `应用 ${id}`,
        description: '描述',
        url: 'https://example.com',
        category: 'cat_test',
        hidden: false,
        ...overrides
    };
}

describe('AppGrid', () => {
    afterEach(() => {
        // 清理共享拖拽单例状态，避免用例间污染
        useAppCardDrag().reset();
    });

    it('渲染多个 AppCard', () => {
        const apps = [createApp('app_1'), createApp('app_2')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const cards = wrapper.findAllComponents(AppCard);
        expect(cards).toHaveLength(2);
    });

    it('无应用时渲染空状态插槽', () => {
        const wrapper = mount(AppGrid, {
            props: { apps: [], categoryId: 'cat_test' }
        });

        expect(wrapper.findAllComponents(AppCard)).toHaveLength(0);
        expect(wrapper.find('.app-grid__empty').exists()).toBe(true);
        expect(wrapper.text()).toContain('该分类下暂无应用');
    });

    it('透传 app-click 事件', async () => {
        const apps = [createApp('app_1')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const card = wrapper.findComponent(AppCard);
        await card.vm.$emit('click', apps[0]);

        expect(wrapper.emitted('app-click')).toHaveLength(1);
        expect(wrapper.emitted('app-click')?.[0]).toEqual([apps[0]]);
    });

    it('透传 edit-app 与 delete-app 事件', async () => {
        const apps = [createApp('app_1')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const card = wrapper.findComponent(AppCard);
        await card.vm.$emit('edit', apps[0]);
        await card.vm.$emit('delete', apps[0]);

        expect(wrapper.emitted('edit-app')).toHaveLength(1);
        expect(wrapper.emitted('delete-app')).toHaveLength(1);
    });

    it('渲染自定义空状态插槽', () => {
        const wrapper = mount(AppGrid, {
            props: { apps: [], categoryId: 'cat_test' },
            slots: { empty: '<p class="custom-empty">自定义空状态</p>' }
        });

        expect(wrapper.find('.custom-empty').exists()).toBe(true);
        expect(wrapper.text()).toContain('自定义空状态');
    });

    it('拖拽期间排除被拖卡片并在目标位置渲染占位符', async () => {
        const apps = [createApp('app_1'), createApp('app_2'), createApp('app_3')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const cardDrag = useAppCardDrag();
        cardDrag.state.phase = 'dragging';
        cardDrag.state.app = apps[0];
        cardDrag.state.targetCategoryId = 'cat_test';
        cardDrag.state.targetIndex = 1;
        await nextTick();

        // 被拖卡片不再渲染，占位符出现在目标索引位置
        expect(wrapper.findAllComponents(AppCard)).toHaveLength(2);
        const children = wrapper.find('.app-grid').element.children;
        expect(children[1].classList.contains('app-grid__placeholder')).toBe(true);
    });

    it('非落点网格在拖拽期间不渲染占位符', async () => {
        const apps = [createApp('app_1'), createApp('app_2')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const cardDrag = useAppCardDrag();
        cardDrag.state.phase = 'dragging';
        cardDrag.state.app = apps[0];
        cardDrag.state.targetCategoryId = 'cat_other';
        await nextTick();

        expect(wrapper.find('.app-grid__placeholder').exists()).toBe(false);
    });

    it('拖拽刚结束时抑制卡片点击', async () => {
        const apps = [createApp('app_1')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        const cardDrag = useAppCardDrag();
        cardDrag.state.justEnded = true;

        const card = wrapper.findComponent(AppCard);
        await card.vm.$emit('click', apps[0]);

        expect(wrapper.emitted('app-click')).toBeUndefined();
    });
});
