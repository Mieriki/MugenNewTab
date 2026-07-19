import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import AppGrid from '@/components/app/AppGrid.vue';
import AppCard from '@/components/app/AppCard.vue';
import { useAppCardDrag } from '@/composables/useAppCardDrag';
import { useLayoutStore } from '@/stores/layout.store';
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
    beforeEach(() => {
        setActivePinia(createPinia());
    });

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

    it('默认不设置内联列样式，设置列数后应用内联网格模板', async () => {
        const apps = [createApp('app_1')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });

        expect(wrapper.find('.app-grid').attributes('style') ?? '').not.toContain('grid-template-columns');

        const layoutStore = useLayoutStore();
        layoutStore.columns = 4;
        await nextTick();

        expect(wrapper.find('.app-grid').attributes('style')).toContain('repeat(4, minmax(0, 1fr))');
    });

    it('开启分页后按页大小切片并显示分页条', async () => {
        const layoutStore = useLayoutStore();
        layoutStore.paginate = true;
        layoutStore.pageSize = 2;

        const apps = [createApp('app_1'), createApp('app_2'), createApp('app_3')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });
        await nextTick();

        // 第一页 2 张卡片，分页条显示 1 / 2
        expect(wrapper.findAllComponents(AppCard)).toHaveLength(2);
        expect(wrapper.find('.app-grid__pager-info').text()).toBe('1 / 2');

        // 下一页显示剩余 1 张
        const buttons = wrapper.findAll('.app-grid__pager-btn');
        await buttons[1].trigger('click');
        expect(wrapper.findAllComponents(AppCard)).toHaveLength(1);
        expect(wrapper.find('.app-grid__pager-info').text()).toBe('2 / 2');

        // 回到上一页
        await buttons[0].trigger('click');
        expect(wrapper.findAllComponents(AppCard)).toHaveLength(2);
        expect(wrapper.find('.app-grid__pager-info').text()).toBe('1 / 2');
    });

    it('页数不足时不显示分页条', async () => {
        const layoutStore = useLayoutStore();
        layoutStore.paginate = true;
        layoutStore.pageSize = 10;

        const apps = [createApp('app_1'), createApp('app_2')];
        const wrapper = mount(AppGrid, {
            props: { apps, categoryId: 'cat_test' }
        });
        await nextTick();

        expect(wrapper.findAllComponents(AppCard)).toHaveLength(2);
        expect(wrapper.find('.app-grid__pager').exists()).toBe(false);
    });
});
