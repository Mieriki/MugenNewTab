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
 * - ArrowRight/Tab：光标在末尾时补全到建议词（输入框内有幽灵文本预览）
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
    selectActiveSuggestion,
    getCompletionCandidate
} = useSearch({ debounceMs: 200, maxSuggestions: 10, maxLocalSuggestions: 5 });

const inputRef = ref<InstanceType<typeof BaseInput> | null>(null);
const isVisible = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
});

const showHistory = computed(() => !query.value.trim() && history.value.length > 0);
const showEmptyState = computed(() => !query.value.trim() && history.value.length === 0);

/**
 * 幽灵文本预览的补全后缀：
 * 仅当补全候选以当前 query 为前缀时展示剩余部分（高亮项未必是前缀匹配）。
 */
const ghostSuffix = computed(() => {
    const candidate = getCompletionCandidate();
    if (!candidate) {
        return '';
    }
    if (!candidate.toLowerCase().startsWith(query.value.toLowerCase())) {
        return '';
    }
    return candidate.slice(query.value.length);
});

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
    // executeSearch 成功后会清空 query，提前捕获保证事件载荷不丢关键词
    const text = (rawQuery ?? query.value).trim();
    const success = await executeSearch(rawQuery);
    if (success && currentEngine.value) {
        emit('search', { query: text, engine: currentEngine.value });
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
 * 尝试用补全候选填充输入框（右箭头 / Tab）。
 * 仅在光标位于文本末尾时生效，返回是否已执行补全。
 */
function tryCompleteQuery(event: KeyboardEvent): boolean {
    const target = event.target as HTMLInputElement | null;
    if (!target || typeof target.selectionStart !== 'number') {
        return false;
    }

    const atEnd =
        target.selectionStart === target.value.length &&
        target.selectionEnd === target.value.length;
    if (!atEnd) {
        return false;
    }

    const candidate = getCompletionCandidate();
    if (!candidate) {
        return false;
    }

    event.preventDefault();
    query.value = candidate;
    return true;
}

/**
 * 处理输入框键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
    if (!isVisible.value || event.defaultPrevented) return;

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
        case 'ArrowRight':
            tryCompleteQuery(event);
            break;
        case 'Tab':
            tryCompleteQuery(event);
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

// 注意：ModalOverlay 经 Teleport 渲染，scoped 样式命不中容器，
// 容器样式以内联方式下发；下方 scoped 中的 &__content / &__body 仅作同步备份。
const modalContentStyle = {
    background: 'rgba(var(--md-sys-color-surface-rgb), 0.92)',
    border: '1px solid var(--md-sys-color-outline-variant)',
    borderRadius: '24px',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0, 0, 0, 0.08)',
    backdropFilter: 'blur(24px)',
    overflow: 'visible'
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
                <div class="search-modal__bar">
                    <EngineSelector
                        :engines="engines"
                        :model-value="currentEngineIndex"
                        @update:model-value="handleEngineSelect"
                    />

                    <span class="search-modal__divider" aria-hidden="true" />

                    <div class="search-modal__input-wrap">
                        <BaseInput
                            ref="inputRef"
                            v-model="query"
                            class="search-modal__input"
                            type="search"
                            :placeholder="placeholder"
                            autocomplete="off"
                            @keydown="handleKeydown"
                        />
                        <span
                            v-if="ghostSuffix"
                            class="search-modal__ghost"
                            aria-hidden="true"
                        ><span class="search-modal__ghost-query">{{ query }}</span><span class="search-modal__ghost-suffix">{{ ghostSuffix }}</span></span>
                    </div>

                    <button
                        type="button"
                        class="search-modal__submit"
                        aria-label="搜索"
                        @click="() => submitSearch()"
                    >
                        <IconSvg name="search" :size="18" alt="" />
                    </button>
                </div>

                <button
                    type="button"
                    class="search-modal__close"
                    aria-label="关闭搜索"
                    @click="close"
                >
                    <IconSvg :path="closeIconPath" :size="18" alt="" />
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

                <div v-if="showEmptyState" class="search-modal__empty">
                    <p class="search-modal__empty-title">搜索全网，一触即达</p>
                    <p class="search-modal__empty-text">输入关键词开始搜索，历史记录会显示在这里</p>
                </div>
            </div>

            <div class="search-modal__footer">
                <div class="search-modal__hints">
                    <span>
                        <kbd>↵</kbd>
                        搜索
                    </span>
                    <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd>
                        选择
                    </span>
                    <span>
                        <kbd>→</kbd>
                        补全
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

    // 同步备份：实际生效的是内联 modalContentStyle（见脚本注释）
    &__content {
        background: rgba(var(--md-sys-color-surface-rgb), 0.92);
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: 24px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0, 0, 0, 0.08);
        backdrop-filter: blur(24px);
        overflow: visible;
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
        border-radius: 0 0 24px 24px;
        @include hide-scrollbar;
    }

    &__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px 10px;
    }

    // 胶囊搜索栏：引擎选择 + 输入 + 提交按钮整合为一体
    &__bar {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 4px 4px 12px;
        border-radius: 16px;
        background: color-mix(in srgb, var(--md-sys-color-on-surface) 5%, transparent);
        border: 1px solid transparent;
        @include md-transition(all, var(--md-transition-fast));

        &:focus-within {
            background: rgba(var(--md-sys-color-surface-rgb), 0.85);
            border-color: var(--md-sys-color-primary);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent);
        }
    }

    &__divider {
        width: 1px;
        height: 20px;
        background: var(--md-sys-color-outline-variant);
        flex-shrink: 0;
        margin: 0 2px;
    }

    &__input-wrap {
        position: relative;
        flex: 1;
        min-width: 0;
    }

    // 幽灵文本：镜像输入框的字体与内边距，仅展示补全后缀
    // 注意：与下方 __input 的 padding/font-size 联动，改动时需同步
    &__ghost {
        position: absolute;
        left: 6px;
        top: 50%;
        transform: translateY(-50%);
        max-width: calc(100% - 12px);
        overflow: hidden;
        font-size: 15px;
        line-height: normal;
        white-space: pre;
        pointer-events: none;
        user-select: none;
    }

    &__ghost-query {
        visibility: hidden;
    }

    &__ghost-suffix {
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.55;
    }

    &__input {
        width: 100%;
        min-width: 0;

        :deep(.mnt-base-input__wrapper) {
            border: none;
            border-radius: 12px;
            padding: 8px 6px;
            background: transparent;
            box-shadow: none;
        }

        :deep(.mnt-base-input__wrapper:focus-within) {
            box-shadow: none;
        }

        :deep(.mnt-base-input__field) {
            font-size: 15px;

            // 焦点指示由 __bar 的 focus-within 光晕承担
            &:focus-visible {
                outline: none;
            }
        }
    }

    &__submit {
        @include button-reset;
        width: 36px;
        height: 36px;
        padding: 0;
        border-radius: 10px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            opacity: 0.92;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent);
        }

        &:active {
            transform: translateY(0);
        }

        &:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .icon-svg {
            width: 18px;
            height: 18px;
            filter: brightness(0) invert(1);
        }
    }

    &__close {
        @include button-reset;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--md-sys-color-on-surface-variant);
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            background: color-mix(in srgb, var(--md-sys-color-error) 10%, transparent);
            color: var(--md-sys-color-error);
        }
    }

    // 无历史记录时的空状态
    &__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 36px 24px;
        text-align: center;
    }

    &__empty-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__empty-text {
        margin: 0;
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.8;
    }

    &__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 16px;
        background: transparent;
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
        border-top: 1px solid var(--md-sys-color-outline-variant);
    }

    &__hints {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;

        span {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        kbd {
            min-width: 20px;
            padding: 2px 5px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 11px;
            text-align: center;
            background: color-mix(in srgb, var(--md-sys-color-on-surface) 6%, transparent);
            border: 1px solid color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
            border-bottom-width: 2px;
        }
    }

    &__engine-name {
        font-weight: 600;
        color: var(--md-sys-color-primary);
    }
}

// 深色模式（tonal 变量随主题自适应，仅需覆盖容器背景）
:global(html.dark-mode),
:global(body.dark-mode) {
    .search-modal__content {
        background: rgba(30, 30, 30, 0.88);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

@include respond-to(mobile) {
    .search-modal__header {
        padding: 10px 12px 8px;
        gap: 6px;
    }

    .search-modal__bar {
        padding-left: 8px;
    }

    .search-modal__divider {
        display: none;
    }

    .search-modal__submit {
        width: 34px;
        height: 34px;
    }

    .search-modal__empty {
        padding: 28px 20px;
    }

    .search-modal__footer {
        font-size: 11px;
        padding: 8px 12px;
    }

    .search-modal__hints {
        gap: 10px;
    }
}
</style>
