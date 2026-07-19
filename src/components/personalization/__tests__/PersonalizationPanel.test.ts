import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PersonalizationPanel from '@/components/personalization/PersonalizationPanel.vue';

const themesConfig = {
    defaultTheme: 'material-rose',
    themes: [
        {
            id: 'material-rose',
            name: 'Mugen娘经典',
            description: '',
            logo: '',
            isDark: false,
            colors: {
                '--md-sys-color-primary': '#B14A6B',
                '--md-sys-color-primary-container': '#FFD8E1',
                '--md-sys-color-secondary': '#7D5F65',
                '--md-sys-color-secondary-container': '#FFD8E1',
                '--md-sys-color-surface': '#FFF8F9',
                '--md-sys-color-surface-variant': '#F3DDE2',
                '--md-sys-color-on-primary': '#FFFFFF',
                '--md-sys-color-on-surface': '#201A1A',
                '--md-sys-color-on-surface-variant': '#534345'
            }
        }
    ]
};

function cleanupTeleports(): void {
    document.body
        .querySelectorAll('.personalization-panel-wrapper')
        .forEach((el) => el.remove());
}

describe('PersonalizationPanel', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify(themesConfig)))
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        cleanupTeleports();
    });

    it('关闭时不渲染内容', () => {
        mount(PersonalizationPanel, {
            props: { modelValue: false, autoInit: false }
        });

        expect(document.body.querySelector('.personalization-dropdown')).toBeNull();
    });

    it('打开时渲染主题与壁纸子面板', async () => {
        mount(PersonalizationPanel, {
            props: { modelValue: true, autoInit: false }
        });

        await flushPromises();

        const dropdown = document.body.querySelector('.personalization-dropdown');
        expect(dropdown).not.toBeNull();
        expect(dropdown!.querySelector('.theme-selector')).not.toBeNull();
        expect(dropdown!.querySelector('.wallpaper-settings')).not.toBeNull();
    });

    it('点击遮罩层触发 update:modelValue 与 close', async () => {
        const wrapper = mount(PersonalizationPanel, {
            props: { modelValue: true, autoInit: false }
        });

        await flushPromises();

        const overlay = document.body.querySelector('.personalization-overlay');
        expect(overlay).not.toBeNull();
        await overlay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});
