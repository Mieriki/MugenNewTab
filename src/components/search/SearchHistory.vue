<script setup lang="ts">
/**
 * SearchHistory - 搜索历史列表
 *
 * 展示最近的搜索关键词，支持点击复用、单条删除与全部清空。
 * 每条历史显示搜索时间（相对时间），整体布局更紧凑。
 */
import { computed } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import type { SearchHistoryItem } from '@/stores/search.store';

export interface SearchHistoryProps {
    /** 搜索历史列表 */
    history: SearchHistoryItem[];
    /** 是否显示 */
    visible?: boolean;
    /** 最大高度 */
    maxHeight?: string | number;
    /** 空状态提示 */
    emptyText?: string;
    /** 标题 */
    title?: string;
}

const props = withDefaults(defineProps<SearchHistoryProps>(), {
    visible: true,
    maxHeight: 260,
    emptyText: '暂无搜索历史',
    title: '最近搜索'
});

const emit = defineEmits<{
    (e: 'select', query: string): void;
    (e: 'remove', query: string): void;
    (e: 'clear'): void;
}>();

const contentStyle = computed(() => {
    const height = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight;
    return { maxHeight: height };
});

function handleSelect(query: string): void {
    emit('select', query);
}

function handleRemove(query: string, event: Event): void {
    event.stopPropagation();
    emit('remove', query);
}

function handleClear(): void {
    emit('clear');
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function formatAbsoluteTime(time: number): string {
    const date = new Date(time);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRelativeTime(time: number): string {
    const diff = Date.now() - time;
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) {
        return '刚刚';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes} 分钟前`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} 小时前`;
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days} 天前`;
    }

    return formatAbsoluteTime(time);
}

const deleteIconPath = 'M18 6L6 18M6 6l12 12';
</script>

<template>
    <div
        v-if="visible && history.length > 0"
        class="search-history"
        :style="contentStyle"
    >
        <div class="search-history__header">
            <span class="search-history__title">{{ title }}</span>
            <button
                type="button"
                class="search-history__clear"
                :aria-label="`清空${title}`"
                @click="handleClear"
            >
                清空
            </button>
        </div>

        <div class="search-history__list" role="list">
            <button
                v-for="(item, index) in history"
                :key="`${item.query}-${index}`"
                type="button"
                class="search-history__item"
                role="listitem"
                :title="formatAbsoluteTime(item.time)"
                @click="handleSelect(item.query)"
            >
                <slot name="item" :query="item.query" :index="index" :time="item.time">
                    <span class="search-history__item-icon">
                        <IconSvg name="history" :size="14" alt="" monochrome />
                    </span>
                    <span class="search-history__item-text">{{ item.query }}</span>
                    <span class="search-history__item-time">{{ formatRelativeTime(item.time) }}</span>
                    <span
                        class="search-history__item-remove"
                        role="button"
                        tabindex="0"
                        :aria-label="`删除 ${item.query}`"
                        @click="handleRemove(item.query, $event)"
                        @keydown.enter.stop="handleRemove(item.query, $event)"
                    >
                        <IconSvg :path="deleteIconPath" :size="14" alt="" />
                    </span>
                </slot>
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.search-history {
    overflow-y: auto;
    background: transparent;
    @include hide-scrollbar;

    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface-variant);
        letter-spacing: 0.3px;
    }

    &__title {
        opacity: 0.85;
    }

    &__clear {
        @include button-reset;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 12px;
        font-weight: 600;
        @include md-transition(color, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            color: var(--md-sys-color-error);
        }
    }

    &__list {
        padding: 4px 8px 10px;
    }

    &__item {
        @include button-reset;
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 9px 10px;
        border-radius: 12px;
        color: var(--md-sys-color-on-surface);
        font-size: 14px;
        font-weight: 500;
        text-align: left;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover,
        &:focus-visible {
            background: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-primary);

            .search-history__item-icon {
                background: color-mix(in srgb, var(--md-sys-color-primary) 16%, transparent);
            }

            .search-history__item-time {
                opacity: 0;
            }

            .search-history__item-remove {
                opacity: 1;
                pointer-events: auto;
            }
        }
    }

    &__item-icon {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: color-mix(in srgb, var(--md-sys-color-on-surface) 6%, transparent);
        @include md-transition(all, var(--md-transition-fast));
    }

    &__item-text {
        @include text-ellipsis;
        flex: 1;
        min-width: 0;
    }

    &__item-time {
        flex-shrink: 0;
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.7;
        @include md-transition(opacity, var(--md-transition-fast));
    }

    &__item-remove {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 22px;
        height: 22px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        color: var(--md-sys-color-on-surface-variant);
        background: var(--md-sys-color-surface);
        @include md-transition(all, var(--md-transition-fast));

        &:hover {
            background: var(--md-sys-color-error-container);
            color: var(--md-sys-color-error);
        }

        &:focus-visible {
            opacity: 1;
            pointer-events: auto;
            background: var(--md-sys-color-error-container);
            color: var(--md-sys-color-error);
        }
    }
}

// 深色模式
:global(html.dark-mode),
:global(body.dark-mode) {
    .search-history__item-remove {
        background: var(--md-sys-color-surface-variant);
    }
}

@include respond-to(mobile) {
    .search-history__item-remove {
        opacity: 1;
        pointer-events: auto;
        background: transparent;
    }

    .search-history__item-time {
        display: none;
    }
}
</style>
