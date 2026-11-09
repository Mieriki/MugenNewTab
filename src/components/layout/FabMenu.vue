<script setup lang="ts">
/**
 * FabMenu - 浮动操作按钮菜单
 *
 * 提供常驻 FAB 按钮与弹出式菜单，支持普通操作项、分隔线与分组标题。
 * 可通过 v-model:active 控制展开状态，也支持点击外部自动关闭。
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface FabMenuItem {
    /** 操作项唯一标识 */
    action?: string;
    /** 显示文本 */
    label?: string;
    /** 系统图标名称 */
    icon?: string;
    /** 是否为分隔线 */
    divider?: boolean;
    /** 分组标题 */
    section?: string;
}

export interface FabMenuProps {
    /** 菜单项列表 */
    items: FabMenuItem[];
    /** FAB 主按钮图标 */
    mainIcon?: string;
    /** 是否展开，支持 v-model:active */
    active?: boolean;
}

const props = withDefaults(defineProps<FabMenuProps>(), {
    mainIcon: 'plus',
    active: false
});

const emit = defineEmits<{
    (e: 'update:active', value: boolean): void;
    (e: 'open'): void;
    (e: 'close'): void;
    (e: 'select', action: string): void;
}>();

const isOpen = computed({
    get: () => props.active,
    set: (value) => emit('update:active', value)
});

const containerRef = ref<HTMLElement | null>(null);

function toggle(): void {
    isOpen.value = !isOpen.value;
    if (isOpen.value) {
        emit('open');
    } else {
        emit('close');
    }
}

function handleItemClick(item: FabMenuItem): void {
    if (item.divider || item.section) {
        return;
    }
    if (item.action) {
        emit('select', item.action);
    }
    isOpen.value = false;
    emit('close');
}

function handleOutsideClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (containerRef.value && !containerRef.value.contains(target)) {
        isOpen.value = false;
    }
}

watch(isOpen, (open) => {
    if (open) {
        window.addEventListener('click', handleOutsideClick);
    } else {
        window.removeEventListener('click', handleOutsideClick);
    }
});

onUnmounted(() => {
    window.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
    <div ref="containerRef" class="fab-container" @click.stop>
        <ul class="fab-menu" :class="{ show: isOpen }" role="menu">
            <template v-for="(item, index) in items" :key="item.action || index">
                <li
                    v-if="item.section"
                    class="fab-section-title"
                    role="presentation"
                >
                    {{ item.section }}
                </li>
                <li
                    v-else-if="item.divider"
                    class="fab-divider"
                    role="separator"
                />
                <li
                    v-else
                    class="fab-item"
                    role="menuitem"
                    @click="handleItemClick(item)"
                >
                    <span v-if="item.icon" class="fab-item-icon">
                        <IconSvg :name="item.icon" :size="20" monochrome />
                    </span>
                    <span class="fab-item-label">{{ item.label }}</span>
                </li>
            </template>
        </ul>

        <button
            type="button"
            class="fab-main"
            :class="{ active: isOpen }"
            :title="isOpen ? '关闭菜单' : '打开菜单'"
            aria-haspopup="true"
            :aria-expanded="isOpen"
            @click.stop="toggle"
        >
            <IconSvg :name="mainIcon" :size="24" />
        </button>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.fab-container {
    position: fixed;
    right: var(--fab-right);
    bottom: var(--fab-bottom);
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
}

.fab-main {
    @include button-reset;
    width: var(--fab-size);
    height: var(--fab-size);
    border-radius: 50%;
    background: var(--ui-accent);
    color: var(--ui-on-accent);
    box-shadow: var(--ui-shadow-2);
    display: flex;
    align-items: center;
    justify-content: center;
    // 不放大、不改投影强度：只做旋转与底色微调
    transition:
        background-color var(--ui-dur-base) var(--ui-ease),
        transform var(--ui-dur-base) var(--ui-ease);
    position: relative;
    z-index: 2;
    @include ui-focus-ring;

    &:hover {
        background: var(--ui-accent-hover);
    }

    &.active {
        transform: rotate(45deg);
    }

    :deep(.icon-svg) {
        color: var(--ui-on-accent);
    }
}

.fab-menu {
    position: absolute;
    bottom: calc(var(--fab-size) + 12px);
    right: 0;
    margin: 0;
    padding: var(--ui-space-2);
    list-style: none;
    @include ui-floating(3, var(--ui-radius-lg));
    min-width: 184px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(8px);
    transform-origin: bottom right;
    transition:
        opacity var(--ui-dur-base) var(--ui-ease),
        transform var(--ui-dur-base) var(--ui-ease),
        visibility var(--ui-dur-base) var(--ui-ease);
    z-index: 1;

    &.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }
}

.fab-item {
    display: flex;
    align-items: center;
    gap: var(--ui-space-3);
    min-height: 34px;
    padding: 0 var(--ui-space-2);
    border-radius: var(--ui-radius-md);
    cursor: pointer;
    color: var(--ui-ink);
    font-size: var(--ui-font-small);
    font-weight: 500;
    @include ui-interactive;

    :deep(.icon-svg) {
        color: var(--ui-muted);
    }

    &:hover :deep(.icon-svg) {
        color: var(--ui-ink);
    }
}

.fab-item-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.fab-item-label {
    white-space: nowrap;
}

.fab-divider {
    height: 1px;
    background: var(--ui-hairline);
    margin: var(--ui-space-2) var(--ui-space-1);
    list-style: none;
}

.fab-section-title {
    @include ui-caption;
    padding: var(--ui-space-1) var(--ui-space-2);
    font-size: var(--ui-font-micro);
    color: var(--ui-muted-soft);
    list-style: none;
}

@media (max-width: 768px) {
    .fab-container {
        right: 16px !important;
        bottom: 80px !important;
    }
}
</style>
