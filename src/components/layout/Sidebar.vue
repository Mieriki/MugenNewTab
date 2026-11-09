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
}

const props = withDefaults(defineProps<SidebarProps>(), {
    categories: undefined,
    activeCategoryId: 'all',
    collapsed: false,
    mobileOpen: false,
    enableDragSort: true
});

const emit = defineEmits<{
    (e: 'select-category', categoryId: string): void;
    (e: 'update:mobileOpen', value: boolean): void;
    (e: 'open-search'): void;
    (e: 'order-change', orderedIds: string[]): void;
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
        if (!menuRef.value || event.cancelled) {
            return;
        }

        // 拖拽过程中 DOM 已被实时重排，直接按 DOM 顺序提交
        const orderedIds = Array.from(
            menuRef.value.querySelectorAll<HTMLElement>('.nav-item[data-draggable="true"]')
        )
            .map((element) => element.dataset.id)
            .filter((id): id is string => !!id);

        const currentOrder = displayedCategories.value
            .filter((category) => category.id !== 'all')
            .map((category) => category.id);

        // 顺序未变化时不触发保存
        if (orderedIds.join('\0') === currentOrder.join('\0')) {
            return;
        }

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
                <span class="nav-text">搜索</span>
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
    // 侧栏与内容区同色的表面，靠右侧发丝描边分隔
    background: var(--ui-canvas);
    z-index: 999;
    overflow-y: auto;
    overflow-x: hidden;
    border-right: 1px solid var(--ui-hairline);
    display: flex;
    flex-direction: column;
    transition: width var(--ui-dur-slow) var(--ui-ease);
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
        background: var(--ui-elevated);
        color: var(--ui-ink);
        border: 1px solid var(--ui-hairline);
        padding: 6px 10px;
        border-radius: var(--ui-radius-sm);
        font-size: var(--ui-font-micro);
        white-space: nowrap;
        z-index: 1003;
        box-shadow: var(--ui-shadow-2);
        pointer-events: none;
    }
}

.nav-menu {
    padding: var(--ui-space-3) var(--ui-space-2);
    flex: 1;
}

.nav-item {
    @include button-reset;
    width: 100%;
    display: flex;
    align-items: center;
    min-height: 36px;
    padding: 0 var(--ui-space-3);
    margin: 2px 0;
    border-radius: var(--ui-radius-md);
    color: var(--ui-muted);
    text-decoration: none;
    font-weight: 500;
    font-size: var(--ui-font-small);
    position: relative;
    white-space: nowrap;
    user-select: none;
    @include ui-interactive;
    @include ui-focus-ring;

    &:hover {
        color: var(--ui-ink);
    }

    // 选中：主色淡底 + 主色文字（保留原有的 pill 语义，只把配色收进令牌）
    &.active {
        background: var(--ui-accent-soft);
        color: var(--ui-accent);
        font-weight: 600;

        :deep(.icon-svg) {
            color: var(--ui-accent);
        }
    }

    &.pressing {
        background: var(--ui-sunken);
    }

    &.dragging {
        opacity: 0.6;
        background: var(--ui-elevated);
        box-shadow: var(--ui-shadow-2);
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
    margin-right: var(--ui-space-3);
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: margin var(--ui-dur-slow) var(--ui-ease);
}

.nav-text {
    transition: opacity var(--ui-dur-fast) var(--ui-ease);
    overflow: hidden;
}

.sidebar-footer {
    padding: var(--ui-space-3) var(--ui-space-2);
    margin-top: auto;
}

.search-nav-item {
    @include button-reset;
    width: 100%;
    display: flex;
    align-items: center;
    min-height: 36px;
    padding: 0 var(--ui-space-3);
    border-radius: var(--ui-radius-md);
    color: var(--ui-ink);
    background: var(--ui-elevated);
    font-weight: 500;
    font-size: var(--ui-font-small);
    @include ui-transition(background-color, color);

    &:hover {
        background: var(--ui-elevated-hover);
    }
}

.search-shortcut {
    margin-left: auto;
    font-size: var(--ui-font-micro);
    color: var(--ui-muted);
    background: var(--ui-sunken);
    padding: 2px 6px;
    border-radius: var(--ui-radius-xs);
    font-variant-numeric: tabular-nums;
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
