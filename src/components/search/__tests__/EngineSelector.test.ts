import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import EngineSelector from '@/components/search/EngineSelector.vue';
import type { SearchEngine } from '@/types/config';

const mockEngines: SearchEngine[] = [
    { name: 'Google', url: 'https://www.google.com/search?q={q}', icon: '/image/icons/google.svg' },
    { name: 'Bing', url: 'https://www.bing.com/search?q={q}', icon: '/image/icons/bing.svg' },
    { name: 'Baidu', url: 'https://www.baidu.com/s?wd={q}', icon: '/image/icons/baidu.svg' }
];

async function wait(ms = 30) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await nextTick();
}

describe('EngineSelector', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('渲染当前选中的搜索引擎名称与图标', () => {
        const wrapper = mount(EngineSelector, {
            props: { engines: mockEngines, modelValue: 1 }
        });
        expect(wrapper.text()).toContain('Bing');
    });

    it('点击触发器展开下拉选项', async () => {
        const wrapper = mount(EngineSelector, {
            props: { engines: mockEngines, modelValue: 0 },
            attachTo: document.body
        });

        await wrapper.find('.engine-selector__trigger').trigger('click');
        await wait();

        const options = wrapper.findAll('.engine-selector__option');
        expect(options).toHaveLength(3);
        expect(options[1]?.text()).toBe('Bing');
    });

    it('选择引擎后触发 update:modelValue 与 select 事件', async () => {
        const wrapper = mount(EngineSelector, {
            props: { engines: mockEngines, modelValue: 0 },
            attachTo: document.body
        });

        await wrapper.find('.engine-selector__trigger').trigger('click');
        await wait();

        await wrapper.findAll('.engine-selector__option')[2]?.trigger('click');
        await nextTick();

        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
        expect(wrapper.emitted('update:modelValue')![0]).toEqual([2]);
        expect(wrapper.emitted('select')).toHaveLength(1);
        expect(wrapper.emitted('select')![0]).toEqual([
            { index: 2, engine: mockEngines[2] }
        ]);
    });

    it('点击外部自动关闭下拉', async () => {
        const wrapper = mount(EngineSelector, {
            props: { engines: mockEngines, modelValue: 0 },
            attachTo: document.body
        });

        await wrapper.find('.engine-selector__trigger').trigger('click');
        await wait();
        expect(wrapper.find('.engine-selector__dropdown').isVisible()).toBe(true);

        document.body.click();
        await wait();

        expect(wrapper.find('.engine-selector__dropdown').isVisible()).toBe(false);
    });

    it('键盘 Enter 在展开时选中高亮项', async () => {
        const wrapper = mount(EngineSelector, {
            props: { engines: mockEngines, modelValue: 0 },
            attachTo: document.body
        });

        const trigger = wrapper.find('.engine-selector__trigger');
        await trigger.trigger('keydown', { key: 'Enter' });
        await wait();
        expect(wrapper.find('.engine-selector__dropdown').isVisible()).toBe(true);

        await trigger.trigger('keydown', { key: 'ArrowDown' });
        await trigger.trigger('keydown', { key: 'Enter' });
        await nextTick();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([1]);
    });

    it('无引擎时禁用触发器', () => {
        const wrapper = mount(EngineSelector, {
            props: { engines: [], modelValue: 0 }
        });
        expect(wrapper.find('.engine-selector__trigger').attributes('disabled')).toBeDefined();
    });
});
