<script setup lang="ts">
/**
 * Sidebar - 左侧分类导航栏
 *
 * 展示应用分类列表，支持折叠态、移动端抽屉、分类拖拽排序以及搜索入口。
 * 当未传入 categories 时，会尝试从 useDataManager 初始化并读取分类数据。
 */
import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    watch
} from 'vue';
import type { Category } from '@/types/app';
import { useDataManager } from '@/composables/useDataManager';
import { useDragSort } from '@/composables/useDragSort';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface SidebarProps {
    /** 分类列表；未传入时从 useDataManager 读取 */
    categories?: Category[];
    /** 当前选中分类 ID */
    activeCategoryId?: string;
    /** 是否折叠 */
    collapsed?: boolean;
    /** 移动端是否打开 */
    mobileOpen?: boolean;
    /** 是否启用分类拖拽排序 */
    enableDragSort?: boolean;
    /** 是否显示已隐藏站点 */
    showHiddenApps?: boolean;
}

const props = withDefaults(defineProps<SidebarProps>(), {
    categories: undefined,
    activeCategoryId: 'all',
    collapsed: false,
    mobileOpen: false,
    enableDragSort: true,
    showHiddenApps: false
});

const emit = defineEmits<{
    (e: 'select-category', categoryId: string): void;
    (e: 'update:mobileOpen', value: boolean): void;
    (e: 'open-search'): void;
    (e: 'order-change', orderedIds: string[]): void;
    (e: 'toggle-hidden-apps'): void;
}>();

const dataManager = useDataManager({ autoInit: false });

const displayedCategories = computed(() => props.categories ?? dataManager.categories.value);

const menuRef = ref<HTMLElement | null>(null);
const suppressClick = ref(false);
let suppressTimer: ReturnType<typeof setTimeout> | null = null;

const dragDisabled = computed(() => !props.enableDragSort || props.collapsed);

const { isDragging, isPressing, currentId } = useDragSort({
    containerRef: menuRef,
    itemSelector: '.nav-item[data-draggable="true"]',
    direction: 'vertical',
    disabled: dragDisabled,
    canDrag: (element) => element.dataset.draggable === 'true',
    onEnd: (event) => {
        if (!menuRef.value) {
            return;
        }

        const draggableItems = Array.from(
            menuRef.value.querySelectorAll<HTMLElement>('.nav-item[data-draggable="true"]')
        );
        const fromId = draggableItems[event.fromIndex]?.dataset.id;
        const toId = draggableItems[event.toIndex]?.dataset.id;

        if (!fromId || !toId || fromId === toId) {
            return;
        }

        const orderedIds = displayedCategories.value
            .filter((category) => category.id !== 'all')
            .map((category) => category.id);
        const fromOrderIndex = orderedIds.indexOf(fromId);
        const toOrderIndex = orderedIds.indexOf(toId);

        if (fromOrderIndex === -1 || toOrderIndex === -1) {
            return;
        }

        const [moved] = orderedIds.splice(fromOrderIndex, 1);
        orderedIds.splice(toOrderIndex, 0, moved);

        emit('order-change', orderedIds);

        suppressClick.value = true;
        if (suppressTimer) {
            clearTimeout(suppressTimer);
        }
        suppressTimer = setTimeout(() => {
            suppressClick.value = false;
        }, 100);
    }
});

onMounted(() => {
    if (props.categories === undefined) {
        dataManager.init().catch((error) => {
            console.error('[Sidebar] 初始化数据失败:', error);
        });
    }
});

onUnmounted(() => {
    if (suppressTimer) {
        clearTimeout(suppressTimer);
    }
});

function isDraggable(category: Category): boolean {
    return category.id !== 'all';
}

function handleCategoryClick(category: Category): void {
    if (suppressClick.value || isDragging.value) {
        return;
    }
    emit('select-category', category.id);
}

function handleSearchClick(): void {
    emit('open-search');
}

function handleOverlayClick(): void {
    emit('update:mobileOpen', false);
}

watch(
    () => props.mobileOpen,
    (open) => {
        if (open) {
            nextTick(() => {
                const activeItem = menuRef.value?.querySelector('.nav-item.active') as HTMLElement | null;
                activeItem?.scrollIntoView({ block: 'nearest' });
            });
        }
    }
);
</script>

<template>
    <aside
        class="sidebar"
        :class="{ collapsed: collapsed, open: mobileOpen }"
        :aria-hidden="mobileOpen ? undefined : 'true'"
    >
        <div ref="menuRef" class="nav-menu">
            <slot name="header" />

            <button
                v-for="category in displayedCategories"
                :key="category.id"
                type="button"
                class="nav-item"
                :class="{
                    active: category.id === activeCategoryId,
                    pressing: isPressing && currentId === category.id,
                    dragging: isDragging && currentId === category.id
                }"
                :data-id="category.id"
                :data-title="category.name"
                :data-draggable="isDraggable(category)"
                @click="handleCategoryClick(category)"
            >
                <span class="nav-icon">
                    <IconSvg
                        :src="category.icon"
                        :size="20"
                        :monochrome="category.monochrome"
                        :alt="category.name"
                    />
                </span>
                <span class="nav-text">{{ category.name }}</span>
            </button>

            <slot name="footer" />
        </div>

        <div class="sidebar-footer">
            <button
                type="button"
                class="search-nav-item"
                @click="handleSearchClick"
            >
                <span class="nav-icon">
                    <IconSvg name="search" :size="20" />
                </span>
                <span class="nav-text">全局搜索</span>
                <span class="search-shortcut">Ctrl+K</span>
            </button>
        </div>
    </aside>

    <div
        v-if="mobileOpen"
        class="sidebar-overlay"
        @click="handleOverlayClick"
    />
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.sidebar {
    position: fixed;
    left: 0;
    top: var(--header-height);
    width: var(--sidebar-width);
    height: calc(100vh - var(--header-height));
    background: var(--md-sys-color-primary-container);
    z-index: 999;
    overflow-y: auto;
    overflow-x: hidden;
    border-right: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    flex-direction: column;
    @include md-transition(width);
    contain: layout;
    will-change: width;

    &.collapsed {
        width: var(--sidebar-collapsed-width);
    }

    &.collapsed .nav-item,
    &.collapsed .search-nav-item {
        justify-content: center;
        padding-left: 0;
        padding-right: 0;
    }

    &.collapsed .nav-icon {
        margin-right: 0;
    }

    &.collapsed .nav-text,
    &.collapsed .search-shortcut {
        opacity: 0;
        width: 0;
        display: none;
    }

    &.collapsed .nav-item:hover::after {
        content: attr(data-title);
        position: absolute;
        left: calc(100% + 8px);
        top: 50%;
        transform: translateY(-50%);
        background: var(--md-sys-color-inverse-surface);
        color: var(--md-sys-color-inverse-on-surface);
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 1003;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        pointer-events: none;
    }
}

.nav-menu {
    padding: 12px 8px;
    flex: 1;
}

.nav-item {
    @include button-reset;
    width: 100%;
    display: flex;
    align-items: center;
    padding: 10px 12px;
    margin: 4px 0;
    border-radius: 8px;
    color: var(--md-sys-color-on-surface);
    text-decoration: none;
    font-weight: 500;
    font-size: 13px;
    position: relative;
    white-space: nowrap;
    border: 1px solid transparent;
    @include md-transition(all, var(--md-transition-fast));

    &:hover {
        background: var(--hover-bg);
        color: var(--md-sys-color-primary);
    }

    &.active {
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        border-color: rgba(255, 255, 255, 0.2);
    }

    &.pressing {
        background: var(--md-sys-color-surface-variant);
    }

    &.dragging {
        opacity: 0.6;
        background: var(--md-sys-color-surface-variant);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        cursor: grabbing;
        z-index: 100;
    }

    &[data-draggable='true'] {
        cursor: grab;
    }

    &[data-draggable='false'] {
        cursor: pointer;
    }
}

.nav-icon {
    margin-right: 12px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    @include md-transition(margin);
}

.nav-text {
    @include md-transition(opacity, var(--md-transition-fast));
    overflow: hidden;
}

.sidebar-footer {
    padding: 12px 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    margin-top: auto;
}

.search-nav-item {
    @include button-reset;
    width: 100%;
    display: flex;
    align-items: center;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--md-sys-color-on-surface);
    background: var(--md-sys-color-surface-variant);
    font-weight: 500;
    font-size: 13px;
    @include md-transition(all, 0.2s);
    border: 1px solid transparent;

    &:hover {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-primary);
        border-color: var(--md-sys-color-primary);
        transform: translateY(-1px);
    }
}

.search-shortcut {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.6;
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
}

.sidebar-overlay {
    position: fixed;
    top: var(--header-height);
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(var(--md-sys-color-background-rgb), 0.5);
    z-index: 998;
    backdrop-filter: blur(4px);
}

@media (max-width: 768px) {
    .sidebar {
        transform: translateX(-100%);
        box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
        width: var(--sidebar-width) !important;

        &.open {
            transform: translateX(0);
        }

        &.collapsed .nav-text,
        &.collapsed .search-shortcut {
            opacity: 1;
            width: auto;
            display: inline;
        }

        &.collapsed .nav-icon {
            margin-right: 12px;
        }

        &.collapsed .nav-item,
        &.collapsed .search-nav-item {
            justify-content: flex-start;
            padding-left: 12px;
            padding-right: 12px;
        }
    }

    .nav-item:hover::after {
        display: none;
    }
}
</style>
