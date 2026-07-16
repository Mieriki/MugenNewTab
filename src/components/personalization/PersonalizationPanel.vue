<script setup lang="ts">
/**
 * PersonalizationPanel - 个性化设置总面板
 *
 * 整合主题选择、壁纸设置与云同步三个子面板。
 * 通过 v-model 控制显示/隐藏，点击遮罩层可关闭。
 */
import { computed } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import ThemeSelector from './ThemeSelector.vue';
import WallpaperSettings from './WallpaperSettings.vue';
import CloudSyncPanel from './CloudSyncPanel.vue';

export interface PersonalizationPanelProps {
    /** 是否显示面板，支持 v-model */
    modelValue: boolean;
    /** 面板标题 */
    title?: string;
    /** 子面板是否自动初始化对应 store */
    autoInit?: boolean;
}

const props = withDefaults(defineProps<PersonalizationPanelProps>(), {
    title: '个性化设置',
    autoInit: true
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'close'): void;
}>();

const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
});

function close(): void {
    isOpen.value = false;
    emit('close');
}

function handleOverlayClick(): void {
    close();
}

function handleEsc(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isOpen.value) {
        event.preventDefault();
        close();
    }
}
</script>

<template>
    <Teleport to="body">
        <Transition name="personalization-panel">
            <div
                v-if="isOpen"
                class="personalization-panel-wrapper"
                @keydown="handleEsc"
            >
                <div
                    class="personalization-overlay"
                    aria-hidden="true"
                    @click="handleOverlayClick"
                />

                <div
                    class="personalization-dropdown"
                    role="dialog"
                    aria-modal="true"
                    :aria-label="title"
                    tabindex="-1"
                >
                    <div class="personalization-dropdown__header">
                        <div class="personalization-dropdown__title">
                            <IconSvg name="setting" :size="18" color="var(--md-sys-color-primary)" />
                            <h3>{{ title }}</h3>
                        </div>

                        <button
                            type="button"
                            class="personalization-dropdown__close"
                            aria-label="关闭"
                            @click="close"
                        >
                            <IconSvg name="close" :size="20" />
                        </button>
                    </div>

                    <div class="personalization-dropdown__body">
                        <slot>
                            <div class="personalization-columns">
                                <div class="panel-column theme-column">
                                    <ThemeSelector :auto-init="autoInit" />
                                </div>
                                <div class="panel-column wallpaper-column">
                                    <WallpaperSettings :auto-init="autoInit" />
                                </div>
                            </div>
                            <div class="panel-column cloud-sync-column">
                                <CloudSyncPanel />
                            </div>
                        </slot>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.personalization-panel-wrapper {
    position: fixed;
    inset: 0;
    z-index: 1001;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    pointer-events: none;
}

.personalization-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(2px);
    pointer-events: auto;
}

.personalization-dropdown {
    position: fixed;
    top: calc(var(--header-height) + 8px);
    right: 16px;
    width: 560px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - var(--header-height) - 16px);
    background: rgba(var(--md-sys-color-surface-rgb), 0.98);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    border: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    overflow: hidden;
    transform-origin: top right;

    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
        flex-shrink: 0;
    }

    &__title {
        display: flex;
        align-items: center;
        gap: 8px;

        h3 {
            font-size: 16px;
            font-weight: 600;
            color: var(--md-sys-color-on-surface);
            margin: 0;
        }
    }

    &__close {
        @include button-reset;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        color: var(--md-sys-color-on-surface-variant);
        display: flex;
        align-items: center;
        justify-content: center;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            background: var(--md-sys-color-surface-variant);
            color: var(--md-sys-color-error);
        }
    }

    &__body {
        overflow-y: auto;
        padding: 16px 20px;
        @include hide-scrollbar;
    }
}

.personalization-columns {
    display: flex;
    gap: 16px;

    .panel-column {
        flex: 1;
        min-width: 0;

        &.theme-column {
            flex: 0 0 45%;
        }

        &.wallpaper-column {
            flex: 0 0 55%;
        }
    }
}

.cloud-sync-column {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
}

.personalization-panel-enter-active,
.personalization-panel-leave-active {
    transition: opacity 0.25s var(--md-easing);

    .personalization-dropdown {
        transition: transform 0.25s var(--md-easing), opacity 0.25s var(--md-easing);
    }
}

.personalization-panel-enter-from,
.personalization-panel-leave-to {
    opacity: 0;

    .personalization-dropdown {
        opacity: 0;
        transform: translateY(-8px) scale(0.96);
    }
}

html.dark-mode,
body.dark-mode {
    .personalization-dropdown {
        background: rgba(40, 40, 40, 0.98);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

@include respond-to(mobile) {
    .personalization-dropdown {
        top: var(--header-height);
        right: 0;
        left: 0;
        width: 100%;
        max-width: none;
        max-height: calc(100vh - var(--header-height));
        border-radius: 20px 20px 0 0;
    }

    .personalization-columns {
        flex-direction: column;

        .panel-column {
            flex: 1 1 auto !important;
        }
    }
}
</style>
