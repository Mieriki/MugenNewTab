import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, computed, nextTick } from 'vue';
import SearchModal from '@/components/search/SearchModal.vue';
import { useSearch } from '@/composables/useSearch';
import type { SearchEngine } from '@/types/config';
import type { UseSearchReturn } from '@/composables/useSearch';
import type { SearchHistoryItem } from '@/stores/search.store';

const mockEngines: SearchEngine[] = [
    { name: 'Google', url: 'https://www.google.com/search?q={q}', icon: '/image/icons/google.svg' },
    { name: 'Bing', url: 'https://www.bing.com/search?q={q}', icon: '/image/icons/bing.svg' }
];

function createMockUseSearch(overrides: Partial<UseSearchReturn> = {}): UseSearchReturn {
    const query = ref('');
    const engines = ref(mockEngines);
    const selectedEngineIndex = ref(0);
    const suggestions = ref<string[]>([]);
    const activeSuggestionIndex = ref(-1);
    const isLoadingSuggestions = ref(false);
    const suggestionError = ref<string | null>(null);
    const initialized = ref(true);
    const history = ref<SearchHistoryItem[]>([
        { query: 'Vue 3', time: Date.now() - 60 * 1000 },
        { query: 'Pinia', time: Date.now() - 60 * 60 * 1000 },
    ]);

    const currentEngineIndex = computed(() => selectedEngineIndex.value);
    const currentEngine = computed(() => engines.value[selectedEngineIndex.value] ?? null);
    const canSearch = computed(() => currentEngine.value !== null && query.value.trim().length > 0);
    const hasSuggestions = computed(() => suggestions.value.length > 0);

    return {
        query,
        engines,
        currentEngineIndex,
        currentEngine,
        suggestions,
        activeSuggestionIndex,
        isLoadingSuggestions,
        suggestionError,
        canSearch,
        hasSuggestions,
        history,
        initialized,
        init: vi.fn(async () => {}),
        setQuery: vi.fn((value: string) => {
            query.value = value;
        }),
        executeSearch: vi.fn(async (rawQuery?: string) => {
            const trimmed = (rawQuery ?? query.value).trim();
            if (!trimmed || !currentEngine.value) return false;
            query.value = '';
            return true;
        }),
        executeSearchWithSuggestion: vi.fn(async (_suggestion: string) => {
            query.value = '';
            return true;
        }),
        loadSuggestions: vi.fn(),
        clearSuggestions: vi.fn(() => {
            suggestions.value = [];
            activeSuggestionIndex.value = -1;
        }),
        selectEngine: vi.fn(async (index: number) => {
            selectedEngineIndex.value = index;
        }),
        nextEngine: vi.fn(),
        prevEngine: vi.fn(),
        addHistory: vi.fn(),
        removeHistory: vi.fn(async (item: string) => {
            history.value = history.value.filter((h) => h.query !== item);
        }),
        clearHistory: vi.fn(async () => {
            history.value = [];
        }),
        moveSuggestionDown: vi.fn(() => {
            activeSuggestionIndex.value = Math.min(
                activeSuggestionIndex.value + 1,
                suggestions.value.length - 1
            );
        }),
        moveSuggestionUp: vi.fn(() => {
            activeSuggestionIndex.value = Math.max(activeSuggestionIndex.value - 1, -1);
        }),
        selectActiveSuggestion: vi.fn(() => {
            const index = activeSuggestionIndex.value;
            if (index < 0 || index >= suggestions.value.length) return null;
            const selected = suggestions.value[index];
            query.value = selected;
            activeSuggestionIndex.value = -1;
            suggestions.value = [];
            return selected;
        }),
        getCompletionCandidate: vi.fn(() => {
            const current = query.value;
            if (!current.trim() || suggestions.value.length === 0) return null;
            const active = suggestions.value[activeSuggestionIndex.value];
            if (active && active !== current) return active;
            const lower = current.toLowerCase();
            return (
                suggestions.value.find(
                    (item) => item.toLowerCase().startsWith(lower) && item.length > current.length
                ) ?? null
            );
        }),
        ...overrides
    } as UseSearchReturn;
}

let mockUseSearch = createMockUseSearch();

vi.mock('@/composables/useSearch', () => ({
    useSearch: vi.fn(() => mockUseSearch)
}));

async function wait(ms = 50) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await nextTick();
}

describe('SearchModal', () => {
    let openSpy: MockInstance;

    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        mockUseSearch = createMockUseSearch();
        openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.body.style.overflow = '';
        openSpy.mockRestore();
        vi.clearAllMocks();
    });

    it('打开时渲染搜索头部与历史记录', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();

        expect(document.querySelector('.search-modal__header')).not.toBeNull();
        expect(document.querySelector('.search-history')).not.toBeNull();
    });

    it('输入关键词后隐藏历史记录并显示建议', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        expect(document.querySelector('.search-history')).not.toBeNull();

        mockUseSearch.suggestions.value = ['vue router', 'vuex'];
        mockUseSearch.query.value = 'vue';
        await flushPromises();

        expect(document.querySelector('.search-history')).toBeNull();
        expect(document.querySelector('.search-suggestions')).not.toBeNull();
    });

    it('Enter 执行搜索并关闭模态框', async () => {
        const wrapper = mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        const input = document.querySelector('input[type="search"]') as HTMLInputElement;
        input.value = 'vue';
        input.dispatchEvent(new Event('input'));
        await flushPromises();

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await flushPromises();

        expect(mockUseSearch.executeSearch).toHaveBeenCalled();
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('选中建议后使用建议搜索', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        mockUseSearch.suggestions.value = ['vue router', 'vuex'];
        mockUseSearch.query.value = 'vue';
        await flushPromises();

        const items = document.querySelectorAll('.search-suggestions__item');
        expect(items.length).toBeGreaterThan(0);
        items[0]?.dispatchEvent(new Event('click'));
        await flushPromises();

        expect(mockUseSearch.executeSearchWithSuggestion).toHaveBeenCalledWith('vue router');
    });

    it('切换搜索引擎触发 selectEngine', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        document.querySelector('.engine-selector__trigger')?.dispatchEvent(new Event('click'));
        await wait();

        const options = document.querySelectorAll('.engine-selector__option');
        options[1]?.dispatchEvent(new Event('click'));
        await flushPromises();

        expect(mockUseSearch.selectEngine).toHaveBeenCalledWith(1);
    });

    it('点击关闭按钮关闭模态框并清空建议', async () => {
        const wrapper = mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        document.querySelector('.search-modal__close')?.dispatchEvent(new Event('click'));
        await flushPromises();

        expect(mockUseSearch.clearSuggestions).toHaveBeenCalled();
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('有建议时 ESC 先清空建议并阻止模态框关闭', async () => {
        const wrapper = mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        mockUseSearch.suggestions.value = ['vue router'];
        mockUseSearch.hasSuggestions = computed(() => true);
        await flushPromises();

        const modal = document.querySelector('.search-modal');
        modal?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await flushPromises();

        expect(mockUseSearch.clearSuggestions).toHaveBeenCalled();
        expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });

    it('删除历史记录调用 removeHistory', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        const removeButtons = document.querySelectorAll('.search-history__item-remove');
        expect(removeButtons.length).toBeGreaterThan(0);
        removeButtons[0]?.dispatchEvent(new Event('click'));
        await flushPromises();

        expect(mockUseSearch.removeHistory).toHaveBeenCalledWith('Vue 3');
    });

    it('清空历史记录调用 clearHistory', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        document.querySelector('.search-history__clear')?.dispatchEvent(new Event('click'));
        await flushPromises();

        expect(mockUseSearch.clearHistory).toHaveBeenCalled();
    });

    it('光标在末尾时按 → 补全到候选词', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        mockUseSearch.suggestions.value = ['vue3', 'vite'];
        mockUseSearch.query.value = 'vu';
        await flushPromises();

        const input = document.querySelector('input[type="search"]') as HTMLInputElement;
        input.value = 'vu';
        input.setSelectionRange(2, 2);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await flushPromises();

        expect(mockUseSearch.query.value).toBe('vue3');
    });

    it('光标不在末尾时按 → 不补全', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        mockUseSearch.suggestions.value = ['vue3'];
        mockUseSearch.query.value = 'vu';
        await flushPromises();

        const input = document.querySelector('input[type="search"]') as HTMLInputElement;
        input.value = 'vu';
        input.setSelectionRange(0, 0);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await flushPromises();

        expect(mockUseSearch.query.value).toBe('vu');
    });

    it('存在前缀匹配候选时显示幽灵文本后缀', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        mockUseSearch.suggestions.value = ['vue3'];
        mockUseSearch.query.value = 'vu';
        await flushPromises();

        const ghostSuffix = document.querySelector('.search-modal__ghost-suffix');
        expect(ghostSuffix?.textContent).toBe('e3');
    });

    it('建议数量上限配置为 10 条', async () => {
        mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();

        expect(vi.mocked(useSearch)).toHaveBeenCalledWith(
            expect.objectContaining({ maxSuggestions: 10 })
        );
    });

    it('点击搜索按钮后清空输入框且 search 事件携带原关键词', async () => {
        const wrapper = mount(SearchModal, {
            props: { modelValue: true },
            attachTo: document.body
        });

        await wait();
        const input = document.querySelector('input[type="search"]') as HTMLInputElement;
        input.value = 'vue3';
        input.dispatchEvent(new Event('input'));
        await flushPromises();

        document.querySelector('.search-modal__submit')?.dispatchEvent(new Event('click'));
        await flushPromises();

        expect(mockUseSearch.executeSearch).toHaveBeenCalled();
        expect(mockUseSearch.query.value).toBe('');
        expect(wrapper.emitted('search')?.[0]).toEqual([
            { query: 'vue3', engine: mockEngines[0] }
        ]);
    });
});
