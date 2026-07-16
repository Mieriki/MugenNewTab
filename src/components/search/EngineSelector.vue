<script setup lang="ts">
/**
 * EngineSelector - 搜索引擎选择器
 *
 * 展示当前选中的搜索引擎图标与名称，点击展开下拉菜单切换引擎。
 * 支持键盘导航与点击外部自动关闭。
 */
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { SearchEngine } from '@/types/config';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface EngineSelectorProps {
    /** 搜索引擎列表 */
    engines: SearchEngine[];
    /** 当前选中的索引（支持 v-model） */
    modelValue: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** 占位提示 */
    placeholder?: string;
}

const props = withDefaults(defineProps<EngineSelectorProps>(), {
    disabled: false,
    placeholder: '选择搜索引擎'
});

const emit = defineEmits<{
    (e: 'update:modelValue', index: number): void;
    (e: 'select', payload: { index: number; engine: SearchEngine }): void;
}>();

const isOpen = ref(false);
const activeIndex = ref(props.modelValue);
const containerRef = ref<HTMLElement | null>(null);

const currentEngine = computed(() => props.engines[props.modelValue] ?? null);
const hasEngines = computed(() => props.engines.length > 0);

function toggle(): void {
    if (props.disabled || !hasEngines.value) return;
    isOpen.value = !isOpen.value;
    if (isOpen.value) {
        activeIndex.value = props.modelValue;
    }
}

function select(index: number): void {
    const engine = props.engines[index];
    if (!engine || props.disabled) return;

    isOpen.value = false;
    emit('update:modelValue', index);
    emit('select', { index, engine });
}

function close(): void {
    isOpen.value = false;
}

function handleOutsideClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (containerRef.value && !containerRef.value.contains(target)) {
        close();
    }
}

function highlightNext(): void {
    if (!hasEngines.value) return;
    activeIndex.value = (activeIndex.value + 1) % props.engines.length;
}

function highlightPrev(): void {
    if (!hasEngines.value) return;
    activeIndex.value = (activeIndex.value - 1 + props.engines.length) % props.engines.length;
}

function handleTriggerKeydown(event: KeyboardEvent): void {
    if (props.disabled || !hasEngines.value) return;

    switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
            event.preventDefault();
            if (!isOpen.value) {
                isOpen.value = true;
                activeIndex.value = props.modelValue;
            } else {
                event.key === 'ArrowDown' ? highlightNext() : highlightPrev();
            }
            break;
        case 'Enter':
        case ' ': // 空格
            event.preventDefault();
            if (isOpen.value) {
                select(activeIndex.value);
            } else {
                isOpen.value = true;
                activeIndex.value = props.modelValue;
            }
            break;
        case 'Escape':
            if (isOpen.value) {
                event.preventDefault();
                close();
            }
            break;
    }
}

function handleOptionKeydown(event: KeyboardEvent, index: number): void {
    if (props.disabled) return;

    switch (event.key) {
        case 'Enter':
        case ' ':
            event.preventDefault();
            select(index);
            break;
        case 'ArrowDown':
            event.preventDefault();
            highlightNext();
            break;
        case 'ArrowUp':
            event.preventDefault();
            highlightPrev();
            break;
        case 'Escape':
            event.preventDefault();
            close();
            break;
    }
}

onMounted(() => {
    window.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
    window.removeEventListener('click', handleOutsideClick);
});

const searchIconPath = 'M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z';
</script>

<template>
    <div
        ref="containerRef"
        class="engine-selector"
        :class="{ 'engine-selector--disabled': disabled, 'engine-selector--open': isOpen }"
    >
        <button
            type="button"
            class="engine-selector__trigger"
            :disabled="disabled || !hasEngines"
            :aria-expanded="isOpen"
            aria-haspopup="listbox"
            @click="toggle"
            @keydown="handleTriggerKeydown"
        >
            <slot name="trigger" :engine="currentEngine" :index="modelValue">
                <span class="engine-selector__icon">
                    <IconSvg
                        v-if="currentEngine"
                        :src="currentEngine.icon"
                        :fallback="searchIconPath"
                        :size="18"
                        alt=""
                    />
                    <IconSvg
                        v-else
                        :path="searchIconPath"
                        :size="18"
                        alt=""
                    />
                </span>
                <span class="engine-selector__name">
                    {{ currentEngine?.name ?? placeholder }}
                </span>
                <span class="engine-selector__arrow" :class="{ 'is-open': isOpen }" aria-hidden="true" />
            </slot>
        </button>

        <Transition name="engine-dropdown">
            <div
                v-show="isOpen"
                class="engine-selector__dropdown"
                role="listbox"
                aria-label="选择搜索引擎"
            >
                <button
                    v-for="(engine, index) in engines"
                    :key="`${engine.name}-${index}`"
                    type="button"
                    class="engine-selector__option"
                    :class="{ 'is-active': index === activeIndex, 'is-selected': index === modelValue }"
                    role="option"
                    :aria-selected="index === modelValue"
                    tabindex="-1"
                    @click="select(index)"
                    @keydown="handleOptionKeydown($event, index)"
                    @mouseenter="activeIndex = index"
                >
                    <slot name="option" :engine="engine" :index="index" :active="index === activeIndex" :selected="index === modelValue">
                        <span class="engine-selector__option-icon">
                            <IconSvg
                                :src="engine.icon"
                                :fallback="searchIconPath"
                                :size="16"
                                alt=""
                            />
                        </span>
                        <span class="engine-selector__option-name">{{ engine.name }}</span>
                    </slot>
                </button>
            </div>
        </Transition>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.engine-selector {
    position: relative;
    flex-shrink: 0;

    &--disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    &__trigger {
        @include button-reset;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 4px;
        border-radius: 8px;
        background: transparent;
        color: var(--md-sys-color-on-surface);
        font-size: 14px;
        font-weight: 600;
        border: none;
        min-width: auto;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover:not(:disabled) {
            color: var(--md-sys-color-primary);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.55;
        }
    }

    &__icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    &__name {
        @include text-ellipsis;
        flex: 1;
        text-align: left;
    }

    &__arrow {
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 4px solid currentColor;
        flex-shrink: 0;
        margin-left: 2px;
        @include md-transition(transform, var(--md-transition-fast));

        &.is-open {
            transform: rotate(180deg);
        }
    }

    &__dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        min-width: 180px;
        max-width: 260px;
        max-height: 320px;
        overflow-y: auto;
        background: var(--md-sys-color-surface);
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        padding: 6px;
        z-index: 3000;
        @include hide-scrollbar;
    }

    &__option {
        @include button-reset;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        font-weight: 500;
        text-align: left;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover,
        &.is-active {
            background: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-primary);
        }

        &.is-selected {
            font-weight: 600;
        }
    }

    &__option-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    &__option-name {
        @include text-ellipsis;
        flex: 1;
    }
}

.engine-dropdown-enter-active,
.engine-dropdown-leave-active {
    transition:
        opacity 0.2s var(--md-easing),
        transform 0.2s var(--md-easing);
}

.engine-dropdown-enter-from,
.engine-dropdown-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}

// 深色模式
:global(html.dark-mode),
:global(body.dark-mode) {
    .engine-selector__dropdown {
        background: rgba(40, 40, 40, 0.98);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

@include respond-to(mobile) {
    .engine-selector__trigger {
        min-width: auto;
        padding: 8px;
    }

    .engine-selector__name {
        display: none;
    }

    .engine-selector__dropdown {
        left: 0;
        right: auto;
        min-width: 160px;
    }
}
</style>
