<script setup lang="ts">
import { computed, watch, onBeforeUnmount, ref } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';

interface Props {
    /** 是否显示模态框（支持 v-model） */
    modelValue: boolean;
    /** 模态框标题 */
    title?: string;
    /** 最大宽度，支持数字（px）或字符串 */
    maxWidth?: number | string;
    /** 最大高度，支持数字（px）或字符串 */
    maxHeight?: string;
    /** 是否显示右上角关闭按钮 */
    showClose?: boolean;
    /** 点击遮罩层是否关闭 */
    closeOnOverlay?: boolean;
    /** 按 ESC 是否关闭 */
    closeOnEsc?: boolean;
    /** 遮罩层 z-index */
    zIndex?: number;
    /** 是否禁用 body 滚动（打开时） */
    lockScroll?: boolean;
    /** 内容容器额外 class */
    contentClass?: string;
    /** 内容容器额外样式 */
    contentStyle?: Record<string, string>;
    /** 主体区域额外 class */
    bodyClass?: string;
    /** 主体区域额外样式 */
    bodyStyle?: Record<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
    maxWidth: 520,
    maxHeight: '85vh',
    showClose: true,
    closeOnOverlay: true,
    closeOnEsc: true,
    zIndex: 2000,
    lockScroll: true,
    contentClass: '',
    contentStyle: () => ({}),
    bodyClass: '',
    bodyStyle: () => ({}),
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'close'): void;
    (e: 'open'): void;
    (e: 'afterEnter'): void;
}>();

const isActive = ref(false);
let enterTimer: ReturnType<typeof setTimeout> | null = null;

function setBodyScroll(blocked: boolean): void {
    if (!props.lockScroll || typeof document === 'undefined') return;
    document.body.style.overflow = blocked ? 'hidden' : '';
}

function open(): void {
    if (enterTimer) clearTimeout(enterTimer);
    emit('open');
    enterTimer = setTimeout(() => {
        isActive.value = true;
        emit('afterEnter');
    }, 10);
}

function close(): void {
    if (enterTimer) clearTimeout(enterTimer);
    isActive.value = false;
    emit('close');
    emit('update:modelValue', false);
}

function handleOverlayClick(event: MouseEvent): void {
    if (!props.closeOnOverlay) return;
    if (event.target === event.currentTarget) {
        close();
    }
}

function handleKeydown(event: KeyboardEvent): void {
    if (props.closeOnEsc && event.key === 'Escape' && isActive.value) {
        event.preventDefault();
        close();
    }
}

watch(
    () => props.modelValue,
    (value) => {
        setBodyScroll(value);
        if (value) {
            open();
        } else {
            isActive.value = false;
        }
    },
    { immediate: true }
);

onBeforeUnmount(() => {
    if (enterTimer) clearTimeout(enterTimer);
    setBodyScroll(false);
});

const baseContentStyle = computed(() => {
    const width = typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth;
    return {
        maxWidth: width,
        maxHeight: props.maxHeight,
    };
});

const overlayStyle = computed(() => ({
    zIndex: props.zIndex,
}));

const closeIconPath = 'M18 6L6 18M6 6l12 12';
</script>

<template>
    <Teleport to="body">
        <Transition name="mnt-modal" appear>
            <div
                v-show="modelValue"
                class="mnt-modal-overlay"
                :class="{ 'mnt-modal-overlay--active': isActive }"
                :style="overlayStyle"
                role="dialog"
                aria-modal="true"
                @click="handleOverlayClick"
                @keydown="handleKeydown"
            >
                <div
                    class="mnt-modal-content"
                    :class="contentClass"
                    :style="[baseContentStyle, contentStyle]"
                    role="document"
                    @keydown.stop="handleKeydown"
                >
                    <div v-if="$slots.header || title || showClose" class="mnt-modal-header">
                        <div class="mnt-modal-header__left">
                            <slot name="header">
                                <slot name="title">
                                    <h3 v-if="title" class="mnt-modal-title">{{ title }}</h3>
                                </slot>
                            </slot>
                        </div>
                        <button
                            v-if="showClose"
                            type="button"
                            class="mnt-modal-close"
                            aria-label="关闭"
                            @click="close"
                        >
                            <IconSvg :path="closeIconPath" :size="20" color="currentColor" />
                        </button>
                    </div>

                    <div
                        v-if="$slots.default"
                        class="mnt-modal-body"
                        :class="bodyClass"
                        :style="[bodyStyle]"
                    >
                        <slot />
                    </div>

                    <div v-if="$slots.footer" class="mnt-modal-footer">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-modal-overlay {
    @include absolute-fill;
    position: fixed;
    @include flex-center(row, 0);
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    opacity: 0;
    visibility: hidden;
    transition:
        opacity 0.3s var(--md-easing),
        visibility 0.3s var(--md-easing);
    padding: 24px;

    &--active {
        opacity: 1;
        visibility: visible;
    }
}

.mnt-modal-content {
    background: var(--md-sys-color-surface);
    border-radius: 16px;
    width: 90%;
    max-width: 520px;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--md-sys-color-outline-variant);
    transform: scale(0.9) translateY(20px);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    .mnt-modal-overlay--active & {
        transform: scale(1) translateY(0);
    }
}

.mnt-modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    &__left {
        min-width: 0;
        flex: 1;
    }
}

.mnt-modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
    margin: 0;
    line-height: 1.4;
}

.mnt-modal-close {
    @include button-reset;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    @include flex-center(row, 0);
    flex-shrink: 0;
    @include md-transition(all, var(--md-transition-fast));
    @include focus-ring;

    &:hover {
        background: var(--md-sys-color-surface-variant);
        color: var(--md-sys-color-error);
    }
}

.mnt-modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
    @include hide-scrollbar;
}

.mnt-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    align-items: center;
}

// 深色模式适配
:global(html.dark-mode),
:global(body.dark-mode) {
    .mnt-modal-content {
        background: rgba(40, 40, 40, 0.98);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

// 移动端适配
@include respond-to(mobile) {
    .mnt-modal-overlay {
        padding: 16px;
        align-items: flex-end;
    }

    .mnt-modal-content {
        width: 100%;
        max-height: 80vh;
        border-radius: 20px 20px 0 0;
        transform: translateY(100%);

        .mnt-modal-overlay--active & {
            transform: translateY(0);
        }
    }
}
</style>
