/**
 * 基础控件测试：BaseSwitch / BaseSegmented / SettingsSection / SettingsRow
 *
 * 这四个是设置中心的地基，行为（键盘、aria、事件）比外观更需要锁定。
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseSwitch from '@/components/common/BaseSwitch.vue';
import BaseSegmented from '@/components/common/BaseSegmented.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';

describe('BaseSwitch', () => {
    it('按 aria-checked 反映开关状态', async () => {
        const wrapper = mount(BaseSwitch, {
            props: { modelValue: false, ariaLabel: '自动同步' }
        });

        const button = wrapper.find('button');
        expect(button.attributes('role')).toBe('switch');
        expect(button.attributes('aria-checked')).toBe('false');
        expect(button.attributes('aria-label')).toBe('自动同步');

        await wrapper.setProps({ modelValue: true });
        expect(wrapper.find('button').attributes('aria-checked')).toBe('true');
        expect(wrapper.find('button').classes()).toContain('mnt-switch--on');
    });

    it('点击切换并抛出 update:modelValue 与 change', async () => {
        const wrapper = mount(BaseSwitch, { props: { modelValue: false } });

        await wrapper.find('button').trigger('click');

        expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
        expect(wrapper.emitted('change')).toEqual([[true]]);
        // 受控组件：自己做状态翻转，必须由父组件回写才会变
        expect(wrapper.find('button').attributes('aria-checked')).toBe('false');
    });

    it('禁用时不抛事件', async () => {
        const wrapper = mount(BaseSwitch, {
            props: { modelValue: false, disabled: true }
        });

        await wrapper.find('button').trigger('click');

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    });
});

describe('BaseSegmented', () => {
    const options = [
        { value: 'light', label: '明亮' },
        { value: 'dark', label: '深色' }
    ];

    it('渲染为 radiogroup，只有选中项可 tab 聚焦', () => {
        const wrapper = mount(BaseSegmented, {
            props: { modelValue: 'dark', options, ariaLabel: '外观' }
        });

        expect(wrapper.attributes('role')).toBe('radiogroup');
        expect(wrapper.attributes('aria-label')).toBe('外观');

        const items = wrapper.findAll('.mnt-segmented__item');
        expect(items).toHaveLength(2);
        expect(items[0].attributes('tabindex')).toBe('-1');
        expect(items[1].attributes('tabindex')).toBe('0');
        expect(items[1].classes()).toContain('is-active');
        expect(items[1].attributes('aria-checked')).toBe('true');
    });

    it('点击非选中项抛出 change', async () => {
        const wrapper = mount(BaseSegmented, {
            props: { modelValue: 'light', options }
        });

        await wrapper.findAll('.mnt-segmented__item')[1].trigger('click');

        expect(wrapper.emitted('update:modelValue')).toEqual([['dark']]);
        expect(wrapper.emitted('change')).toEqual([['dark']]);
    });

    it('点击已选中项不重复抛事件', async () => {
        const wrapper = mount(BaseSegmented, {
            props: { modelValue: 'light', options }
        });

        await wrapper.findAll('.mnt-segmented__item')[0].trigger('click');

        expect(wrapper.emitted('change')).toBeUndefined();
    });

    it('方向键在选项间移动并选中', async () => {
        const wrapper = mount(BaseSegmented, {
            props: { modelValue: 'light', options }
        });

        await wrapper.findAll('.mnt-segmented__item')[0].trigger('keydown', { key: 'ArrowRight' });
        expect(wrapper.emitted('change')).toEqual([['dark']]);

        // 到末尾后回绕
        await wrapper.setProps({ modelValue: 'dark' });
        await wrapper.findAll('.mnt-segmented__item')[1].trigger('keydown', { key: 'ArrowRight' });
        expect(wrapper.emitted('change')).toEqual([['dark'], ['light']]);
    });
});

describe('SettingsSection', () => {
    it('有标题时渲染标题行，无标题时只渲染卡片', () => {
        const withTitle = mount(SettingsSection, {
            props: { title: '外观' },
            slots: { default: '<div class="row">行</div>' }
        });
        expect(withTitle.find('.settings-section__title').text()).toBe('外观');

        const noTitle = mount(SettingsSection, {
            slots: { default: '<div class="row">行</div>' }
        });
        expect(noTitle.find('.settings-section__header').exists()).toBe(false);
        expect(noTitle.find('.settings-section__card .row').exists()).toBe(true);
    });
});

describe('SettingsRow', () => {
    it('渲染标题与描述，控件进 actions 区', () => {
        const wrapper = mount(SettingsRow, {
            props: { label: '自动同步', description: '打开新标签页时自动拉取' },
            slots: { actions: '<button class="ctl">开关</button>' }
        });

        expect(wrapper.find('.settings-row__label').text()).toBe('自动同步');
        expect(wrapper.find('.settings-row__description').text()).toBe(
            '打开新标签页时自动拉取'
        );
        expect(wrapper.find('.settings-row__actions .ctl').exists()).toBe(true);
    });

    it('没有 actions 插槽时不渲染控件容器', () => {
        const wrapper = mount(SettingsRow, { props: { label: '免责说明' } });

        expect(wrapper.find('.settings-row__actions').exists()).toBe(false);
        expect(wrapper.find('.settings-row__description').exists()).toBe(false);
    });

    it('stacked 时加上换行类', () => {
        const wrapper = mount(SettingsRow, {
            props: { label: '圆角', stacked: true }
        });

        expect(wrapper.find('.settings-row').classes()).toContain('settings-row--stacked');
    });
});
