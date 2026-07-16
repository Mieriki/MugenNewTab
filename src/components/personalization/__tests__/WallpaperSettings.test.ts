import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WallpaperSettings from '@/components/personalization/WallpaperSettings.vue';

describe('WallpaperSettings', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('渲染标题、预设壁纸、输入框与滑块', () => {
        const wrapper = mount(WallpaperSettings, {
            props: { autoInit: false }
        });

        expect(wrapper.text()).toContain('壁纸背景');
        expect(wrapper.findAll('.wallpaper-preset')).toHaveLength(4);
        expect(wrapper.find('.wallpaper-url .mnt-base-input').exists()).toBe(true);
        expect(wrapper.findAll('.mnt-base-slider')).toHaveLength(3);
        expect(wrapper.findAll('.wallpaper-actions .mnt-base-button')).toHaveLength(2);
    });

    it('点击预设壁纸触发 change 事件', async () => {
        const wrapper = mount(WallpaperSettings, {
            props: { autoInit: false }
        });

        const presets = wrapper.findAll('.wallpaper-preset');
        await presets[0].trigger('click');
        await flushPromises();

        expect(wrapper.emitted('change')).toHaveLength(1);
    });

    it('重置壁纸触发 change 事件', async () => {
        const wrapper = mount(WallpaperSettings, {
            props: { autoInit: false }
        });

        const buttons = wrapper.findAll('.wallpaper-actions .mnt-base-button');
        const resetButton = buttons.find((btn) => btn.text().includes('重置'));
        expect(resetButton).toBeDefined();

        await resetButton!.trigger('click');
        await flushPromises();

        expect(wrapper.emitted('change')).toHaveLength(1);
    });
});
