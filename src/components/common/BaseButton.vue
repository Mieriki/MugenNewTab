<script setup lang="ts">
export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'outlined';
export type ButtonSize = 'small' | 'medium' | 'large';

interface Props {
    /** 按钮样式变体 */
    variant?: ButtonVariant;
    /** 按钮尺寸 */
    size?: ButtonSize;
    /** 原生 button type */
    type?: 'button' | 'submit' | 'reset';
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否显示加载状态 */
    loading?: boolean;
    /** 是否块级宽度 */
    block?: boolean;
    /** 原生 aria-label */
    ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
    variant: 'primary',
    size: 'medium',
    type: 'button',
});

const emit = defineEmits<{
    (e: 'click', event: MouseEvent): void;
}>();

function handleClick(event: MouseEvent): void {
    if (props.disabled || props.loading) return;
    emit('click', event);
}

const spinnerPath = 'M12 2v4m0 12v4M2 12h4m12 0h4';
</script>

<template>
    <button
        class="mnt-base-button"
        :class="[
            `mnt-base-button--${variant}`,
            `mnt-base-button--${size}`,
            { 'mnt-base-button--block': block, 'mnt-base-button--loading': loading, 'mnt-base-button--disabled': disabled },
        ]"
        :type="type"
        :disabled="disabled || loading"
        :aria-label="ariaLabel"
        :aria-busy="loading"
        @click="handleClick"
    >
        <span v-if="loading" class="mnt-base-button__spinner" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path :d="spinnerPath" />
            </svg>
        </span>
        <span v-if="$slots.icon && !loading" class="mnt-base-button__icon" aria-hidden="true">
            <slot name="icon" />
        </span>
        <span v-if="$slots.default" class="mnt-base-button__content">
            <slot />
        </span>
    </button>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-base-button {
    @include button-reset;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 10px;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
    @include md-transition(all, var(--md-transition-fast));
    @include focus-ring;

    &--small {
        padding: 6px 12px;
        font-size: 12px;
        border-radius: 8px;
    }

    &--medium {
        padding: 10px 20px;
        font-size: 14px;
    }

    &--large {
        padding: 12px 28px;
        font-size: 15px;
    }

    &--block {
        width: 100%;
    }

    &--primary {
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);

        &:not(:disabled):hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(177, 74, 107, 0.3);
        }
    }

    &--secondary {
        background: var(--md-sys-color-surface-variant);
        color: var(--md-sys-color-on-surface);
        border: 1px solid var(--md-sys-color-outline);

        &:not(:disabled):hover {
            background: var(--md-sys-color-outline-variant);
            border-color: var(--md-sys-color-primary);
        }
    }

    &--outlined {
        background: transparent;
        color: var(--md-sys-color-primary);
        border: 1px solid var(--md-sys-color-outline);

        &:not(:disabled):hover {
            background: var(--md-sys-color-primary-container);
            border-color: var(--md-sys-color-primary);
        }
    }

    &--text {
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);

        &:not(:disabled):hover {
            color: var(--md-sys-color-on-surface);
            background: var(--md-sys-color-surface-variant);
        }
    }

    &--danger {
        background: var(--md-sys-color-error);
        color: #fff;

        &:not(:disabled):hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }
    }

    &--disabled,
    &--loading,
    &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    &__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;

        :deep(svg) {
            width: 100%;
            height: 100%;
        }
    }

    &__spinner {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        animation: mnt-spin 1s linear infinite;

        svg {
            width: 100%;
            height: 100%;
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
</style>
