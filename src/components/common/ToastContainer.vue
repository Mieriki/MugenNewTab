<script setup lang="ts">
import { computed } from 'vue';
import { useToast, type ToastItem, type ToastType } from '@/composables/useToast';
import IconSvg from '@/components/icon/IconSvg.vue';

export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

interface Props {
    /** Toast 容器位置 */
    position?: ToastPosition;
}

const props = withDefaults(defineProps<Props>(), {
    position: 'top-right',
});

const { toasts, dismiss } = useToast();

const containerClass = computed(() => [
    'mnt-toast-container',
    `mnt-toast-container--${props.position}`,
]);

function getIconPath(type: ToastType): string {
    switch (type) {
        case 'success':
            return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z';
        case 'error':
            return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';
        case 'warning':
            return 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z';
        case 'info':
        default:
            return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z';
    }
}

function getToastClass(type: ToastType): string {
    return `mnt-toast--${type}`;
}

function handleClose(item: ToastItem): void {
    dismiss(item.id);
}
</script>

<template>
    <Teleport to="body">
        <TransitionGroup
            tag="div"
            name="mnt-toast"
            :class="containerClass"
            role="region"
            aria-live="polite"
            aria-label="通知"
        >
            <div
                v-for="item in toasts"
                :key="item.id"
                class="mnt-toast"
                :class="getToastClass(item.type)"
                role="status"
            >
                <span class="mnt-toast__icon" aria-hidden="true">
                    <IconSvg :path="getIconPath(item.type)" :size="20" />
                </span>
                <span class="mnt-toast__message" v-html="item.message" />
                <button
                    v-if="item.closable"
                    type="button"
                    class="mnt-toast__close"
                    aria-label="关闭通知"
                    @click="handleClose(item)"
                >
                    <IconSvg name="close" :size="16" />
                </button>
            </div>
        </TransitionGroup>
    </Teleport>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-toast-container {
    position: fixed;
    z-index: 3000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    pointer-events: none;
    max-width: 360px;
    width: 100%;

    &--top-right {
        top: 16px;
        right: 16px;
    }

    &--top-left {
        top: 16px;
        left: 16px;
    }

    &--bottom-right {
        bottom: 16px;
        right: 16px;
        flex-direction: column-reverse;
    }

    &--bottom-left {
        bottom: 16px;
        left: 16px;
        flex-direction: column-reverse;
    }
}

.mnt-toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    background: var(--md-sys-color-inverse-surface);
    color: var(--md-sys-color-inverse-on-surface);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--md-sys-color-outline-variant);
    @include md-transition(all, var(--md-transition-fast));

    &__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
    }

    &__message {
        flex: 1;
        min-width: 0;
        word-break: break-word;
    }

    &__close {
        @include button-reset;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 6px;
        color: inherit;
        opacity: 0.7;
        flex-shrink: 0;
        @include focus-ring;

        &:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.12);
        }
    }

    &--success &__icon {
        color: var(--md-sys-color-success);
    }

    &--error &__icon {
        color: var(--md-sys-color-error);
    }

    &--warning &__icon {
        color: #F59E0B;
    }

    &--info &__icon {
        color: var(--md-sys-color-primary);
    }
}

// 进入/离开动画
.mnt-toast-enter-active,
.mnt-toast-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.mnt-toast-enter-from,
.mnt-toast-leave-to {
    opacity: 0;
    transform: translateX(24px);
}

.mnt-toast-leave-from,
.mnt-toast-enter-to {
    opacity: 1;
    transform: translateX(0);
}

@include respond-to(mobile) {
    .mnt-toast-container {
        left: 16px;
        right: 16px;
        max-width: none;
        padding: 12px;

        &--top-right,
        &--top-left {
            top: 12px;
        }

        &--bottom-right,
        &--bottom-left {
            bottom: 12px;
        }
    }
}
</style>
