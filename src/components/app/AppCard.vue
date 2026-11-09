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

/** 是否已设置图标（未设置时显示默认站点图标，走系统图标遮罩、颜色跟随主题） */
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
                    <IconSvg name="edit" :size="16" monochrome :alt="`编辑 ${app.name}`" />
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
                    <IconSvg name="delete" :size="16" monochrome :alt="`删除 ${app.name}`" />
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
    gap: var(--ui-space-3);
    padding: var(--ui-space-3);
    // 固定等高：容纳两行简介，无简介时内容垂直居中
    height: 76px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--card-radius, var(--ui-radius-lg));
    box-shadow: var(--card-shadow);
    // 磨砂：默认 none，开启后采样卡片背后的壁纸（值由 cardStyle.store 下发）
    -webkit-backdrop-filter: var(--card-backdrop, none);
    backdrop-filter: var(--card-backdrop, none);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
    contain: layout style paint;
    transform: translateZ(0);
    // 悬停只换描边与底色，不做位移——几十张卡片同时上浮会让整页发晃
    transition:
        border-color var(--ui-dur-fast) var(--ui-ease),
        background-color var(--ui-dur-fast) var(--ui-ease),
        box-shadow var(--ui-dur-fast) var(--ui-ease);
    @include ui-focus-ring;

    &:hover {
        border-color: color-mix(in srgb, var(--ui-accent) 55%, transparent);
        // 悬停只往卡片底色里掺一点主色，保留用户设定的不透明度
        background: color-mix(in srgb, var(--ui-accent) 4%, var(--card-bg));
    }

    &:hover &__name {
        color: var(--ui-accent);
    }

    &.is-hidden {
        opacity: 0.7;
        background: var(--ui-elevated);
        border-style: dashed;
    }

    &.is-dragging {
        opacity: 0.6;
        box-shadow: var(--ui-shadow-3);
        cursor: grabbing;
        z-index: 1000;
    }

    &.is-pressing {
        background: var(--ui-elevated);
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
        border-radius: var(--ui-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--ui-accent-soft);
        color: var(--ui-accent);
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
        font-size: var(--ui-font-subtitle);
        font-weight: 500;
        letter-spacing: var(--ui-track-tight);
        color: var(--ui-ink);
        @include text-ellipsis;
        @include ui-transition(color);
    }

    &__description {
        margin: 0;
        font-size: var(--ui-font-caption);
        color: var(--ui-muted);
        line-height: 1.35;
        @include line-clamp(2);
        max-height: 2.8em;
    }

    &__actions {
        position: absolute;
        top: 6px;
        right: 6px;
        display: flex;
        align-items: center;
        gap: 2px;
        opacity: 0;
        transition: opacity var(--ui-dur-fast) var(--ui-ease);
    }

    &:hover &__actions,
    &.show-actions &__actions,
    &:focus-within &__actions {
        opacity: 1;
    }

    &__action-btn {
        width: 26px;
        height: 26px;
        min-width: auto;
        padding: 0 !important;
        border-radius: var(--ui-radius-sm);
        background: var(--ui-elevated);
        border: 1px solid var(--ui-hairline);
        color: var(--ui-muted);

        &:hover {
            background: var(--ui-accent);
            border-color: var(--ui-accent);
            color: var(--ui-on-accent);
        }

        &--delete:hover {
            background: var(--ui-danger);
            border-color: var(--ui-danger);
            color: #fff;
        }
    }
}

// 卡片底色 / 边框全部来自主题与 cardStyle 下发的 --card-*，
// 深色变体不需要另一套规则
</style>
