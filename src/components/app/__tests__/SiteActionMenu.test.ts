import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import SiteActionMenu from '../SiteActionMenu.vue';
import type { AppItem, Category } from '@/types/app';

const categories: Category[] = [
    { id: 'dev', name: '开发工具' },
    { id: 'media', name: '娱乐媒体' },
];

const app: AppItem = {
    id: 'app_1',
    name: 'Bilibili',
    url: 'https://www.bilibili.com',
    category: 'dev',
    icon: 'https://www.bilibili.com/favicon.ico',
};

function mountMenu(overrides: Partial<{ app: AppItem; categories: Category[]; x: number; y: number }> = {}) {
    return mount(SiteActionMenu, {
        props: {
            app,
            categories,
            x: 100,
            y: 120,
            ...overrides,
        },
        attachTo: document.body,
    });
}

function findItemByLabel(wrapper: ReturnType<typeof mountMenu>, label: string) {
    return wrapper
        .findAll('.site-menu__item')
        .find((item) => item.text().includes(label));
}

describe('SiteActionMenu', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    it('渲染站点名称、域名与全部操作项', () => {
        const wrapper = mountMenu();

        expect(wrapper.find('.site-menu__header-name').text()).toBe('Bilibili');
        expect(wrapper.find('.site-menu__header-host').text()).toBe('bilibili.com');

        const labels = wrapper.findAll('.site-menu__item').map((item) => item.text());
        expect(labels.some((text) => text.includes('打开'))).toBe(true);
        expect(labels.some((text) => text.includes('复制链接'))).toBe(true);
        expect(labels.some((text) => text.includes('编辑'))).toBe(true);
        expect(labels.some((text) => text.includes('移动到分类'))).toBe(true);
        expect(labels.some((text) => text.includes('隐藏此站点'))).toBe(true);
        expect(labels.some((text) => text.includes('删除'))).toBe(true);

        wrapper.unmount();
    });

    it('点击操作项触发对应事件', async () => {
        const wrapper = mountMenu();

        await findItemByLabel(wrapper, '打开')!.trigger('click');
        await findItemByLabel(wrapper, '复制链接')!.trigger('click');
        await findItemByLabel(wrapper, '编辑')!.trigger('click');
        await findItemByLabel(wrapper, '隐藏此站点')!.trigger('click');
        await findItemByLabel(wrapper, '删除')!.trigger('click');

        expect(wrapper.emitted('open')).toHaveLength(1);
        expect(wrapper.emitted('copy-link')).toHaveLength(1);
        expect(wrapper.emitted('edit')).toHaveLength(1);
        expect(wrapper.emitted('toggle-hidden')).toHaveLength(1);
        expect(wrapper.emitted('delete')).toHaveLength(1);

        wrapper.unmount();
    });

    it('隐藏站点显示「已隐藏」徽标，操作项变为取消隐藏', () => {
        const wrapper = mountMenu({ app: { ...app, hidden: true } });

        expect(wrapper.find('.site-menu__badge').text()).toBe('已隐藏');
        expect(findItemByLabel(wrapper, '取消隐藏')).toBeTruthy();
        expect(findItemByLabel(wrapper, '隐藏此站点')).toBeUndefined();

        wrapper.unmount();
    });

    it('展开分类列表后点击其他分类触发 move，当前分类不可点', async () => {
        const wrapper = mountMenu();

        expect(wrapper.find('.site-menu__sublist').exists()).toBe(false);

        await findItemByLabel(wrapper, '移动到分类')!.trigger('click');

        const subItems = wrapper.findAll('.site-menu__item--sub');
        expect(subItems).toHaveLength(2);

        const current = subItems.find((item) => item.text().includes('开发工具'))!;
        const other = subItems.find((item) => item.text().includes('娱乐媒体'))!;

        expect(current.classes()).toContain('is-current');
        expect((current.element as HTMLButtonElement).disabled).toBe(true);

        await other.trigger('click');
        expect(wrapper.emitted('move')).toEqual([['media']]);

        wrapper.unmount();
    });

    it('Escape 关闭菜单', async () => {
        const wrapper = mountMenu();

        wrapper.find('.site-menu').element.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );

        expect(wrapper.emitted('close')).toHaveLength(1);

        wrapper.unmount();
    });

    it('菜单外部按下关闭，内部按下不关闭', () => {
        const wrapper = mountMenu();

        wrapper.find('.site-menu__label').element.dispatchEvent(
            new Event('pointerdown', { bubbles: true })
        );
        expect(wrapper.emitted('close')).toBeUndefined();

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(wrapper.emitted('close')).toHaveLength(1);

        wrapper.unmount();
    });

    it('方向键在操作项之间移动焦点', () => {
        const wrapper = mountMenu();
        const menuEl = wrapper.find('.site-menu').element;
        const items = wrapper.findAll('.site-menu__item');

        function press(key: string): void {
            menuEl.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        }

        (items[0].element as HTMLButtonElement).focus();
        press('ArrowDown');
        expect(document.activeElement).toBe(items[1].element);

        press('ArrowUp');
        expect(document.activeElement).toBe(items[0].element);

        press('End');
        expect(document.activeElement).toBe(items[items.length - 1].element);

        press('Home');
        expect(document.activeElement).toBe(items[0].element);

        wrapper.unmount();
    });

    it('卸载后不再响应外部点击', () => {
        const wrapper = mountMenu();
        wrapper.unmount();

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(wrapper.emitted('close')).toBeUndefined();
    });
});
