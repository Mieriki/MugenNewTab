/**
 * useSiteActionMenu 单元测试
 *
 * 覆盖菜单开关状态与六个动作：打开 / 复制链接 / 编辑 / 删除 / 隐藏 / 移动。
 * 编辑与删除只向上抛（确认框由调用方处理），其余动作自带 Toast 提示。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSiteActionMenu } from '@/composables/useSiteActionMenu';
import { useToast } from '@/composables/useToast';
import type { AppItem, Category } from '@/types/app';

vi.mock('@/composables/useToast');

const categories: Category[] = [
    { id: 'dev', name: '开发工具' },
    { id: 'media', name: '娱乐媒体' },
];

function createApp(overrides: Partial<AppItem> = {}): AppItem {
    return {
        id: 'app_1',
        name: 'GitHub',
        url: 'https://github.com',
        category: 'dev',
        ...overrides
    };
}

function setup(overrides: Partial<Parameters<typeof useSiteActionMenu>[0]> = {}) {
    const updateApp = vi.fn(async () => null);
    const openUrl = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    const menu = useSiteActionMenu({
        updateApp,
        getCategoryById: (id) => categories.find((item) => item.id === id),
        openUrl,
        onEdit,
        onDelete,
        ...overrides
    });

    return { menu, updateApp, openUrl, onEdit, onDelete };
}

describe('useSiteActionMenu', () => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useToast).mockReturnValue(toast as unknown as ReturnType<typeof useToast>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('默认关闭，openMenu 后记录站点与坐标', () => {
        const { menu } = setup();
        expect(menu.menuApp.value).toBeNull();

        const app = createApp();
        menu.openMenu(app, { x: 12, y: 34 });

        expect(menu.menuApp.value).toMatchObject({ id: app.id });
        expect(menu.menuPoint.value).toEqual({ x: 12, y: 34 });

        menu.closeMenu();
        expect(menu.menuApp.value).toBeNull();
    });

    it('openMenuFromButton 把菜单挂在按钮右下角', () => {
        const { menu } = setup();
        const app = createApp();

        const button = document.createElement('button');
        document.body.appendChild(button);
        button.getBoundingClientRect = () => ({
            left: 100, top: 50, width: 24, height: 24,
            right: 124, bottom: 74, x: 100, y: 50, toJSON: () => ({})
        });

        menu.openMenuFromButton(app, { currentTarget: button } as unknown as MouseEvent);

        expect(menu.menuPoint.value).toEqual({ x: 124, y: 78 });
        document.body.removeChild(button);
    });

    it('handleMenuOpen 打开链接并关闭菜单', () => {
        const { menu, openUrl } = setup();
        const app = createApp();
        menu.openMenu(app, { x: 0, y: 0 });

        menu.handleMenuOpen();

        expect(openUrl).toHaveBeenCalledWith(app.url);
        expect(menu.menuApp.value).toBeNull();
    });

    it('handleMenuCopyLink 复制链接并提示', async () => {
        const { menu } = setup();
        const app = createApp();
        const writeText = vi.fn(async () => undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        menu.openMenu(app, { x: 0, y: 0 });
        await menu.handleMenuCopyLink();

        expect(writeText).toHaveBeenCalledWith(app.url);
        expect(toast.success).toHaveBeenCalledWith('链接已复制');
    });

    it('handleMenuEdit 与 handleMenuDelete 只向上抛，不改数据', () => {
        const { menu, onEdit, onDelete, updateApp } = setup();
        const app = createApp();

        menu.openMenu(app, { x: 0, y: 0 });
        menu.handleMenuEdit();
        expect(onEdit).toHaveBeenCalledWith(app);

        menu.openMenu(app, { x: 0, y: 0 });
        menu.handleMenuDelete();
        expect(onDelete).toHaveBeenCalledWith(app);

        expect(updateApp).not.toHaveBeenCalled();
        expect(menu.menuApp.value).toBeNull();
    });

    it('handleMenuToggleHidden 写入 hidden 并提示', async () => {
        const { menu, updateApp } = setup();
        const app = createApp({ hidden: false });

        menu.openMenu(app, { x: 0, y: 0 });
        await menu.handleMenuToggleHidden();

        expect(updateApp).toHaveBeenCalledWith(app.id, { hidden: true });
        expect(toast.success).toHaveBeenCalledWith('已隐藏「GitHub」');
    });

    it('handleMenuToggleHidden 对已隐藏站点改为取消隐藏', async () => {
        const { menu, updateApp } = setup();
        const app = createApp({ hidden: true });

        menu.openMenu(app, { x: 0, y: 0 });
        await menu.handleMenuToggleHidden();

        expect(updateApp).toHaveBeenCalledWith(app.id, { hidden: false });
        expect(toast.success).toHaveBeenCalledWith('已取消隐藏「GitHub」');
    });

    it('handleMenuMove 写入分类并用分类名提示', async () => {
        const { menu, updateApp } = setup();
        const app = createApp({ category: 'dev' });

        menu.openMenu(app, { x: 0, y: 0 });
        await menu.handleMenuMove('media');

        expect(updateApp).toHaveBeenCalledWith(app.id, { category: 'media' });
        expect(toast.success).toHaveBeenCalledWith('已移动到「娱乐媒体」');
    });

    it('handleMenuMove 选择当前分类时不写入', async () => {
        const { menu, updateApp } = setup();
        const app = createApp({ category: 'dev' });

        menu.openMenu(app, { x: 0, y: 0 });
        await menu.handleMenuMove('dev');

        expect(updateApp).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('写入失败时用错误信息提示', async () => {
        const updateApp = vi.fn(async () => {
            throw new Error('存储写入失败');
        });
        const { menu } = setup({ updateApp });
        const app = createApp();

        menu.openMenu(app, { x: 0, y: 0 });
        await menu.handleMenuToggleHidden();

        expect(toast.error).toHaveBeenCalledWith('存储写入失败');
    });
});
