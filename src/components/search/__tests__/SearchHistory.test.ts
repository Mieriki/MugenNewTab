import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchHistory from '@/components/search/SearchHistory.vue';
import type { SearchHistoryItem } from '@/stores/search.store';

describe('SearchHistory', () => {
    const mockHistory: SearchHistoryItem[] = [
        { query: 'Vue 3', time: Date.now() - 60 * 1000 },
        { query: 'Pinia', time: Date.now() - 60 * 60 * 1000 },
        { query: 'TypeScript', time: Date.now() - 24 * 60 * 60 * 1000 },
    ];

    it('渲染搜索历史列表', () => {
        const wrapper = mount(SearchHistory, {
            props: { history: mockHistory }
        });
        const items = wrapper.findAll('.search-history__item');
        expect(items).toHaveLength(3);
        expect(items[0]?.text()).toContain('Vue 3');
        expect(items[1]?.text()).toContain('Pinia');
    });

    it('history 为空时不渲染容器', () => {
        const wrapper = mount(SearchHistory, {
            props: { history: [] }
        });
        expect(wrapper.find('.search-history').exists()).toBe(false);
    });

    it('点击历史项触发 select 事件', async () => {
        const wrapper = mount(SearchHistory, {
            props: { history: mockHistory }
        });
        await wrapper.findAll('.search-history__item')[1]?.trigger('click');
        expect(wrapper.emitted('select')).toHaveLength(1);
        expect(wrapper.emitted('select')![0]).toEqual(['Pinia']);
    });

    it('点击删除按钮触发 remove 事件', async () => {
        const wrapper = mount(SearchHistory, {
            props: { history: mockHistory }
        });
        await wrapper.findAll('.search-history__item-remove')[0]?.trigger('click');
        expect(wrapper.emitted('remove')).toHaveLength(1);
        expect(wrapper.emitted('remove')![0]).toEqual(['Vue 3']);
    });

    it('点击清空按钮触发 clear 事件', async () => {
        const wrapper = mount(SearchHistory, {
            props: { history: mockHistory }
        });
        await wrapper.find('.search-history__clear').trigger('click');
        expect(wrapper.emitted('clear')).toHaveLength(1);
    });

    it('visible 为 false 时不渲染', () => {
        const wrapper = mount(SearchHistory, {
            props: { history: mockHistory, visible: false }
        });
        expect(wrapper.find('.search-history').exists()).toBe(false);
    });

    it('支持自定义标题', () => {
        const wrapper = mount(SearchHistory, {
            props: { history: mockHistory, title: '搜索记录' }
        });
        expect(wrapper.text()).toContain('搜索记录');
    });

    it('支持 item 插槽自定义渲染', () => {
        const wrapper = mount(SearchHistory, {
            props: { history: mockHistory },
            slots: {
                item: `<template #item="{ query, index }">
                    <span class="custom-item">{{ index }}: {{ query }}</span>
                </template>`
            }
        });
        expect(wrapper.find('.custom-item').exists()).toBe(true);
        expect(wrapper.text()).toContain('0: Vue 3');
    });
});
