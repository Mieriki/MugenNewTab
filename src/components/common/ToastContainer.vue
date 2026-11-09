<script setup lang="ts">
import { computed } from 'vue';
import { useToast, type ToastItem, type ToastType } from '@/composables/useToast';

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
                    <svg viewBox="0 0 24 24" fill="currentColor"><path :d="getIconPath(item.type)" /></svg>
                </span>
                <span class="mnt-toast__message" v-html="item.message" />
                <button
                    v-if="item.closable"
                    type="button"
                    class="mnt-toast__close"
                    aria-label="关闭通知"
                    @click="handleClose(item)"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
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
    // 类型强调色：success / error / info 跟随主题变量
    --toast-accent: var(--ui-accent);

    pointer-events: auto;
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--ui-radius-lg);
    font-size: var(--ui-font-small);
    font-weight: 500;
    line-height: 1.5;
    color: var(--ui-ink);
    // 浮层：面板底 + 发丝描边 + 一档中性投影，左侧一条 3px 类型色作为唯一强调
    border: 1px solid var(--ui-hairline);
    border-left: 3px solid var(--toast-accent);
    box-shadow: var(--ui-shadow-2);
    background: var(--ui-panel);
    backdrop-filter: blur(12px);

    &__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        color: var(--toast-accent);

        svg {
            width: 18px;
            height: 18px;
            display: block;
        }
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
        width: 24px;
        height: 24px;
        border-radius: var(--ui-radius-sm);
        color: var(--ui-muted);
        flex-shrink: 0;
        @include ui-transition(background-color, color);
        @include ui-focus-ring;

        svg {
            width: 14px;
            height: 14px;
            display: block;
        }

        &:hover {
            background: var(--ui-elevated-hover);
            color: var(--ui-ink);
        }
    }

    &--success {
        --toast-accent: var(--ui-success);
    }

    &--error {
        --toast-accent: var(--ui-danger);
    }

    &--warning {
        --toast-accent: #f59e0b;
    }

    &--info {
        --toast-accent: var(--ui-accent);
    }
}

// 进入/离开动画：只动透明度与极小的位移，不做弹跳
.mnt-toast-enter-active,
.mnt-toast-leave-active {
    transition:
        opacity var(--ui-dur-slow) var(--ui-ease),
        transform var(--ui-dur-slow) var(--ui-ease);
}

.mnt-toast-enter-from,
.mnt-toast-leave-to {
    opacity: 0;
    transform: translateY(-4px);
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
