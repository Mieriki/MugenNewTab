/**
 * CardStyleSettings 组件测试
 *
 * 覆盖四个滑块 / 描边开关 / 恢复默认的渲染与交互。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CardStyleSettings from '@/components/personalization/CardStyleSettings.vue';
import { useCardStyleStore } from '@/stores/cardStyle.store';
import { storageManager } from '@/services/storage.service';

function mountSettings() {
    return mount(CardStyleSettings);
}

describe('CardStyleSettings', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
        document.documentElement.removeAttribute('style');
        vi.spyOn(storageManager, 'get').mockResolvedValue(null);
        vi.spyOn(storageManager, 'set').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.documentElement.removeAttribute('style');
        document.body.innerHTML = '';
    });

    it('渲染四个滑块、描边开关与恢复默认按钮', async () => {
        const wrapper = mountSettings();
        await flushPromises();

        // 滑杆不再自带标签（标签交给设置行），改为通过 aria-label 定位
        const sliders = wrapper.findAll('.mnt-base-slider');
        expect(sliders).toHaveLength(4);
        expect(wrapper.findAll('.settings-row__label').map((row) => row.text())).toEqual(
            expect.arrayContaining(['卡片不透明度', '磨砂程度', '圆角', '阴影强度'])
        );

        // 描边开关改用 BaseSwitch（role="switch"），不再是原生 checkbox
        const switchEl = wrapper.find('[role="switch"]');
        expect(switchEl.exists()).toBe(true);
        expect(switchEl.attributes('aria-label')).toBe('显示卡片描边');
        expect(wrapper.text()).toContain('恢复默认');
    });

    it('拖动不透明度滑块后写入 store（按百分比换算成 0-1）', async () => {
        const wrapper = mountSettings();
        await flushPromises();

        const input = wrapper.findAll('.mnt-base-slider__input')[0];
        await input.setValue('40');
        await input.trigger('change');
        await flushPromises();

        const store = useCardStyleStore();
        expect(store.opacity).toBeCloseTo(0.4);
        expect(storageManager.set).toHaveBeenCalledWith(
            'appNavigator_cardStyle',
            expect.objectContaining({ opacity: 0.4 })
        );
    });

    it('切换描边开关写入 store', async () => {
        const wrapper = mountSettings();
        await flushPromises();

        // BaseSwitch 通过点击切换，不再依赖原生 checkbox 的 setValue
        await wrapper.find('[role="switch"]').trigger('click');
        await flushPromises();

        const store = useCardStyleStore();
        expect(store.bordered).toBe(false);
    });

    it('点击恢复默认后回到默认值', async () => {
        const store = useCardStyleStore();
        await store.setRadius(2);
        await store.setOpacity(0.1);

        const wrapper = mountSettings();
        await flushPromises();

        const resetButton = wrapper
            .findAll('button')
            .find((button) => button.text().includes('恢复默认'));
        expect(resetButton).toBeTruthy();
        await resetButton!.trigger('click');
        await flushPromises();

        expect(store.radius).toBe(12);
        expect(store.opacity).toBeCloseTo(0.78);
    });
});
