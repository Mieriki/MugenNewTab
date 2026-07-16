import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ToastContainer from '../ToastContainer.vue';
import { useToast, toast } from '@/composables/useToast';

describe('ToastContainer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        toast.dismissAll();
        vi.clearAllTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        toast.dismissAll();
        vi.clearAllTimers();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('初始状态为空', () => {
        mount(ToastContainer, { attachTo: document.body });
        expect(document.querySelectorAll('.mnt-toast')).toHaveLength(0);
    });

    it('显示 useToast 创建的 Toast', async () => {
        mount(ToastContainer, { attachTo: document.body });
        const { success } = useToast();
        success('操作成功');

        await nextTick();
        const toasts = document.querySelectorAll('.mnt-toast');
        expect(toasts).toHaveLength(1);
        expect(toasts[0].textContent).toContain('操作成功');
        expect(toasts[0].classList.contains('mnt-toast--success')).toBe(true);
    });

    it('点击关闭按钮移除 Toast', async () => {
        mount(ToastContainer, { attachTo: document.body });
        const { show } = useToast();
        show('可关闭');

        await nextTick();
        const closeBtn = document.querySelector('.mnt-toast__close') as HTMLButtonElement;
        expect(closeBtn).not.toBeNull();

        closeBtn.click();
        await nextTick();
        expect(document.querySelectorAll('.mnt-toast')).toHaveLength(0);
    });

    it('Toast 图标使用 SVG 而非 emoji', async () => {
        mount(ToastContainer, { attachTo: document.body });
        const { error } = useToast();
        error('错误信息');

        await nextTick();
        const iconWrapper = document.querySelector('.mnt-toast__icon');
        expect(iconWrapper?.querySelector('.icon-svg')).not.toBeNull();
        expect(document.querySelector('.mnt-toast')?.textContent).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    });

    it('支持位置 prop 类名', () => {
        mount(ToastContainer, {
            props: { position: 'bottom-left' },
            attachTo: document.body,
        });
        const container = document.querySelector('.mnt-toast-container');
        expect(container?.classList.contains('mnt-toast-container--bottom-left')).toBe(true);
    });
});
