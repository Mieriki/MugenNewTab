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

        const sliders = wrapper.findAll('.mnt-base-slider');
        expect(sliders).toHaveLength(4);
        expect(sliders[0].text()).toContain('卡片不透明度');
        expect(sliders[1].text()).toContain('磨砂程度');
        expect(sliders[2].text()).toContain('圆角');
        expect(sliders[3].text()).toContain('阴影强度');

        expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
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

        const checkbox = wrapper.find('input[type="checkbox"]');
        await checkbox.setValue(false);
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
