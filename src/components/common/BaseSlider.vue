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
    /** 拖动结束（或键盘调节完成）时触发，用于一次性持久化，避免拖动中连续写存储 */
    (e: 'change', value: number): void;
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

function handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    emit('change', Number(target.value));
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
                @change="handleChange"
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
    gap: 6px;

    &__label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: var(--ui-font-caption);
        color: var(--ui-muted);
        font-weight: 500;
    }

    &__value {
        color: var(--ui-ink);
        font-weight: 500;
        font-variant-numeric: tabular-nums;
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
        height: 3px;
        border-radius: var(--ui-radius-pill);
        background: var(--ui-accent);
        pointer-events: none;
    }

    &__input {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 3px;
        border-radius: var(--ui-radius-pill);
        background: var(--ui-sunken);
        outline: none;
        -webkit-appearance: none;
        appearance: none;
        cursor: pointer;

        &::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--ui-accent);
            border: 2px solid var(--ui-panel);
            cursor: pointer;
            box-shadow: var(--ui-shadow-1);
            transition: box-shadow var(--ui-dur-fast) var(--ui-ease);
        }

        &::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border: 2px solid var(--ui-panel);
            border-radius: 50%;
            background: var(--ui-accent);
            cursor: pointer;
            box-shadow: var(--ui-shadow-1);
        }

        // 悬停只加一圈主色光环，不做缩放位移
        &::-webkit-slider-thumb:hover {
            box-shadow: 0 0 0 3px var(--ui-accent-soft);
        }

        &::-moz-range-thumb:hover {
            box-shadow: 0 0 0 3px var(--ui-accent-soft);
        }

        &:focus-visible {
            outline: 2px solid var(--ui-accent);
            outline-offset: 4px;
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
    height: 3px;
    border-radius: var(--ui-radius-pill);
    background: var(--ui-sunken);
}
</style>
