import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsCenter from '@/components/personalization/SettingsCenter.vue';

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

/** Teleport 会把弹窗挂到 body 上，用例之间必须手动清理 */
function cleanupTeleports(): void {
    document.body.querySelectorAll('.settings-center-wrapper').forEach((el) => el.remove());
}

describe('SettingsCenter', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(themesConfig))));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        cleanupTeleports();
    });

    it('关闭时不渲染任何内容', () => {
        mount(SettingsCenter, { props: { modelValue: false, autoInit: false } });

        expect(document.body.querySelector('.settings-center')).toBeNull();
    });

    it('打开时渲染导航与全部设置栏目', async () => {
        mount(SettingsCenter, { props: { modelValue: true, autoInit: false } });
        await flushPromises();

        const dialog = document.body.querySelector('.settings-center');
        expect(dialog).not.toBeNull();

        // 6 个栏目：外观 / 壁纸 / 页面布局 / 卡片样式 / 数据与同步 / 关于
        expect(dialog!.querySelectorAll('.settings-nav__item')).toHaveLength(6);

        // 五个存量栏目与两个新增栏目都渲染出来（v-show，切换不重建）
        expect(dialog!.querySelector('.theme-selector')).not.toBeNull();
        expect(dialog!.querySelector('.wallpaper-settings')).not.toBeNull();
        expect(dialog!.querySelector('.layout-settings')).not.toBeNull();
        expect(dialog!.querySelector('.card-style-settings')).not.toBeNull();
        expect(dialog!.querySelector('.cloud-sync-panel')).not.toBeNull();

        // 默认激活「外观」
        expect(dialog!.querySelector('.settings-nav__item.active')?.textContent).toContain('外观');
    });

    it('点击导航切换激活栏目', async () => {
        const wrapper = mount(SettingsCenter, { props: { modelValue: true, autoInit: false } });
        await flushPromises();

        const items = document.body.querySelectorAll<HTMLButtonElement>('.settings-nav__item');
        items[1].click();
        await flushPromises();
        expect(document.body.querySelector('.settings-nav__item.active')?.textContent).toContain('壁纸');

        items[2].click();
        await flushPromises();
        expect(document.body.querySelector('.settings-nav__item.active')?.textContent).toContain('页面布局');

        // 切换栏目会向上抛出 update:tab，父组件据此记住位置
        const emitted = wrapper.emitted('update:tab') ?? [];
        expect(emitted[emitted.length - 1]).toEqual(['layout']);
    });

    it('通过 tab 道具可外部定位栏目', async () => {
        mount(SettingsCenter, {
            props: { modelValue: true, autoInit: false, tab: 'data' }
        });
        await flushPromises();

        expect(document.body.querySelector('.settings-nav__item.active')?.textContent).toContain(
            '数据与同步'
        );
    });

    it('点击遮罩层触发 update:modelValue 与 close', async () => {
        const wrapper = mount(SettingsCenter, {
            props: { modelValue: true, autoInit: false }
        });
        await flushPromises();

        const overlay = document.body.querySelector('.settings-center-overlay');
        expect(overlay).not.toBeNull();
        overlay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('导入导出栏目向上转发事件，不在组件内自行处理', async () => {
        const wrapper = mount(SettingsCenter, {
            props: { modelValue: true, autoInit: false, tab: 'data' }
        });
        await flushPromises();

        const buttons = Array.from(
            document.body.querySelectorAll<HTMLButtonElement>('.settings-panel__body button')
        );
        const exportBtn = buttons.find((btn) => btn.textContent?.includes('导出'));
        const importBtn = buttons.find((btn) => btn.textContent?.includes('导入'));

        exportBtn?.click();
        importBtn?.click();
        await flushPromises();

        expect(wrapper.emitted('export-data')).toHaveLength(1);
        expect(wrapper.emitted('import-data')).toHaveLength(1);
    });
});
