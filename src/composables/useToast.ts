/**
 * 全局 Toast 通知能力
 *
 * 设计为单例控制器，通过 useToast()  composable 暴露给组件使用。
 * 支持在组件树内外调用（services、utils、事件回调等），因此采用全局共享实例
 * 而非 provide/inject，避免跨调用栈传递注入链。
 *
 * 与原项目 js/inline-scripts.js 中 showToast 行为保持一致：
 * - 默认自动关闭（duration 3000ms）
 * - 支持 success / error / warning / info 四种类型
 * - 多条 Toast 可同时存在，按出现顺序排列
 */

import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import { generateId } from '@/utils/id.util';
import { escapeHtml } from '@/utils/escape.util';

/** Toast 类型 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Toast 配置项 */
export interface ToastOptions {
    /** 提示类型，默认为 info */
    type?: ToastType;
    /** 自动关闭时间（毫秒）。设置为 0 表示不自动关闭 */
    duration?: number;
    /** 是否显示手动关闭按钮，默认 true */
    closable?: boolean;
}

/** Toast 数据项 */
export interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
    closable: boolean;
    createdAt: number;
}

/** 默认自动关闭时间 */
const DEFAULT_DURATION = 3000;

/** 同时存在的最大 Toast 数量，超过时移除最早的非持久化 Toast */
const MAX_TOASTS = 5;

/** 各类型对应的 SVG 图标 path（Material Design 风格，24x24 viewBox） */
const TYPE_ICONS: Record<ToastType, string> = {
    success:
        'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    error:
        'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    warning:
        'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    info:
        'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
};

/** Toast 控制器 */
class ToastController {
    private toasts = ref<ToastItem[]>([]);
    private timers = new Map<string, number>();

    /** 当前所有 Toast 列表（只读） */
    public readonly list = readonly(this.toasts);

    /** 当前 Toast 数量 */
    public readonly count = computed(() => this.toasts.value.length);

    /** 创建并显示一条 Toast */
    public show(message: string, options: ToastOptions = {}): ToastItem {
        const safeMessage = escapeHtml(message);
        const type = options.type ?? 'info';
        const duration = options.duration ?? DEFAULT_DURATION;
        const closable = options.closable ?? true;

        const toast: ToastItem = {
            id: generateId(),
            message: safeMessage,
            type,
            duration,
            closable,
            createdAt: Date.now(),
        };

        this.trimExcess();
        this.toasts.value.push(toast);

        if (duration > 0) {
            this.scheduleDismiss(toast.id, duration);
        }

        return toast;
    }

    /** 显示成功类型 Toast */
    public success(message: string, duration?: number): ToastItem {
        return this.show(message, { type: 'success', duration });
    }

    /** 显示错误类型 Toast */
    public error(message: string, duration?: number): ToastItem {
        return this.show(message, { type: 'error', duration });
    }

    /** 显示警告类型 Toast */
    public warning(message: string, duration?: number): ToastItem {
        return this.show(message, { type: 'warning', duration });
    }

    /** 显示信息类型 Toast */
    public info(message: string, duration?: number): ToastItem {
        return this.show(message, { type: 'info', duration });
    }

    /** 手动关闭指定 Toast */
    public dismiss(id: string): boolean {
        const index = this.toasts.value.findIndex(t => t.id === id);
        if (index === -1) {
            return false;
        }

        this.clearTimer(id);
        this.toasts.value.splice(index, 1);
        return true;
    }

    /** 关闭所有 Toast */
    public dismissAll(): void {
        this.timers.forEach((_, id) => this.clearTimer(id));
        this.toasts.value = [];
    }

    /** 获取某类型的 SVG path */
    public getIconPath(type: ToastType): string {
        return TYPE_ICONS[type];
    }

    /** 生成标准 Toast 图标 SVG HTML 字符串 */
    public createIconSvg(type: ToastType, size = 20): string {
        const path = this.getIconPath(type);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
    }

    /** 当数量超过上限时，移除最早的非持久化 Toast */
    private trimExcess(): void {
        const nonPersistent = this.toasts.value.filter(t => t.duration > 0);
        if (this.toasts.value.length < MAX_TOASTS) {
            return;
        }

        const overflow = this.toasts.value.length - MAX_TOASTS + 1;
        let removed = 0;
        for (const toast of nonPersistent) {
            if (removed >= overflow) {
                break;
            }
            if (this.dismiss(toast.id)) {
                removed++;
            }
        }
    }

    /** 调度自动关闭定时器 */
    private scheduleDismiss(id: string, duration: number): void {
        this.clearTimer(id);
        const timer = window.setTimeout(() => {
            this.timers.delete(id);
            this.dismiss(id);
        }, duration);
        this.timers.set(id, timer);
    }

    /** 清理指定定时器 */
    private clearTimer(id: string): void {
        const timer = this.timers.get(id);
        if (timer !== undefined) {
            window.clearTimeout(timer);
            this.timers.delete(id);
        }
    }
}

/** 全局单例 */
let globalController: ToastController | null = null;

function getController(): ToastController {
    if (!globalController) {
        globalController = new ToastController();
    }
    return globalController;
}

/**
 * Toast composable
 *
 * 返回全局共享的 Toast 控制器实例，组件可直接调用 show / success / error 等方法。
 * 由于使用单例，多个组件共享同一份 Toast 列表与状态。
 */
export function useToast() {
    const controller = getController();

    // 仅在组件 setup 内部注册生命周期钩子；在测试或 services 中直接调用时跳过，
    // 避免 Vue 的“无 active component instance”警告。
    if (getCurrentInstance()) {
        onUnmounted(() => {
            // 组件卸载时不销毁单例，仅标记本组件不再持有引用。
            // 定时器由控制器内部统一管理，随 Toast 自动关闭或 dismissAll 而释放。
        });
    }

    return {
        toasts: controller.list,
        count: controller.count,
        show: controller.show.bind(controller),
        success: controller.success.bind(controller),
        error: controller.error.bind(controller),
        warning: controller.warning.bind(controller),
        info: controller.info.bind(controller),
        dismiss: controller.dismiss.bind(controller),
        dismissAll: controller.dismissAll.bind(controller),
        getIconPath: controller.getIconPath.bind(controller),
        createIconSvg: controller.createIconSvg.bind(controller),
    };
}

/** 全局直接调用入口，供非组件上下文（services、事件处理等）使用 */
export const toast = {
    show: (message: string, options?: ToastOptions) => getController().show(message, options),
    success: (message: string, duration?: number) => getController().success(message, duration),
    error: (message: string, duration?: number) => getController().error(message, duration),
    warning: (message: string, duration?: number) => getController().warning(message, duration),
    info: (message: string, duration?: number) => getController().info(message, duration),
    dismiss: (id: string) => getController().dismiss(id),
    dismissAll: () => getController().dismissAll(),
    getIconPath: (type: ToastType) => getController().getIconPath(type),
    createIconSvg: (type: ToastType, size?: number) => getController().createIconSvg(type, size),
};

export type UseToastReturn = ReturnType<typeof useToast>;
