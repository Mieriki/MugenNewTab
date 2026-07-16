import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WallpaperLayer from '@/components/layout/WallpaperLayer.vue';

describe('WallpaperLayer', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('渲染壁纸层与遮罩层', () => {
        const wrapper = mount(WallpaperLayer);
        expect(wrapper.find('.wallpaper-layer').exists()).toBe(true);
        expect(wrapper.find('.wallpaper-overlay').exists()).toBe(true);
    });
});
