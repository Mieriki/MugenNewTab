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
        padding: var(--ui-space-2) var(--ui-space-3) 6px;
        @include ui-caption;
        font-size: var(--ui-font-micro);
        color: var(--ui-muted-soft);
    }

    &__clear {
        @include button-reset;
        color: var(--ui-muted);
        font-size: var(--ui-font-micro);
        font-weight: 500;
        @include ui-transition(color);
        @include ui-focus-ring;

        &:hover {
            color: var(--ui-danger);
        }
    }

    &__list {
        padding: var(--ui-space-1) var(--ui-space-2) var(--ui-space-3);
    }

    &__item {
        @include button-reset;
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        gap: var(--ui-space-3);
        padding: 8px 10px;
        border-radius: var(--ui-radius-md);
        color: var(--ui-ink);
        font-size: var(--ui-font-body);
        font-weight: 400;
        text-align: left;
        @include ui-transition(background-color, color);
        @include ui-focus-ring;

        &:hover,
        &:focus-visible {
            background: var(--ui-elevated-hover);

            .search-history__item-icon {
                background: var(--ui-accent-soft);
                color: var(--ui-accent);
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
        width: 26px;
        height: 26px;
        border-radius: var(--ui-radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--ui-muted);
        background: var(--ui-sunken);
        @include ui-transition(background-color, color);
    }

    &__item-text {
        @include text-ellipsis;
        flex: 1;
        min-width: 0;
    }

    &__item-time {
        flex-shrink: 0;
        font-size: var(--ui-font-micro);
        color: var(--ui-muted-soft);
        font-variant-numeric: tabular-nums;
        transition: opacity var(--ui-dur-fast) var(--ui-ease);
    }

    &__item-remove {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 22px;
        height: 22px;
        border-radius: var(--ui-radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        color: var(--ui-muted);
        background: var(--ui-panel);
        @include ui-transition(background-color, color, opacity);

        &:hover {
            background: var(--ui-danger-soft);
            color: var(--ui-danger);
        }

        &:focus-visible {
            opacity: 1;
            pointer-events: auto;
            background: var(--ui-panel);
            color: var(--ui-ink);
        }
    }
}

// 移除按钮的底色来自 --ui-panel，深色变体不需要另写一套

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
