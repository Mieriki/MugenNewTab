<script setup lang="ts">
/**
 * AppCardDragGhost - 卡片拖拽幽灵
 *
 * 拖拽期间渲染在 body 下的浮动卡片，以指针为中心跟随移动，
 * 视觉复刻 AppCard（图标 + 名称 + 描述），自身不响应任何指针事件。
 */
import { computed } from 'vue';
import { useAppCardDrag } from '@/composables/useAppCardDrag';
import { useLayoutStore } from '@/stores/layout.store';
import { isImageIcon } from '@/utils/image.util';
import IconSvg from '@/components/icon/IconSvg.vue';

const cardDrag = useAppCardDrag();
const layoutStore = useLayoutStore();
const state = cardDrag.state;

const visible = computed(() => state.phase === 'dragging' && !!state.app);

const iconSrc = computed(() => state.app?.icon?.trim() || undefined);
const iconIsImage = computed(() => isImageIcon(iconSrc.value));
const ghostStyle = computed(() => ({
    left: `${state.ghostX - state.cardWidth / 2}px`,
    top: `${state.ghostY - state.cardHeight / 2}px`,
    width: `${state.cardWidth}px`,
    minHeight: `${state.cardHeight}px`,
}));
</script>

<template>
    <Teleport to="body">
        <div
            v-if="visible"
            class="app-card-drag-ghost"
            :class="{ 'app-card-drag-ghost--no-icon-bg': !layoutStore.showIconBackground }"
            :style="ghostStyle"
            aria-hidden="true"
        >
            <div class="app-card-drag-ghost__icon">
                <IconSvg
                    :src="iconSrc"
                    name="site"
                    fallback="site"
                    :size="40"
                    :monochrome="!!iconSrc && !iconIsImage"
                    :alt="state.app?.name"
                />
            </div>
            <div class="app-card-drag-ghost__content">
                <h3 class="app-card-drag-ghost__name">{{ state.app?.name }}</h3>
                <p v-if="state.app?.description" class="app-card-drag-ghost__description">
                    {{ state.app.description }}
                </p>
            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.app-card-drag-ghost {
    position: fixed;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--card-bg);
    border: 1px solid var(--md-sys-color-primary);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
    pointer-events: none;
    transform: scale(1.03);

    &__icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-on-primary-container);
        flex-shrink: 0;
        overflow: hidden;
    }

    // 图标背景关闭时透明
    &--no-icon-bg &__icon {
        background: transparent;
    }

    &__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    &__name {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
        @include text-ellipsis;
    }

    &__description {
        margin: 0;
        font-size: 0.75rem;
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.85;
        line-height: 1.3;
        @include line-clamp(2);
        max-height: 2.8em;
    }
}
</style>
