<script setup lang="ts">
/**
 * SearchModal - 全局搜索模态框
 *
 * 整合搜索引擎选择、搜索输入、历史记录与关键词补全建议。
 * 通过 useSearch 组合式函数管理状态与业务操作。
 *
 * 快捷键：
 * - Enter：执行搜索 / 选中高亮建议
 * - ArrowDown/ArrowUp：移动建议高亮
 * - Escape：关闭模态框（有建议时先清空建议）
 */
import { computed, nextTick, ref, watch } from 'vue';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import EngineSelector from './EngineSelector.vue';
import SearchHistory from './SearchHistory.vue';
import SearchSuggestions from './SearchSuggestions.vue';
import { useSearch } from '@/composables/useSearch';
import type { SearchEngine } from '@/types/config';

export interface SearchModalProps {
    /** 是否显示（支持 v-model） */
    modelValue: boolean;
    /** 输入框占位提示 */
    placeholder?: string;
    /** 最大宽度 */
    maxWidth?: number | string;
}

const props = withDefaults(defineProps<SearchModalProps>(), {
    placeholder: '输入搜索内容…',
    maxWidth: 640
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'search', payload: { query: string; engine: SearchEngine }): void;
}>();

const {
    query,
    engines,
    currentEngine,
    currentEngineIndex,
    suggestions,
    activeSuggestionIndex,
    isLoadingSuggestions,
    canSearch,
    hasSuggestions,
    history,
    executeSearch,
    executeSearchWithSuggestion,
    clearSuggestions,
    selectEngine,
    removeHistory,
    clearHistory,
    moveSuggestionDown,
    moveSuggestionUp,
    selectActiveSuggestion
} = useSearch({ debounceMs: 200, maxSuggestions: 8, maxLocalSuggestions: 5 });

const inputRef = ref<InstanceType<typeof BaseInput> | null>(null);
const isVisible = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
});

const showHistory = computed(() => !query.value.trim() && history.value.length > 0);

/**
 * 聚焦输入框
 */
function focusInput(): void {
    nextTick(() => {
        const inputEl = inputRef.value?.$el?.querySelector('input');
        inputEl?.focus();
    });
}

/**
 * 关闭并清理建议
 */
function close(): void {
    clearSuggestions();
    isVisible.value = false;
}

/**
 * 提交搜索
 */
async function submitSearch(rawQuery?: string): Promise<void> {
    const success = await executeSearch(rawQuery);
    if (success && currentEngine.value) {
        emit('search', { query: query.value || rawQuery || '', engine: currentEngine.value });
        close();
    }
}

/**
 * 选中建议并搜索
 */
async function selectSuggestion(suggestion: string): Promise<void> {
    const success = await executeSearchWithSuggestion(suggestion);
    if (success && currentEngine.value) {
        emit('search', { query: suggestion, engine: currentEngine.value });
        close();
    }
}

/**
 * 切换搜索引擎
 */
async function handleEngineSelect(index: number): Promise<void> {
    await selectEngine(index);
    focusInput();
}

/**
 * 使用历史记录搜索
 */
async function handleHistorySelect(historyQuery: string): Promise<void> {
    await selectSuggestion(historyQuery);
}

/**
 * 处理输入框键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
    if (!isVisible.value) return;

    switch (event.key) {
        case 'ArrowDown':
            if (hasSuggestions.value) {
                event.preventDefault();
                moveSuggestionDown();
            }
            break;
        case 'ArrowUp':
            if (hasSuggestions.value) {
                event.preventDefault();
                moveSuggestionUp();
            }
            break;
        case 'Enter':
            event.preventDefault();
            if (activeSuggestionIndex.value >= 0 && suggestions.value[activeSuggestionIndex.value]) {
                const selected = selectActiveSuggestion();
                if (selected) {
                    selectSuggestion(selected);
                }
            } else if (canSearch.value) {
                submitSearch();
            }
            break;
        case 'Escape':
            if (hasSuggestions.value) {
                event.preventDefault();
                event.stopPropagation();
                clearSuggestions();
            }
            break;
    }
}

/**
 * 处理建议悬停
 */
function handleSuggestionHover(index: number): void {
    activeSuggestionIndex.value = index;
}

watch(
    () => props.modelValue,
    (visible) => {
        if (visible) {
            focusInput();
        } else {
            clearSuggestions();
        }
    }
);

const closeIconPath = 'M18 6L6 18M6 6l12 12';

const modalContentStyle = {
    background: 'rgba(var(--md-sys-color-surface-rgb), 0.9)',
    border: '1px solid var(--md-sys-color-outline-variant)',
    borderRadius: '20px',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.12)',
    backdropFilter: 'blur(20px)',
    overflow: 'visible',
    minHeight: '380px'
};

const modalBodyStyle = {
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'visible'
};
</script>

<template>
    <ModalOverlay
        v-model="isVisible"
        :show-close="false"
        :max-width="maxWidth"
        :close-on-overlay="true"
        :close-on-esc="!hasSuggestions"
        :lock-scroll="true"
        :z-index="2100"
        content-class="search-modal__content"
        :content-style="modalContentStyle"
        body-class="search-modal__body"
        :body-style="modalBodyStyle"
    >
        <div class="search-modal" @keydown="handleKeydown">
            <div class="search-modal__header">
                <EngineSelector
                    :engines="engines"
                    :model-value="currentEngineIndex"
                    @update:model-value="handleEngineSelect"
                />

                <span class="search-modal__divider" aria-hidden="true" />

                <BaseInput
                    ref="inputRef"
                    v-model="query"
                    class="search-modal__input"
                    type="search"
                    :placeholder="placeholder"
                    autocomplete="off"
                    @keydown="handleKeydown"
                />

                <button
                    type="button"
                    class="search-modal__submit"
                    aria-label="搜索"
                    @click="() => submitSearch()"
                >
                    <IconSvg name="search" :size="20" alt="" />
                </button>

                <button
                    type="button"
                    class="search-modal__close"
                    aria-label="关闭搜索"
                    @click="close"
                >
                    <IconSvg :path="closeIconPath" :size="20" alt="" />
                </button>
            </div>

            <div class="search-modal__main">
                <SearchSuggestions
                    :suggestions="suggestions"
                    :active-index="activeSuggestionIndex"
                    :loading="isLoadingSuggestions"
                    :visible="hasSuggestions"
                    :query="query"
                    @select="selectSuggestion"
                    @hover="handleSuggestionHover"
                />

                <SearchHistory
                    :history="history"
                    :visible="showHistory"
                    @select="handleHistorySelect"
                    @remove="removeHistory"
                    @clear="clearHistory"
                />
            </div>

            <div class="search-modal__footer">
                <div class="search-modal__hints">
                    <span>
                        <kbd>↵</kbd>
                        搜索
                    </span>
                    <span>
                        <kbd>ESC</kbd>
                        关闭
                    </span>
                </div>
                <span v-if="currentEngine" class="search-modal__engine-name">
                    {{ currentEngine.name }}
                </span>
            </div>
        </div>
    </ModalOverlay>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.search-modal {
    display: flex;
    flex-direction: column;
    min-height: 0;

    &__content {
        background: rgba(var(--md-sys-color-surface-rgb), 0.9);
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: 20px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.12);
        backdrop-filter: blur(20px);
        overflow: visible;
        min-height: 380px;
    }

    &__body {
        padding: 0;
        display: flex;
        flex-direction: column;
        overflow: visible;
    }

    &__main {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        border-radius: 0 0 20px 20px;
        @include hide-scrollbar;
    }

    &__header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }

    &__divider {
        width: 1px;
        height: 24px;
        background: var(--md-sys-color-outline-variant);
        flex-shrink: 0;
        margin: 0 2px;
    }

    &__input {
        flex: 1;
        min-width: 0;

        :deep(.mnt-base-input__wrapper) {
            border: none;
            border-radius: 12px;
            padding: 10px 12px;
            background: transparent;
            box-shadow: none;
        }

        :deep(.mnt-base-input__wrapper:focus-within) {
            box-shadow: none;
        }

        :deep(.mnt-base-input__field) {
            font-size: 16px;

            &:focus-visible {
                outline: 2px solid var(--md-sys-color-primary);
                outline-offset: 2px;
                border-radius: 4px;
            }
        }
    }

    &__submit {
        @include button-reset;
        width: 44px;
        height: 44px;
        padding: 0;
        border-radius: 12px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(177, 74, 107, 0.3);
        }

        &:active {
            transform: translateY(0);
        }

        &:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .icon-svg {
            width: 20px;
            height: 20px;
            filter: brightness(0) invert(1);
        }
    }

    &__close {
        @include button-reset;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--md-sys-color-on-surface-variant);
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            background: var(--md-sys-color-surface-variant);
            color: var(--md-sys-color-error);
        }
    }

    &__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: transparent;
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
        border-top: 1px solid var(--md-sys-color-outline-variant);
    }

    &__hints {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;

        span {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        kbd {
            background: rgba(var(--md-sys-color-surface-rgb), 0.8);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            border: 1px solid var(--md-sys-color-outline-variant);
        }
    }

    &__engine-name {
        font-weight: 600;
        color: var(--md-sys-color-primary);
    }
}

// 深色模式
:global(html.dark-mode),
:global(body.dark-mode) {
    .search-modal__content {
        background: rgba(30, 30, 30, 0.88);
        border-color: rgba(255, 255, 255, 0.1);
    }

    .search-modal__hints kbd {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

@include respond-to(mobile) {
    .search-modal__header {
        padding: 8px 12px;
        gap: 6px;
    }

    .search-modal__divider {
        display: none;
    }

    .search-modal__submit {
        width: 40px;
        height: 40px;
    }

    .search-modal__close {
        margin-right: 0;
    }

    .search-modal__footer {
        font-size: 11px;
        padding: 8px 12px;
    }

    .search-modal__hints {
        gap: 8px;
    }
}
</style>
