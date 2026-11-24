/**
 * useSiteActionMenu
 * 站点操作菜单的状态与动作编排，卡片模式与极简模式共用。
 *
 * 菜单本身（定位、键盘导航）由 SiteActionMenu.vue 负责，这里只做三件事：
 * 记录「当前操作哪个站点、弹在哪」，以及把六个动作落到底层数据操作上。
 *
 * 设计要点：
 * - 编辑与删除只向上抛（onEdit / onDelete），删除的确认框由调用方统一处理
 * - 打开 / 复制链接 / 隐藏 / 移动自带 Toast 提示，避免各调用方重复写
 * - 所有动作先关菜单再执行，避免异步期间菜单还挂在屏幕上
 */

import { ref } from 'vue';
import type { AppItem, Category } from '@/types/app';
import { useToast } from '@/composables/useToast';

/** 菜单打开位置（视口坐标） */
export interface SiteMenuPoint {
    x: number;
    y: number;
}

export interface UseSiteActionMenuOptions {
    /** 写入站点字段（分类、隐藏状态等） */
    updateApp: (id: string, patch: Partial<Omit<AppItem, 'id'>>) => Promise<unknown>;
    /** 按 ID 查分类名称，用于移动成功的提示文案 */
    getCategoryById: (id: string) => Category | undefined;
    /** 打开站点链接 */
    openUrl: (url: string) => void;
    /** 编辑站点（由调用方打开编辑弹窗） */
    onEdit: (app: AppItem) => void;
    /** 删除站点（由调用方弹确认框后执行） */
    onDelete: (app: AppItem) => void;
}

export function useSiteActionMenu(options: UseSiteActionMenuOptions) {
    const toast = useToast();

    /** 当前打开菜单的站点（null 表示菜单关闭） */
    const menuApp = ref<AppItem | null>(null);
    /** 菜单期望弹出的视口坐标 */
    const menuPoint = ref<SiteMenuPoint>({ x: 0, y: 0 });

    /** 打开菜单（右键 / 键盘菜单键都走这里） */
    function openMenu(app: AppItem, point: SiteMenuPoint): void {
        menuApp.value = app;
        menuPoint.value = { x: point.x, y: point.y };
    }

    /** 「更多」按钮：把菜单挂在按钮右下角 */
    function openMenuFromButton(app: AppItem, event: MouseEvent): void {
        const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
        openMenu(app, {
            x: rect ? rect.left + rect.width : 0,
            y: rect ? rect.bottom + 4 : 0
        });
    }

    function closeMenu(): void {
        menuApp.value = null;
    }

    function handleMenuOpen(): void {
        const app = menuApp.value;
        closeMenu();
        if (!app?.url) return;
        options.openUrl(app.url);
    }

    async function handleMenuCopyLink(): Promise<void> {
        const app = menuApp.value;
        closeMenu();
        if (!app) return;

        try {
            await navigator.clipboard?.writeText(app.url);
            toast.success('链接已复制');
            return;
        } catch {
            // 剪贴板 API 不可用（未聚焦 / 无权限）时退回临时 textarea 方案
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = app.url;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (!copied) throw new Error('execCommand failed');
            toast.success('链接已复制');
        } catch {
            toast.error('复制失败，请手动复制链接');
        }
    }

    function handleMenuEdit(): void {
        const app = menuApp.value;
        closeMenu();
        if (app) options.onEdit(app);
    }

    function handleMenuDelete(): void {
        const app = menuApp.value;
        closeMenu();
        if (app) options.onDelete(app);
    }

    async function handleMenuToggleHidden(): Promise<void> {
        const app = menuApp.value;
        closeMenu();
        if (!app) return;

        try {
            await options.updateApp(app.id, { hidden: !app.hidden });
            toast.success(app.hidden ? `已取消隐藏「${app.name}」` : `已隐藏「${app.name}」`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '操作失败');
        }
    }

    async function handleMenuMove(categoryId: string): Promise<void> {
        const app = menuApp.value;
        closeMenu();
        if (!app || app.category === categoryId) return;

        try {
            await options.updateApp(app.id, { category: categoryId });
            const target = options.getCategoryById(categoryId);
            toast.success(`已移动到「${target?.name ?? '新分类'}」`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '移动失败');
        }
    }

    return {
        menuApp,
        menuPoint,
        openMenu,
        openMenuFromButton,
        closeMenu,
        handleMenuOpen,
        handleMenuCopyLink,
        handleMenuEdit,
        handleMenuDelete,
        handleMenuToggleHidden,
        handleMenuMove
    };
}
