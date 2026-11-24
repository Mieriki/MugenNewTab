<script setup lang="ts">
/**
 * AppCard - 应用卡片
 *
 * 展示单个应用站点的图标、名称与描述，支持点击打开与「更多」菜单（编辑 / 删除等）。
 * 隐藏应用会附加半透明虚线边框样式。所有图标使用 IconSvg，不使用 emoji。
 */
import { computed } from 'vue';
import type { AppItem } from '@/types/app';
import { isImageIcon } from '@/utils/image.util';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface AppCardProps {
    /** 应用数据 */
    app: AppItem;
    /** 是否可拖拽（仅样式标记，实际拖拽由外层 useDragSort 控制） */
    draggable?: boolean;
    /** 是否处于拖拽中 */
    dragging?: boolean;
    /** 是否处于长按按压中 */
    pressing?: boolean;
    /** 是否显示图标背景（false 时图标背景透明） */
    iconBackground?: boolean;
}

const props = withDefaults(defineProps<AppCardProps>(), {
    draggable: false,
    dragging: false,
    pressing: false,
    iconBackground: true,
});

export interface AppCardContextMenuPayload {
    app: AppItem;
    /** 触发坐标（视口坐标），用于定位菜单 */
    point: { x: number; y: number };
}

const emit = defineEmits<{
    /** 点击卡片主体（「更多」按钮区域除外） */
    (e: 'click', app: AppItem): void;
    /** 右键或键盘菜单键请求打开操作菜单 */
    (e: 'contextmenu', payload: AppCardContextMenuPayload): void;
    /** 点击「更多」按钮请求打开操作菜单 */
    (e: 'open-menu', payload: AppCardContextMenuPayload): void;
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
    if (target?.closest('.app-card__more')) {
        return;
    }
    emit('click', props.app);
}

function handleKeydown(event: KeyboardEvent): void {
    // ContextMenu 键 / Shift+F10 打开操作菜单，锚定在卡片中心
    const isMenuKey =
        event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
    if (isMenuKey) {
        event.preventDefault();
        const rect = event.currentTarget instanceof HTMLElement
            ? event.currentTarget.getBoundingClientRect()
            : null;
        emit('contextmenu', {
            app: props.app,
            point: {
                x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
                y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2
            }
        });
        return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        emit('click', props.app);
    }
}

function handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    emit('contextmenu', {
        app: props.app,
        point: { x: event.clientX, y: event.clientY }
    });
}

/** 「更多」按钮：把菜单挂在按钮右下角，与极简模式的磁贴一致 */
function handleMore(event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    emit('open-menu', {
        app: props.app,
        point: {
            x: rect ? rect.left + rect.width : 0,
            y: rect ? rect.bottom + 4 : 0
        }
    });
}</script>

<template>
    <article
        class="app-card"
        :class="{
            'is-hidden': isHidden,
            'is-dragging': dragging,
            'is-pressing': pressing,
            'is-draggable': draggable,
            'no-icon-bg': !iconBackground,
        }"
        :data-app-id="app.id"
        tabindex="0"
        role="link"
        :aria-label="app.name"
        @click="handleClick"
        @keydown="handleKeydown"
        @contextmenu="handleContextMenu"
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

        <button
            type="button"
            class="app-card__more"
            :aria-label="`更多操作 ${app.name}`"
            title="更多操作"
            @click="handleMore"
        >
            <IconSvg name="more" :size="16" monochrome alt="" />
        </button>
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

    // 「更多」按钮：与极简模式磁贴的 .minimal-tile__more 保持同一套外观
    &__more {
        @include button-reset;
        position: absolute;
        top: 6px;
        right: 6px;
        width: 20px;
        height: 20px;
        border-radius: var(--ui-radius-pill);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--ui-panel);
        border: 1px solid var(--ui-hairline);
        color: var(--ui-muted);
        opacity: 0;
        transition:
            opacity var(--ui-dur-fast) var(--ui-ease),
            background-color var(--ui-dur-fast) var(--ui-ease),
            color var(--ui-dur-fast) var(--ui-ease);

        &:hover {
            background: var(--ui-accent);
            border-color: var(--ui-accent);
            color: var(--ui-on-accent);
        }

        &:focus-visible {
            opacity: 1;
            outline: 2px solid var(--ui-accent);
            outline-offset: 2px;
        }
    }

    &:hover &__more,
    &:focus-within &__more {
        opacity: 1;
    }
}

// 卡片底色 / 边框全部来自主题与 cardStyle 下发的 --card-*，
// 深色变体不需要另一套规则
</style>
