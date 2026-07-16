<script setup lang="ts">
import { computed } from 'vue';

interface Props {
    /** 当前值（支持 v-model） */
    modelValue: number;
    /** 滑块标签 */
    label?: string;
    /** 最小值 */
    min?: number;
    /** 最大值 */
    max?: number;
    /** 步长 */
    step?: number;
    /** 是否显示当前数值 */
    showValue?: boolean;
    /** 数值格式化函数 */
    formatValue?: (value: number) => string;
    /** 是否禁用 */
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    min: 0,
    max: 100,
    step: 1,
    showValue: true,
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: number): void;
}>();

const displayValue = computed(() => {
    if (props.formatValue) {
        return props.formatValue(props.modelValue);
    }
    return String(props.modelValue);
});

const progressPercent = computed(() => {
    const range = props.max - props.min;
    if (range === 0) return 0;
    return ((props.modelValue - props.min) / range) * 100;
});

function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    emit('update:modelValue', Number(target.value));
}

function clampValue(value: number): number {
    return Math.min(props.max, Math.max(props.min, value));
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowRight' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft') {
        return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1;
    const nextValue = clampValue(props.modelValue + props.step * direction);
    emit('update:modelValue', nextValue);
}
</script>

<template>
    <div class="mnt-base-slider" :class="{ 'mnt-base-slider--disabled': disabled }">
        <label v-if="label || showValue" class="mnt-base-slider__label">
            <span v-if="label" class="mnt-base-slider__label-text">{{ label }}</span>
            <span v-if="showValue" class="mnt-base-slider__value">{{ displayValue }}</span>
        </label>

        <div class="mnt-base-slider__track">
            <input
                type="range"
                class="mnt-base-slider__input"
                :min="min"
                :max="max"
                :step="step"
                :value="modelValue"
                :disabled="disabled"
                @input="handleInput"
                @keydown="handleKeydown"
            />
            <div class="mnt-base-slider__progress" :style="{ width: `${progressPercent}%` }" />
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-base-slider {
    display: flex;
    flex-direction: column;
    gap: 4px;

    &__label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    &__value {
        color: var(--md-sys-color-primary);
        font-weight: 700;
    }

    &__track {
        position: relative;
        width: 100%;
        height: 16px;
        display: flex;
        align-items: center;
    }

    &__progress {
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        height: 4px;
        border-radius: 2px;
        background: var(--md-sys-color-primary);
        pointer-events: none;
    }

    &__input {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 4px;
        border-radius: 2px;
        background: var(--md-sys-color-surface-variant);
        outline: none;
        -webkit-appearance: none;
        appearance: none;
        cursor: pointer;

        &::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: var(--md-sys-color-primary);
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            @include md-transition(transform, var(--md-transition-fast));
        }

        &::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border: none;
            border-radius: 50%;
            background: var(--md-sys-color-primary);
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            @include md-transition(transform, var(--md-transition-fast));
        }

        &::-webkit-slider-thumb:hover {
            transform: scale(1.2);
        }

        &::-moz-range-thumb:hover {
            transform: scale(1.2);
        }

        &:focus-visible {
            outline: 2px solid var(--md-sys-color-primary);
            outline-offset: 2px;
        }
    }

    &--disabled {
        opacity: 0.5;

        .mnt-base-slider__input {
            cursor: not-allowed;
        }
    }
}

// Firefox 进度条背景
.mnt-base-slider__input::-moz-range-track {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--md-sys-color-surface-variant);
}
</style>
