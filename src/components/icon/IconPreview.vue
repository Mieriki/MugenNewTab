<!--
  IconPreview - 表单中的图标预览组件
  基于 IconSvg 展示当前图标，支持尺寸、占位图与操作插槽。
-->
<template>
    <div class="icon-preview" :class="[`is-${sizeName}`, { 'is-empty': isEmpty }]">
        <div class="icon-preview__box" :style="boxStyle">
            <IconSvg
                :src="resolvedSrc"
                :size="iconSize"
                :monochrome="monochrome"
                :alt="label || '图标预览'"
                :fallback="resolvedPlaceholder"
            />
        </div>
        <div v-if="label || showClear || editable || $slots.actions" class="icon-preview__meta">
            <span v-if="label" class="icon-preview__label">{{ label }}</span>
            <div class="icon-preview__actions">
                <button
                    v-if="editable"
                    type="button"
                    class="icon-preview__btn"
                    @click="onSelect"
                >
                    <IconSvg name="edit" :size="14" />
                    <span>选择</span>
                </button>
                <button
                    v-if="showClear && !isEmpty"
                    type="button"
                    class="icon-preview__btn icon-preview__btn--danger"
                    @click="onClear"
                >
                    <IconSvg name="delete" :size="14" />
                    <span>清除</span>
                </button>
                <slot name="actions" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconSvg from './IconSvg.vue';
import { getSystemIconUrl, createPlaceholderSvg } from '@/utils/image.util';

/** 预设尺寸映射 */
const SIZE_MAP: Record<Exclude<IconPreviewSize, number>, { box: number; icon: number }> = {
    small: { box: 40, icon: 24 },
    medium: { box: 48, icon: 28 },
    large: { box: 56, icon: 32 },
};

/** 支持的预设尺寸 */
type IconPreviewSize = 'small' | 'medium' | 'large' | number;

/** 组件接收的属性 */
interface Props {
    /** 当前图标值（URL、系统图标名称或空） */
    modelValue?: string;
    /** 预览框尺寸，默认 medium */
    size?: IconPreviewSize;
    /** 标签文本 */
    label?: string;
    /** 占位图标名称或地址 */
    placeholder?: string;
    /** 是否为单色图标 */
    monochrome?: boolean;
    /** 是否显示清除按钮 */
    showClear?: boolean;
    /** 是否显示选择按钮 */
    editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    size: 'medium',
    label: '',
    placeholder: 'picture',
    monochrome: false,
    showClear: false,
    editable: false,
});

const emit = defineEmits<{
    /** 图标值变化 */
    (e: 'update:modelValue', value: string): void;
    /** 点击选择按钮 */
    (e: 'select'): void;
    /** 点击清除按钮 */
    (e: 'clear'): void;
}>();

const sizeName = computed(() => (typeof props.size === 'number' ? 'custom' : props.size));

const boxMetrics = computed(() => {
    if (typeof props.size === 'number') {
        return { box: props.size, icon: Math.round(props.size * 0.6) };
    }
    return SIZE_MAP[props.size];
});

const iconSize = computed(() => boxMetrics.value.icon);

const isEmpty = computed(() => !props.modelValue?.trim());

/** 将纯名称转换为系统图标 URL，保留其他地址 */
const resolvedSrc = computed(() => {
    const value = props.modelValue?.trim() ?? '';
    if (!value) {
        return '';
    }
    if (/^[\w-]+$/i.test(value) && !value.includes('/') && !value.includes('.')) {
        return getSystemIconUrl(value);
    }
    return value;
});

const resolvedPlaceholder = computed(() => {
    const value = props.placeholder?.trim();
    if (!value) {
        return createPlaceholderSvg();
    }
    if (/^[\w-]+$/i.test(value) && !value.includes('/') && !value.includes('.')) {
        return getSystemIconUrl(value);
    }
    return value;
});

const boxStyle = computed(() => ({
    width: `${boxMetrics.value.box}px`,
    height: `${boxMetrics.value.box}px`,
}));

function onSelect() {
    emit('select');
}

function onClear() {
    emit('update:modelValue', '');
    emit('clear');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
@use '@/styles/mixins.scss' as *;

.icon-preview {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-3);

    &__box {
        border-radius: var(--ui-radius-md);
        border: 1px solid var(--ui-hairline-strong);
        background: var(--ui-sunken);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
        transition:
            border-color var(--ui-dur-fast) var(--ui-ease),
            box-shadow var(--ui-dur-fast) var(--ui-ease);

        &:focus-within {
            border-color: var(--ui-accent);
            box-shadow: 0 0 0 3px var(--ui-accent-softer);
        }
    }

    &.is-empty &__box {
        opacity: 0.7;
    }

    &__meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }

    &__label {
        font-size: var(--ui-font-caption);
        color: var(--ui-muted);
        line-height: 1.3;
    }

    &__actions {
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
    }

    &__btn {
        @include button-reset;
        @include flex-center(row, 4px);
        min-height: 28px;
        padding: 0 10px;
        border-radius: var(--ui-radius-sm);
        font-size: var(--ui-font-caption);
        font-weight: 500;
        color: var(--ui-ink);
        background: var(--ui-panel);
        border: 1px solid var(--ui-hairline-strong);
        @include ui-transition(background-color, border-color, color);

        &:hover {
            background: var(--ui-elevated);
            border-color: var(--ui-hairline-strong);
        }

        &--danger:hover {
            border-color: var(--ui-danger);
            color: var(--ui-danger);
        }
    }
}
</style>
