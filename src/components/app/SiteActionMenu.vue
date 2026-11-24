<script setup lang="ts">
/**
 * SiteActionMenu - 站点操作菜单
 *
 * 卡片模式与极简模式共用的右键菜单：打开、复制链接、编辑、移动到分类、隐藏、删除。
 *
 * 设计要点：
 * - 只负责呈现与键盘导航，所有动作通过事件交给调用方执行，便于单测
 * - 定位基于视口坐标，右侧/底部空间不足时自动翻转，避免菜单被裁切
 * - 「移动到分类」用内联展开而不是二级浮层，省掉子菜单的边界计算，触屏也更好点
 * - 支持 ↑↓ / Home / End 在菜单项间移动，Esc 关闭，外部指针按下即关闭
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AppItem, Category } from '@/types/app';
import { isImageIcon } from '@/utils/image.util';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface SiteActionMenuProps {
    /** 当前操作的站点 */
    app: AppItem;
    /** 可移动到的分类列表（不含「全部」虚拟分类） */
    categories: Category[];
    /** 期望显示的视口 X 坐标 */
    x: number;
    /** 期望显示的视口 Y 坐标 */
    y: number;
}

const props = defineProps<SiteActionMenuProps>();

const emit = defineEmits<{
    /** 关闭菜单 */
    (e: 'close'): void;
    /** 在新标签页打开站点 */
    (e: 'open'): void;
    /** 编辑站点 */
    (e: 'edit'): void;
    /** 删除站点 */
    (e: 'delete'): void;
    /** 复制站点链接 */
    (e: 'copy-link'): void;
    /** 隐藏 / 取消隐藏站点 */
    (e: 'toggle-hidden'): void;
    /** 移动到指定分类 */
    (e: 'move', categoryId: string): void;
}>();

/** 菜单与视口边缘的最小间距 */
const EDGE_GAP = 8;

const rootEl = ref<HTMLElement | null>(null);
const position = ref({ left: props.x, top: props.y });
/** 完成定位后才显示，避免菜单在错误位置闪一下 */
const isReady = ref(false);
const categoryExpanded = ref(false);

const isHidden = computed(() => !!props.app.hidden);

const iconIsMonochrome = computed(() => {
    const icon = props.app.icon?.trim();
    return !!icon && !isImageIcon(icon);
});

/** 站点域名，作为菜单头部的次要信息 */
const hostLabel = computed(() => {
    try {
        return new URL(props.app.url).host.replace(/^www\./, '');
    } catch {
        return props.app.url;
    }
});

/** 当前站点是否已在目标分类里 */
function isCurrentCategory(categoryId: string): boolean {
    return props.app.category === categoryId;
}

/**
 * 依据菜单实际尺寸把坐标收进视口。
 * 右侧放不下时翻到指针左侧，底部放不下时整体上移。
 */
function clampPosition(): void {
    const el = rootEl.value;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    let left = props.x;
    let top = props.y;

    if (left + rect.width + EDGE_GAP > window.innerWidth) {
        left = props.x - rect.width;
    }
    if (left < EDGE_GAP) {
        left = EDGE_GAP;
    }
    if (top + rect.height + EDGE_GAP > window.innerHeight) {
        top = Math.max(EDGE_GAP, window.innerHeight - rect.height - EDGE_GAP);
    }

    position.value = { left, top };
}

/** 菜单内所有可用按钮，用于键盘导航 */
function getFocusableItems(): HTMLElement[] {
    const el = rootEl.value;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>('.site-menu__item:not([disabled])'));
}

function handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
        case 'Escape':
            event.preventDefault();
            emit('close');
            return;
        case 'ArrowDown':
        case 'ArrowUp': {
            event.preventDefault();
            const items = getFocusableItems();
            if (items.length === 0) return;
            const index = items.indexOf(document.activeElement as HTMLElement);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            const next = index === -1 ? 0 : (index + delta + items.length) % items.length;
            items[next]?.focus();
            return;
        }
        case 'Home':
            event.preventDefault();
            getFocusableItems()[0]?.focus();
            return;
        case 'End': {
            event.preventDefault();
            const items = getFocusableItems();
            items[items.length - 1]?.focus();
            return;
        }
        default:
    }
}

/** 点击菜单外部关闭 */
function handleOutsidePointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (target && rootEl.value?.contains(target)) {
        return;
    }
    emit('close');
}

function handleViewportChange(): void {
    emit('close');
}

function toggleCategoryList(): void {
    categoryExpanded.value = !categoryExpanded.value;
}

function handleMove(categoryId: string): void {
    if (isCurrentCategory(categoryId)) {
        categoryExpanded.value = false;
        return;
    }
    emit('move', categoryId);
}

// 展开分类列表后菜单变高，需要重新收进视口
watch(categoryExpanded, async () => {
    await nextTick();
    clampPosition();
});

onMounted(() => {
    // 监听同步注册，避免挂载到定位完成之间出现「点外部不关闭」的空窗
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    // 键盘监听挂在 document 上：鼠标右键打开时焦点可能仍在磁贴上，
    // 只绑在菜单根节点会导致 Esc / 方向键失效
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('blur', handleViewportChange);

    void nextTick().then(() => {
        clampPosition();
        isReady.value = true;
        // preventScroll：避免聚焦第一项时把页面滚走
        getFocusableItems()[0]?.focus({ preventScroll: true });
    });
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    document.removeEventListener('keydown', handleKeydown, true);
    document.removeEventListener('scroll', handleViewportChange, true);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('blur', handleViewportChange);
});
</script>

<template>
    <div
        ref="rootEl"
        class="site-menu"
        :class="{ 'is-ready': isReady }"
        :style="{ left: `${position.left}px`, top: `${position.top}px` }"
        role="menu"
        aria-label="站点操作"
        @contextmenu.prevent
    >
        <div class="site-menu__header">
            <span class="site-menu__header-icon">
                <IconSvg
                    :src="app.icon"
                    name="site"
                    fallback="site"
                    :size="16"
                    :monochrome="iconIsMonochrome"
                    alt=""
                />
            </span>
            <span class="site-menu__header-text">
                <span class="site-menu__header-name">{{ app.name }}</span>
                <span class="site-menu__header-host">{{ hostLabel }}</span>
            </span>
            <span v-if="isHidden" class="site-menu__badge">已隐藏</span>
        </div>

        <div class="site-menu__list">
            <button type="button" class="site-menu__item" role="menuitem" @click="emit('open')">
                <IconSvg name="link" :size="14" monochrome alt="" />
                <span class="site-menu__label">打开</span>
            </button>

            <button type="button" class="site-menu__item" role="menuitem" @click="emit('copy-link')">
                <IconSvg name="copy" :size="14" monochrome alt="" />
                <span class="site-menu__label">复制链接</span>
            </button>

            <div class="site-menu__divider" role="separator" />

            <button type="button" class="site-menu__item" role="menuitem" @click="emit('edit')">
                <IconSvg name="edit" :size="14" monochrome alt="" />
                <span class="site-menu__label">编辑</span>
            </button>

            <button
                type="button"
                class="site-menu__item"
                role="menuitem"
                :aria-expanded="categoryExpanded"
                :disabled="categories.length === 0"
                @click="toggleCategoryList"
            >
                <IconSvg name="folder" :size="14" monochrome alt="" />
                <span class="site-menu__label">移动到分类</span>
                <IconSvg
                    class="site-menu__chevron"
                    :name="categoryExpanded ? 'arrow-up' : 'arrow-down'"
                    :size="12"
                    monochrome
                    alt=""
                />
            </button>

            <div v-if="categoryExpanded" class="site-menu__sublist" role="group" aria-label="分类列表">
                <button
                    v-for="category in categories"
                    :key="category.id"
                    type="button"
                    class="site-menu__item site-menu__item--sub"
                    role="menuitem"
                    :class="{ 'is-current': isCurrentCategory(category.id) }"
                    :disabled="isCurrentCategory(category.id)"
                    @click="handleMove(category.id)"
                >
                    <IconSvg
                        v-if="isCurrentCategory(category.id)"
                        name="check"
                        :size="12"
                        monochrome
                        alt=""
                    />
                    <span v-else class="site-menu__dot" aria-hidden="true" />
                    <span class="site-menu__label">{{ category.name }}</span>
                </button>
            </div>

            <button type="button" class="site-menu__item" role="menuitem" @click="emit('toggle-hidden')">
                <IconSvg :name="isHidden ? 'eye' : 'eye-off'" :size="14" monochrome alt="" />
                <span class="site-menu__label">{{ isHidden ? '取消隐藏' : '隐藏此站点' }}</span>
            </button>

            <div class="site-menu__divider" role="separator" />

            <button
                type="button"
                class="site-menu__item site-menu__item--danger"
                role="menuitem"
                @click="emit('delete')"
            >
                <IconSvg name="delete" :size="14" monochrome alt="" />
                <span class="site-menu__label">删除</span>
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

// 浮层菜单：不透明面板 + 发丝描边 + 一档中性投影，与 FabMenu 的列表保持同一套外观
.site-menu {
    position: fixed;
    z-index: 60;
    min-width: 196px;
    max-width: 260px;
    padding: var(--ui-space-1);
    @include ui-floating(3, var(--ui-radius-lg));
    // 定位完成前隐藏，避免在指针处闪一下再跳到正确位置
    visibility: hidden;
    opacity: 0;
    transition: opacity var(--ui-dur-fast) var(--ui-ease);

    &.is-ready {
        visibility: visible;
        opacity: 1;
    }
}

.site-menu__header {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
    padding: var(--ui-space-1) var(--ui-space-2) var(--ui-space-2);
    min-width: 0;
}

.site-menu__header-icon {
    width: 24px;
    height: 24px;
    border-radius: var(--ui-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--ui-sunken);
}

.site-menu__header-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    gap: 1px;
}

.site-menu__header-name {
    font-size: var(--ui-font-subtitle);
    font-weight: 600;
    letter-spacing: var(--ui-track-tight);
    color: var(--ui-ink);
    @include text-ellipsis;
}

.site-menu__header-host {
    font-size: var(--ui-font-micro);
    color: var(--ui-muted-soft);
    @include text-ellipsis;
}

.site-menu__badge {
    flex-shrink: 0;
    padding: 1px var(--ui-space-1);
    border-radius: var(--ui-radius-pill);
    font-size: var(--ui-font-micro);
    color: var(--ui-muted);
    background: var(--ui-elevated);
    border: 1px solid var(--ui-hairline);
}

.site-menu__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.site-menu__item {
    @include button-reset;
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
    width: 100%;
    min-height: 32px;
    padding: 0 var(--ui-space-2);
    border-radius: var(--ui-radius-md);
    font-size: var(--ui-font-small);
    color: var(--ui-ink);
    text-align: left;
    @include ui-interactive;

    // 图标跟着文字弱化，hover 时回到正文色
    :deep(.icon-svg) {
        color: var(--ui-muted);
        transition: color var(--ui-dur-fast) var(--ui-ease);
    }

    &:hover:not(:disabled) :deep(.icon-svg) {
        color: var(--ui-ink);
    }

    &:focus-visible {
        outline: 2px solid var(--ui-accent);
        outline-offset: -2px;
    }

    &:disabled {
        opacity: 0.45;
        cursor: default;
        background: transparent;
    }

    &--danger {
        color: var(--ui-danger);

        :deep(.icon-svg) {
            color: var(--ui-danger);
        }

        &:hover:not(:disabled) {
            background: var(--ui-danger-soft);
            color: var(--ui-danger);
        }
    }

    &--sub {
        padding-left: var(--ui-space-5);
        font-size: var(--ui-font-caption);
    }

    // 当前分类：主色文字 + 淡主色底，是菜单里唯一的彩色行
    &.is-current {
        color: var(--ui-accent);
        background: var(--ui-accent-softer);
        font-weight: 600;

        :deep(.icon-svg) {
            color: var(--ui-accent);
        }
    }
}

.site-menu__label {
    flex: 1;
    min-width: 0;
    @include text-ellipsis;
}

.site-menu__chevron {
    color: var(--ui-muted-soft);
}

.site-menu__dot {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
}

.site-menu__sublist {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 168px;
    overflow-y: auto;
    margin: 1px 0 1px var(--ui-space-2);
    padding-left: var(--ui-space-1);
    border-left: 1px solid var(--ui-hairline);
    @include hide-scrollbar;
}

.site-menu__divider {
    height: 1px;
    margin: var(--ui-space-1) var(--ui-space-2);
    background: var(--ui-hairline);
}
</style>
