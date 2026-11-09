<script setup lang="ts">
/**
 * BaseSegmented - 分段控件
 *
 * 一条凹陷轨道 + 一个浮起的选中块，对应截图里的「月之亮面 / 月之暗面 / 跟随系统」
 * 与「S / M / L / XL」。选项数量少、语义互斥时用它替代一排按钮。
 *
 * 键盘：← → Home End 在选项间移动并立即选中（role="radiogroup" 语义）。
 */
import { computed, ref } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface SegmentedOption {
    /** 选项值 */
    value: string;
    /** 选项文字 */
    label: string;
    /** 可选的系统图标名 */
    icon?: string;
    /** 可选的悬停说明 */
    title?: string;
}

interface Props {
    /** 当前选中值，支持 v-model */
    modelValue: string;
    /** 选项列表 */
    options: SegmentedOption[];
    /** 是否禁用整个控件 */
    disabled?: boolean;
    /** 无障碍名称 */
    ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    ariaLabel: undefined
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'change', value: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);

const activeIndex = computed(() => props.options.findIndex((item) => item.value === props.modelValue));

function select(value: string): void {
    if (props.disabled || value === props.modelValue) return;
    emit('update:modelValue', value);
    emit('change', value);
}

/** ← → Home End 移动选中项；焦点跟着走，读屏才不会丢位置 */
function handleKeydown(event: KeyboardEvent): void {
    if (props.disabled) return;
    const total = props.options.length;
    if (total === 0) return;

    const current = activeIndex.value < 0 ? 0 : activeIndex.value;
    let next: number | null = null;

    switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
            next = (current + 1) % total;
            break;
        case 'ArrowLeft':
        case 'ArrowUp':
            next = (current - 1 + total) % total;
            break;
        case 'Home':
            next = 0;
            break;
        case 'End':
            next = total - 1;
            break;
        default:
            return;
    }

    event.preventDefault();
    select(props.options[next].value);
    const buttons = rootRef.value?.querySelectorAll<HTMLButtonElement>('.mnt-segmented__item');
    buttons?.[next]?.focus();
}
</script>

<template>
    <div
        ref="rootRef"
        class="mnt-segmented"
        :class="{ 'mnt-segmented--disabled': disabled }"
        role="radiogroup"
        :aria-label="ariaLabel"
        @keydown="handleKeydown"
    >
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="mnt-segmented__item"
            :class="{ 'is-active': option.value === modelValue }"
            role="radio"
            :aria-checked="option.value === modelValue"
            :title="option.title"
            :disabled="disabled"
            :tabindex="option.value === modelValue ? 0 : -1"
            @click="select(option.value)"
        >
            <IconSvg v-if="option.icon" :name="option.icon" :size="14" monochrome />
            <span>{{ option.label }}</span>
        </button>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-segmented {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--ui-radius-md);
    background: var(--ui-sunken);
    border: 1px solid var(--ui-hairline);
    flex-shrink: 0;

    &__item {
        @include button-reset;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 26px;
        padding: 0 10px;
        border-radius: var(--ui-radius-sm);
        font-size: var(--ui-font-small);
        font-weight: 500;
        color: var(--ui-muted);
        white-space: nowrap;
        @include ui-transition(background-color, color);
        @include ui-focus-ring;

        &:hover:not(.is-active) {
            color: var(--ui-ink);
        }

        &.is-active {
            background: var(--ui-panel);
            color: var(--ui-ink);
            border: 1px solid var(--ui-hairline);
            // 选中块"浮"在轨道上：用内描边 + 一级微阴影，不用位移
            box-shadow: var(--ui-shadow-1);
        }
    }

    &--disabled {
        opacity: 0.5;

        .mnt-segmented__item {
            cursor: not-allowed;
        }
    }
}
</style>
