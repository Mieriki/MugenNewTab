import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import HiddenTipModal from '../HiddenTipModal.vue';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';

describe('HiddenTipModal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.body.style.overflow = '';
        vi.restoreAllMocks();
    });

    function mountModal(modelValue = true) {
        return mount(HiddenTipModal, {
            props: { modelValue },
            attachTo: document.body,
        });
    }

    it('渲染说明文案、「不再提示」复选框与确认按钮', () => {
        mountModal();

        const tip = document.querySelector('.hidden-tip');
        expect(tip).not.toBeNull();
        expect(tip?.textContent).toContain('双击页面左上角的 Logo 图标');
        expect(tip?.textContent).toContain('Alt');
        expect(tip?.textContent).toContain('不再提示');
        expect(document.querySelector('.hidden-tip__checkbox input[type="checkbox"]')).not.toBeNull();

        const okBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('我知道了')
        );
        expect(okBtn).not.toBeUndefined();
    });

    it('点击「我知道了」关闭弹窗', async () => {
        const wrapper = mountModal();

        const okBtn = Array.from(document.querySelectorAll('.mnt-base-button')).find(
            (btn) => btn.textContent?.includes('我知道了')
        ) as HTMLButtonElement;
        okBtn.click();
        await flushPromises();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('未勾选「不再提示」时关闭不写入存储', async () => {
        const setSpy = vi.spyOn(storageManager, 'set').mockResolvedValue(undefined);
        const wrapper = mountModal();

        await wrapper.setProps({ modelValue: false });
        await flushPromises();

        expect(setSpy).not.toHaveBeenCalled();
    });

    it('勾选「不再提示」后关闭时写入存储并重置勾选状态', async () => {
        const setSpy = vi.spyOn(storageManager, 'set').mockResolvedValue(undefined);
        const wrapper = mountModal();

        const checkbox = document.querySelector('.hidden-tip__checkbox input[type="checkbox"]') as HTMLInputElement;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        await flushPromises();

        await wrapper.setProps({ modelValue: false });
        await flushPromises();

        expect(setSpy).toHaveBeenCalledWith(STORAGE_KEYS.HIDDEN_TIP_DISMISSED, true);
        expect(checkbox.checked).toBe(false);
    });
});
