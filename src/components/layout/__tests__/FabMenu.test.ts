import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FabMenu from '@/components/layout/FabMenu.vue';
import type { FabMenuItem } from '@/components/layout/FabMenu.vue';

const items: FabMenuItem[] = [
    { label: '添加网站', icon: 'plus', action: 'add-app' },
    { label: '添加分类', icon: 'folder', action: 'add-category' },
    { divider: true },
    { section: '管理' },
    { label: '导入/导出', icon: 'download', action: 'import-export' }
];

describe('FabMenu', () => {
    it('渲染 FAB 按钮与菜单项', () => {
        const wrapper = mount(FabMenu, {
            props: { items, active: true }
        });
        expect(wrapper.find('.fab-main').exists()).toBe(true);
        const menuItems = wrapper.findAll('.fab-item');
        expect(menuItems).toHaveLength(3);
        expect(wrapper.find('.fab-divider').exists()).toBe(true);
        expect(wrapper.text()).toContain('管理');
    });

    it('点击 FAB 按钮切换展开状态', async () => {
        const wrapper = mount(FabMenu, {
            props: { items, active: false }
        });
        await wrapper.find('.fab-main').trigger('click');
        expect(wrapper.emitted('update:active')?.[0]).toEqual([true]);
    });

    it('点击菜单项触发 select 事件并关闭菜单', async () => {
        const wrapper = mount(FabMenu, {
            props: { items, active: true }
        });
        await wrapper.findAll('.fab-item')[0]?.trigger('click');
        expect(wrapper.emitted('select')).toHaveLength(1);
        expect(wrapper.emitted('select')![0]).toEqual(['add-app']);
        expect(wrapper.emitted('update:active')?.[0]).toEqual([false]);
    });

    it('点击分隔线与分组标题不触发 select', async () => {
        const wrapper = mount(FabMenu, {
            props: { items, active: true }
        });
        await wrapper.find('.fab-divider').trigger('click');
        await wrapper.find('.fab-section-title').trigger('click');
        expect(wrapper.emitted('select')).toBeUndefined();
    });
});
