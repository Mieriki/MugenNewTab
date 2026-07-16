<script setup lang="ts">
/**
 * SearchSuggestions - 搜索建议列表
 *
 * 展示本地历史 + 远程搜索引擎返回的关键词补全建议，支持高亮当前项、
 * 鼠标悬停与键盘上下键导航。
 */
import { computed } from 'vue';
import { escapeHtml } from '@/utils/escape.util';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface SearchSuggestionsProps {
    /** 建议列表 */
    suggestions: string[];
    /** 当前高亮索引，-1 表示未选中 */
    activeIndex?: number;
    /** 是否正在加载远程建议 */
    loading?: boolean;
    /** 是否显示 */
    visible?: boolean;
    /** 当前输入关键词，用于高亮匹配部分 */
    query?: string;
    /** 最大高度 */
    maxHeight?: string | number;
    /** 空状态提示 */
    emptyText?: string;
}

const props = withDefaults(defineProps<SearchSuggestionsProps>(), {
    activeIndex: -1,
    loading: false,
    visible: true,
    query: '',
    maxHeight: 240,
    emptyText: '暂无搜索建议'
});

const emit = defineEmits<{
    (e: 'select', suggestion: string): void;
    (e: 'hover', index: number): void;
}>();

const hasSuggestions = computed(() => props.suggestions.length > 0);
const shouldShow = computed(() => props.visible && (hasSuggestions.value || props.loading));

const contentStyle = computed(() => {
    const height = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight;
    return { maxHeight: height };
});

function handleSelect(suggestion: string): void {
    emit('select', suggestion);
}

function handleHover(index: number): void {
    emit('hover', index);
}

/**
 * 高亮建议中与查询词匹配的部分
 * 返回安全的 HTML 字符串，使用 v-html 渲染。
 */
function highlightMatch(suggestion: string): string {
    const query = props.query.trim();
    if (!query) {
        return escapeHtml(suggestion);
    }

    const lowerSuggestion = suggestion.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerSuggestion.indexOf(lowerQuery);

    if (index === -1) {
        return escapeHtml(suggestion);
    }

    const before = escapeHtml(suggestion.slice(0, index));
    const match = escapeHtml(suggestion.slice(index, index + query.length));
    const after = escapeHtml(suggestion.slice(index + query.length));

    return `${before}<mark class="search-suggestions__mark">${match}</mark>${after}`;
}

const searchIconPath = 'M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z';
const loadingIconPath = 'M12 2v4m0 12v4M2 12h4m12 0h4';
</script>

<template>
    <div
        v-show="shouldShow"
        class="search-suggestions"
        :style="contentStyle"
        role="listbox"
        aria-label="搜索建议"
    >
        <div
            v-if="loading && !hasSuggestions"
            class="search-suggestions__loading"
        >
            <span class="search-suggestions__spinner">
                <IconSvg :path="loadingIconPath" :size="18" alt="" />
            </span>
            <span>正在获取建议…</span>
        </div>

        <div
            v-else-if="hasSuggestions"
            class="search-suggestions__list"
        >
            <button
                v-for="(suggestion, index) in suggestions"
                :key="`${suggestion}-${index}`"
                type="button"
                class="search-suggestions__item"
                :class="{ 'is-active': index === activeIndex }"
                role="option"
                :aria-selected="index === activeIndex"
                @click="handleSelect(suggestion)"
                @mouseenter="handleHover(index)"
            >
                <slot
                    name="item"
                    :suggestion="suggestion"
                    :index="index"
                    :active="index === activeIndex"
                    :query="query"
                    :highlight="highlightMatch(suggestion)"
                >
                    <span class="search-suggestions__icon">
                        <IconSvg :path="searchIconPath" :size="16" alt="" />
                    </span>
                    <span
                        class="search-suggestions__text"
                        v-html="highlightMatch(suggestion)"
                    />
                </slot>
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.search-suggestions {
    overflow-y: auto;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    @include hide-scrollbar;

    &__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 16px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 13px;
    }

    &__spinner {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: mnt-spin 1s linear infinite;
    }

    &__list {
        padding: 2px 6px 6px;
    }

    &__item {
        @include button-reset;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        color: var(--md-sys-color-on-surface);
        font-size: 14px;
        font-weight: 500;
        text-align: left;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover,
        &.is-active {
            background: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-primary);

            .search-suggestions__icon {
                opacity: 1;
            }
        }

        &.is-active {
            font-weight: 600;
        }
    }

    &__icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        opacity: 0.6;
        color: var(--md-sys-color-on-surface-variant);
        @include md-transition(opacity, var(--md-transition-fast));
    }

    &__text {
        @include text-ellipsis;
        flex: 1;

        :deep(mark) {
            background: transparent;
            color: var(--md-sys-color-primary);
            font-weight: 700;
            padding: 0;
        }
    }
}

@keyframes mnt-spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

// 深色模式
:global(html.dark-mode),
:global(body.dark-mode) {
    .search-suggestions {
        background: rgba(40, 40, 40, 0.98);
    }
}

@include respond-to(mobile) {
    .search-suggestions__item {
        padding: 10px 12px;
        font-size: 15px;
    }
}
</style>
