import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ThemeSelector from '@/components/personalization/ThemeSelector.vue';

/** 两个主题族，每族明/暗各一个变体 */
const themesConfig = {
    defaultTheme: 'material-rose-light',
    themes: [
        {
            id: 'material-rose-light',
            family: 'material-rose',
            mode: 'light',
            isDark: false,
            name: 'Mugen娘经典',
            description: '温柔玫粉',
            logo: '',
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
            id: 'material-rose-dark',
            family: 'material-rose',
            mode: 'dark',
            isDark: true,
            name: 'Mugen娘经典',
            description: '温柔玫粉',
            logo: '',
            colors: {
                '--md-sys-color-primary': '#E8A2B4',
                '--md-sys-color-primary-container': '#58323E',
                '--md-sys-color-secondary': '#C1AEB2',
                '--md-sys-color-secondary-container': '#534144',
                '--md-sys-color-surface': '#1D191A',
                '--md-sys-color-surface-variant': '#312B2D',
                '--md-sys-color-on-primary': '#3A2229',
                '--md-sys-color-on-surface': '#EEECED',
                '--md-sys-color-on-surface-variant': '#BBB4B6'
            }
        },
        {
            id: 'midnight-rose-light',
            family: 'midnight-rose',
            mode: 'light',
            isDark: false,
            name: '午夜蔷薇',
            description: '深邃红与黑',
            logo: '',
            colors: {
                '--md-sys-color-primary': '#B3261E',
                '--md-sys-color-primary-container': '#F9DEDC',
                '--md-sys-color-secondary': '#775652',
                '--md-sys-color-secondary-container': '#FFDAD6',
                '--md-sys-color-surface': '#FFF8F8',
                '--md-sys-color-surface-variant': '#F5DDDA',
                '--md-sys-color-on-primary': '#FFFFFF',
                '--md-sys-color-on-surface': '#1A1110',
                '--md-sys-color-on-surface-variant': '#534341'
            }
        },
        {
            id: 'midnight-rose-dark',
            family: 'midnight-rose',
            mode: 'dark',
            isDark: true,
            name: '午夜蔷薇',
            description: '深邃红与黑',
            logo: '',
            colors: {
                '--md-sys-color-primary': '#FFB4AB',
                '--md-sys-color-primary-container': '#93000A',
                '--md-sys-color-secondary': '#E7BDB8',
                '--md-sys-color-secondary-container': '#5D3F3C',
                '--md-sys-color-surface': '#1A1110',
                '--md-sys-color-surface-variant': '#534341',
                '--md-sys-color-on-primary': '#690005',
                '--md-sys-color-on-surface': '#F1DEDC',
                '--md-sys-color-on-surface-variant': '#D8C2BF'
            }
        }
    ]
};

function mountSelector() {
    return mount(ThemeSelector, { props: { autoInit: true } });
}

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

    it('渲染标题与主题族列表（明暗变体合并为一项）', async () => {
        const wrapper = mountSelector();

        await flushPromises();

        expect(wrapper.text()).toContain('主题配色');
        const options = wrapper.findAll('.theme-option');
        expect(options).toHaveLength(2);
        expect(options[0].text()).toContain('Mugen娘经典');
        expect(options[1].text()).toContain('午夜蔷薇');
    });

    it('渲染明/暗模式开关，默认高亮明亮', async () => {
        const wrapper = mountSelector();

        await flushPromises();

        const modeButtons = wrapper.findAll('.theme-mode__btn');
        expect(modeButtons).toHaveLength(2);
        expect(modeButtons[0].text()).toContain('明亮');
        expect(modeButtons[1].text()).toContain('深色');
        expect(modeButtons[0].classes()).toContain('active');
        expect(modeButtons[1].classes()).not.toContain('active');
    });

    it('点击深色开关应切换到当前族的深色变体并触发事件', async () => {
        const wrapper = mountSelector();

        await flushPromises();

        await wrapper.findAll('.theme-mode__btn')[1].trigger('click');
        await flushPromises();

        expect(wrapper.emitted('select-mode')).toHaveLength(1);
        expect(wrapper.emitted('select-mode')![0]).toEqual(['dark']);
        expect(wrapper.emitted('select-theme')![0]).toEqual(['material-rose-dark']);

        const modeButtons = wrapper.findAll('.theme-mode__btn');
        expect(modeButtons[1].classes()).toContain('active');
        // 切模式不换族，列表里的 active 仍停在同一个主题族
        const active = wrapper.findAll('.theme-option.active');
        expect(active).toHaveLength(1);
        expect(active[0].text()).toContain('Mugen娘经典');
    });

    it('点击主题族切换并触发事件（沿用当前明暗模式）', async () => {
        const wrapper = mountSelector();

        await flushPromises();

        await wrapper.findAll('.theme-option')[1].trigger('click');
        await flushPromises();

        expect(wrapper.emitted('select-theme')).toHaveLength(1);
        expect(wrapper.emitted('select-theme')![0]).toEqual(['midnight-rose-light']);
    });

    it('深色模式下切换主题族应落在该族的深色变体', async () => {
        const wrapper = mountSelector();

        await flushPromises();

        await wrapper.findAll('.theme-mode__btn')[1].trigger('click');
        await flushPromises();

        await wrapper.findAll('.theme-option')[1].trigger('click');
        await flushPromises();

        const emitted = wrapper.emitted('select-theme')!;
        expect(emitted[emitted.length - 1]).toEqual(['midnight-rose-dark']);
    });

    it('当前主题带有 active 类', async () => {
        const wrapper = mountSelector();

        await flushPromises();

        const active = wrapper.findAll('.theme-option.active');
        expect(active).toHaveLength(1);
        expect(active[0].text()).toContain('Mugen娘经典');
    });

    it('预览圆点同时体现明暗表面与主色', async () => {
        const wrapper = mountSelector();

        await flushPromises();

        const preview = wrapper.findAll('.theme-option__preview')[0];
        const style = preview.attributes('style') ?? '';
        expect(style).toContain('--preview-light: #FFF8F9');
        expect(style).toContain('--preview-dark: #1D191A');
        expect(style).toContain('--preview-accent: #B14A6B');
    });
});
