import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseButton from '../BaseButton.vue';
import BaseInput from '../BaseInput.vue';
import BaseSlider from '../BaseSlider.vue';

describe('BaseButton', () => {
    it('渲染默认主按钮', () => {
        const wrapper = mount(BaseButton, { slots: { default: '保存' } });
        expect(wrapper.classes()).toContain('mnt-base-button--primary');
        expect(wrapper.text()).toBe('保存');
    });

    it('点击触发 click 事件', async () => {
        const wrapper = mount(BaseButton, { slots: { default: '点击' } });
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('click')).toHaveLength(1);
    });

    it('disabled 时禁止点击', async () => {
        const wrapper = mount(BaseButton, { props: { disabled: true }, slots: { default: '禁用' } });
        expect(wrapper.find('button').attributes('disabled')).toBeDefined();
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('加载状态显示 spinner 且禁用点击', async () => {
        const wrapper = mount(BaseButton, { props: { loading: true }, slots: { default: '提交中' } });
        expect(wrapper.find('.mnt-base-button__spinner').exists()).toBe(true);
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('click')).toBeUndefined();
    });
});

describe('BaseInput', () => {
    it('渲染标签与输入框', () => {
        const wrapper = mount(BaseInput, { props: { label: '名称', modelValue: '' } });
        expect(wrapper.find('label').text()).toContain('名称');
        expect(wrapper.find('input').exists()).toBe(true);
    });

    it('输入时触发 update:modelValue', async () => {
        const wrapper = mount(BaseInput, { props: { modelValue: '' } });
        await wrapper.find('input').setValue('hello');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['hello']);
    });

    it('显示错误文本', () => {
        const wrapper = mount(BaseInput, { props: { modelValue: '', error: '不能为空' } });
        expect(wrapper.find('.mnt-base-input__error').text()).toBe('不能为空');
        expect(wrapper.classes()).toContain('mnt-base-input--error');
    });
});

describe('BaseSlider', () => {
    it('渲染标签与当前值', () => {
        const wrapper = mount(BaseSlider, { props: { modelValue: 50, label: '透明度' } });
        expect(wrapper.text()).toContain('透明度');
        expect(wrapper.text()).toContain('50');
    });

    it('拖动时触发 update:modelValue', async () => {
        const wrapper = mount(BaseSlider, { props: { modelValue: 30, min: 0, max: 100 } });
        const input = wrapper.find('input[type="range"]');
        await input.setValue('60');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([60]);
    });
});
