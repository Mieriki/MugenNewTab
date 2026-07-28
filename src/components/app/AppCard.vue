<script setup lang="ts">
/**
 * AppCard - 应用卡片
 *
 * 展示单个应用站点的图标、名称与描述，支持点击打开、编辑与删除操作按钮。
 * 隐藏应用会附加半透明虚线边框样式。所有图标使用 IconSvg，不使用 emoji。
 */
import { computed } from 'vue';
import type { AppItem } from '@/types/app';
import { isImageIcon } from '@/utils/image.util';
import IconSvg from '@/components/icon/IconSvg.vue';
import BaseButton from '@/components/common/BaseButton.vue';

export interface AppCardProps {
    /** 应用数据 */
    app: AppItem;
    /** 是否可拖拽（仅样式标记，实际拖拽由外层 useDragSort 控制） */
    draggable?: boolean;
    /** 是否处于拖拽中 */
    dragging?: boolean;
    /** 是否处于长按按压中 */
    pressing?: boolean;
    /** 是否显示编辑按钮 */
    editable?: boolean;
    /** 是否显示删除按钮 */
    deletable?: boolean;
    /** 是否始终显示操作按钮（默认悬停显示） */
    showActions?: boolean;
    /** 是否显示图标背景（false 时图标背景透明） */
    iconBackground?: boolean;
}

const props = withDefaults(defineProps<AppCardProps>(), {
    draggable: false,
    dragging: false,
    pressing: false,
    editable: true,
    deletable: true,
    showActions: false,
    iconBackground: true,
});

const emit = defineEmits<{
    /** 点击卡片主体（操作按钮区域除外） */
    (e: 'click', app: AppItem): void;
    /** 点击编辑按钮 */
    (e: 'edit', app: AppItem): void;
    /** 点击删除按钮 */
    (e: 'delete', app: AppItem): void;
}>();

const isHidden = computed(() => !!props.app.hidden);

const iconSrc = computed(() => {
    const icon = props.app.icon?.trim();
    if (!icon) {
        return undefined;
    }
    return icon;
});

const iconIsImage = computed(() => isImageIcon(iconSrc.value));

/** 是否已设置图标（未设置时显示默认站点图标，保持彩色不加单色滤镜） */
const hasIcon = computed(() => !!iconSrc.value);

function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.app-card__actions')) {
        return;
    }
    emit('click', props.app);
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        emit('click', props.app);
    }
}

function handleEdit(event: MouseEvent): void {
    event.stopPropagation();
    emit('edit', props.app);
}

function handleDelete(event: MouseEvent): void {
    event.stopPropagation();
    emit('delete', props.app);
}
</script>

<template>
    <article
        class="app-card"
        :class="{
            'is-hidden': isHidden,
            'is-dragging': dragging,
            'is-pressing': pressing,
            'is-draggable': draggable,
            'show-actions': showActions,
            'no-icon-bg': !iconBackground,
        }"
        :data-app-id="app.id"
        tabindex="0"
        role="link"
        :aria-label="app.name"
        @click="handleClick"
        @keydown="handleKeydown"
    >
        <div class="app-card__icon">
            <IconSvg
                :src="iconSrc"
                name="site"
                fallback="site"
                :size="40"
                :monochrome="hasIcon && !iconIsImage"
                :alt="app.name"
            />
        </div>

        <div class="app-card__content">
            <h3 class="app-card__name" :title="app.name">{{ app.name }}</h3>
            <p v-if="app.description" class="app-card__description" :title="app.description">
                {{ app.description }}
            </p>
        </div>

        <div v-if="editable || deletable" class="app-card__actions">
            <BaseButton
                v-if="editable"
                class="app-card__action-btn"
                variant="text"
                size="small"
                :aria-label="`编辑 ${app.name}`"
                @click="handleEdit"
            >
                <template #icon>
                    <IconSvg name="edit" :size="16" :alt="`编辑 ${app.name}`" />
                </template>
            </BaseButton>
            <BaseButton
                v-if="deletable"
                class="app-card__action-btn app-card__action-btn--delete"
                variant="text"
                size="small"
                :aria-label="`删除 ${app.name}`"
                @click="handleDelete"
            >
                <template #icon>
                    <IconSvg name="delete" :size="16" :alt="`删除 ${app.name}`" />
                </template>
            </BaseButton>
        </div>
    </article>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.app-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    // 固定等高：容纳两行简介，无简介时内容垂直居中
    height: 76px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    box-shadow: var(--card-shadow);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
    contain: layout style paint;
    transform: translateZ(0);
    @include md-transition(all, var(--md-transition-fast));
    @include focus-ring;

    &:hover {
        transform: translateY(-2px);
        border-color: var(--md-sys-color-primary);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    &:hover &__name {
        color: var(--md-sys-color-primary);
    }

    &.is-hidden {
        opacity: 0.7;
        background: var(--md-sys-color-surface-variant);
        border-style: dashed;
    }

    &.is-dragging {
        opacity: 0.6;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        cursor: grabbing;
        z-index: 1000;
        transform: scale(1.02);
    }

    &.is-pressing {
        background: var(--md-sys-color-surface-variant);
    }

    &.is-draggable {
        cursor: grab;
    }

    &.is-dragging,
    &.is-pressing {
        transition: none;
    }

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
    &.no-icon-bg &__icon {
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
        @include md-transition(color, var(--md-transition-fast));
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

    &__actions {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    &:hover &__actions,
    &.show-actions &__actions,
    &:focus-within &__actions {
        opacity: 1;
    }

    &__action-btn {
        width: 28px;
        height: 28px;
        min-width: auto;
        padding: 0 !important;
        border-radius: 6px;
        background: var(--md-sys-color-surface-variant);
        color: var(--md-sys-color-on-surface-variant);

        &:hover {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
        }

        &--delete:hover {
            background: var(--md-sys-color-error);
            color: #fff;
        }
    }
}

// 深色模式覆盖
:global(html.dark-mode),
:global(body.dark-mode) {
    .app-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.12);
    }
}
</style>
