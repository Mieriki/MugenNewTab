import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ThemeSelector from '@/components/personalization/ThemeSelector.vue';

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
        },
        {
            id: 'midnight-rose',
            name: '午夜蔷薇',
            description: '',
            logo: '',
            isDark: true,
            colors: {
                '--md-sys-color-primary': '#FFB3C5',
                '--md-sys-color-primary-container': '#5C1133',
                '--md-sys-color-secondary': '#E6BEC6',
                '--md-sys-color-secondary-container': '#4A3E41',
                '--md-sys-color-surface': '#201A1A',
                '--md-sys-color-surface-variant': '#534345',
                '--md-sys-color-on-primary': '#3D001F',
                '--md-sys-color-on-surface': '#F3DDE2',
                '--md-sys-color-on-surface-variant': '#D3C2C5'
            }
        }
    ]
};

describe('ThemeSelector', () => {
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
    });

    it('渲染标题与主题列表', async () => {
        const wrapper = mount(ThemeSelector, {
            props: { autoInit: true }
        });

        await flushPromises();

        expect(wrapper.text()).toContain('主题配色');
        const options = wrapper.findAll('.theme-option');
        expect(options).toHaveLength(2);
        expect(options[0].text()).toContain('Mugen娘经典');
        expect(options[1].text()).toContain('午夜蔷薇');
    });

    it('点击主题切换并触发事件', async () => {
        const wrapper = mount(ThemeSelector, {
            props: { autoInit: true }
        });

        await flushPromises();

        const options = wrapper.findAll('.theme-option');
        await options[1].trigger('click');
        await flushPromises();

        expect(wrapper.emitted('select-theme')).toHaveLength(1);
        expect(wrapper.emitted('select-theme')![0]).toEqual(['midnight-rose']);
    });

    it('当前主题带有 active 类', async () => {
        const wrapper = mount(ThemeSelector, {
            props: { autoInit: true }
        });

        await flushPromises();

        const active = wrapper.findAll('.theme-option.active');
        expect(active).toHaveLength(1);
        expect(active[0].text()).toContain('Mugen娘经典');
    });
});
