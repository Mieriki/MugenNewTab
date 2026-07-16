import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useToast, toast } from '../useToast';

describe('useToast', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        toast.dismissAll();
        vi.clearAllTimers();
    });

    afterEach(() => {
        toast.dismissAll();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('初始状态为空', () => {
        const { toasts, count } = useToast();

        expect(toasts.value).toEqual([]);
        expect(count.value).toBe(0);
    });

    it('show 创建默认 info 类型 Toast', () => {
        const { show, toasts } = useToast();
        const item = show('hello');

        expect(item.message).toBe('hello');
        expect(item.type).toBe('info');
        expect(item.duration).toBe(3000);
        expect(item.closable).toBe(true);
        expect(toasts.value).toHaveLength(1);
        expect(toasts.value[0].id).toBe(item.id);
    });

    it('success/error/warning/info 创建对应类型', () => {
        const { success, error, warning, info, toasts } = useToast();

        success('s');
        error('e');
        warning('w');
        info('i');

        const types = toasts.value.map(t => t.type);
        expect(types).toEqual(['success', 'error', 'warning', 'info']);
    });

    it('支持自定义 duration 与 closable', () => {
        const { show, toasts } = useToast();
        const item = show('custom', { duration: 5000, closable: false });

        expect(item.duration).toBe(5000);
        expect(item.closable).toBe(false);
        expect(toasts.value).toHaveLength(1);
    });

    it('duration 为 0 时不自动关闭', () => {
        const { show, toasts } = useToast();
        show('persistent', { duration: 0 });

        vi.advanceTimersByTime(10000);
        expect(toasts.value).toHaveLength(1);
    });

    it('默认 3000ms 后自动关闭', () => {
        const { show, toasts } = useToast();
        show('auto');

        expect(toasts.value).toHaveLength(1);
        vi.advanceTimersByTime(2999);
        expect(toasts.value).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(toasts.value).toHaveLength(0);
    });

    it('dismiss 手动关闭指定 Toast', () => {
        const { show, dismiss, toasts } = useToast();
        const item = show('close me');

        expect(toasts.value).toHaveLength(1);
        const result = dismiss(item.id);

        expect(result).toBe(true);
        expect(toasts.value).toHaveLength(0);
    });

    it('dismiss 未知 id 返回 false', () => {
        const { dismiss } = useToast();
        expect(dismiss('unknown')).toBe(false);
    });

    it('dismissAll 关闭所有 Toast 并清理定时器', () => {
        const { show, dismissAll, toasts } = useToast();
        show('a');
        show('b', { duration: 0 });
        show('c');

        expect(toasts.value).toHaveLength(3);
        dismissAll();

        expect(toasts.value).toHaveLength(0);
        vi.advanceTimersByTime(10000);
        expect(toasts.value).toHaveLength(0);
    });

    it('最多同时保留 MAX_TOASTS 条非持久化 Toast', () => {
        const { show, toasts } = useToast();

        for (let i = 0; i < 6; i++) {
            show(`toast-${i}`);
        }

        expect(toasts.value).toHaveLength(5);
        expect(toasts.value[0].message).toBe('toast-1');
        expect(toasts.value[4].message).toBe('toast-5');
    });

    it('超出上限时优先移除最早的非持久化 Toast，保留持久化 Toast', () => {
        const { show, toasts } = useToast();

        show('p1', { duration: 0 });
        show('p2', { duration: 0 });
        show('t1');
        show('t2');
        show('t3');

        expect(toasts.value).toHaveLength(5);
        // 再加入一条，应移除最早的非持久化 t1
        show('t4');

        expect(toasts.value).toHaveLength(5);
        const messages = toasts.value.map(t => t.message);
        expect(messages).toContain('p1');
        expect(messages).toContain('p2');
        expect(messages).not.toContain('t1');
        expect(messages).toContain('t4');
    });

    it('对 message 进行 HTML 转义', () => {
        const { show, toasts } = useToast();
        show('<script>alert("xss")');

        expect(toasts.value[0].message).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)'
        );
    });

    it('图标 SVG 不包含 emoji', () => {
        const { createIconSvg, getIconPath } = useToast();

        const svg = createIconSvg('success');
        expect(svg).toContain('<svg');
        expect(svg).toContain('viewBox="0 0 24 24"');
        expect(svg).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);

        expect(getIconPath('error')).toContain('M12 2');
        expect(getIconPath('warning')).toContain('M1 21');
        expect(getIconPath('info')).toContain('M12 2');
    });

    it('toast 全局对象与 useToast 共享同一份状态', () => {
        const { toasts } = useToast();
        const item = toast.success('global');

        expect(toasts.value).toHaveLength(1);
        expect(toasts.value[0].id).toBe(item.id);
    });

    it('定时器在组件卸载后不会导致异常', () => {
        const { show, toasts } = useToast();
        show('will expire');

        // 模拟卸载后仍然推进时间，不应抛出异常
        vi.advanceTimersByTime(3000);
        expect(toasts.value).toHaveLength(0);
    });

    it('success 支持自定义 duration', () => {
        const { success, toasts } = useToast();
        success('fast', 1000);

        vi.advanceTimersByTime(999);
        expect(toasts.value).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(toasts.value).toHaveLength(0);
    });
});
