<script setup lang="ts">
export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'outlined' | 'ghost';
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
    border-radius: var(--ui-radius-md);
    border: 1px solid transparent;
    font-weight: 500;
    letter-spacing: var(--ui-track-tight);
    line-height: 1.4;
    white-space: nowrap;
    // 只有「默认 / hover / active / disabled」四态：不做位移、不做彩色投影。
    // 层级由底色与描边表达，主色只作为 CTA 的填充。
    transition:
        background-color var(--ui-dur-fast) var(--ui-ease),
        border-color var(--ui-dur-fast) var(--ui-ease),
        color var(--ui-dur-fast) var(--ui-ease);
    @include ui-focus-ring;

    &--small {
        min-height: 30px;
        padding: 0 12px;
        font-size: var(--ui-font-small);
        border-radius: var(--ui-radius-sm);
    }

    &--medium {
        min-height: 36px;
        padding: 0 16px;
        font-size: var(--ui-font-small);
    }

    &--large {
        min-height: 40px;
        padding: 0 20px;
        font-size: var(--ui-font-body);
    }

    &--block {
        width: 100%;
    }

    &--primary {
        background: var(--ui-accent);
        color: var(--ui-on-accent);

        &:not(:disabled):hover {
            background: var(--ui-accent-hover);
        }

        &:not(:disabled):active {
            filter: brightness(0.94);
        }
    }

    &--secondary {
        background: var(--ui-elevated);
        color: var(--ui-ink);
        border-color: var(--ui-hairline);

        &:not(:disabled):hover {
            background: var(--ui-elevated-hover);
            border-color: var(--ui-hairline-strong);
        }
    }

    &--outlined {
        background: transparent;
        color: var(--ui-ink);
        border-color: var(--ui-hairline-strong);

        &:not(:disabled):hover {
            background: var(--ui-elevated);
        }
    }

    &--ghost {
        background: transparent;
        color: var(--ui-muted);

        &:not(:disabled):hover {
            background: var(--ui-elevated);
            color: var(--ui-ink);
        }
    }

    &--text {
        background: transparent;
        color: var(--ui-muted);

        &:not(:disabled):hover {
            background: var(--ui-elevated);
            color: var(--ui-ink);
        }
    }

    &--danger {
        background: var(--ui-danger);
        color: #fff;

        &:not(:disabled):hover {
            filter: brightness(1.08);
        }
    }

    &--disabled,
    &--loading,
    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    &__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;

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
