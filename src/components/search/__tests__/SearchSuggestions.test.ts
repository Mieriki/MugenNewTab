import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import SearchSuggestions from '@/components/search/SearchSuggestions.vue';

describe('SearchSuggestions', () => {
    const mockSuggestions = ['vue router', 'vuex', 'vue use'];

    it('渲染建议列表', () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: mockSuggestions }
        });
        const items = wrapper.findAll('.search-suggestions__item');
        expect(items).toHaveLength(3);
        expect(items[0]?.text()).toContain('vue router');
    });

    it('无建议且未加载时不渲染', () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: [], loading: false }
        });
        expect(wrapper.find('.search-suggestions').isVisible()).toBe(false);
    });

    it('加载中且没有建议时显示骨架屏占位', () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: [], loading: true }
        });
        expect(wrapper.find('.search-suggestions').isVisible()).toBe(true);
        expect(wrapper.findAll('.search-suggestions__skeleton-item')).toHaveLength(3);
    });

    it('已有建议时刷新中追加 is-refreshing 类且保留旧列表', () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: mockSuggestions, loading: true }
        });
        expect(wrapper.find('.search-suggestions').classes()).toContain('is-refreshing');
        expect(wrapper.findAll('.search-suggestions__item')).toHaveLength(3);
    });

    it('点击建议项触发 select 事件', async () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: mockSuggestions }
        });
        await wrapper.findAll('.search-suggestions__item')[1]?.trigger('click');
        expect(wrapper.emitted('select')).toHaveLength(1);
        expect(wrapper.emitted('select')![0]).toEqual(['vuex']);
    });

    it('鼠标悬停触发 hover 事件', async () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: mockSuggestions }
        });
        await wrapper.findAll('.search-suggestions__item')[2]?.trigger('mouseenter');
        expect(wrapper.emitted('hover')).toHaveLength(1);
        expect(wrapper.emitted('hover')![0]).toEqual([2]);
    });

    it('activeIndex 对应项添加 is-active 类', () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: mockSuggestions, activeIndex: 1 }
        });
        const items = wrapper.findAll('.search-suggestions__item');
        expect(items[1]?.classes()).toContain('is-active');
        expect(items[0]?.classes()).not.toContain('is-active');
    });

    it('高亮查询词匹配部分', () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: mockSuggestions, query: 'vue' }
        });
        const firstItem = wrapper.find('.search-suggestions__item');
        expect(firstItem.html()).toContain('<mark class="search-suggestions__mark"');
    });

    it('不渲染 emoji 图标', () => {
        const wrapper = mount(SearchSuggestions, {
            props: { suggestions: mockSuggestions }
        });
        expect(wrapper.text()).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('activeIndex 变化时高亮项滚动到可见区域', async () => {
        const scrollSpy = vi.fn();
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = scrollSpy;

        try {
            const wrapper = mount(SearchSuggestions, {
                props: { suggestions: mockSuggestions, activeIndex: -1 }
            });
            await wrapper.setProps({ activeIndex: 2 });
            await nextTick();
            await nextTick();

            expect(scrollSpy).toHaveBeenCalled();
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });
});
