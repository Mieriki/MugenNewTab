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
                        <IconSvg :name="item.icon" :size="20" />
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
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    @include md-transition(all, 0.3s);
    position: relative;
    z-index: 2;

    &:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }

    &.active {
        transform: rotate(45deg);
    }

    :deep(.icon-svg) {
        filter: brightness(0) invert(1);
    }
}

.fab-menu {
    position: absolute;
    bottom: calc(var(--fab-size) + 12px);
    right: 0;
    margin: 0;
    padding: 8px;
    list-style: none;
    background: var(--md-sys-color-surface);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--md-sys-color-outline-variant);
    min-width: 180px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(10px) scale(0.9);
    transform-origin: bottom right;
    @include md-transition(all, 0.2s);
    z-index: 1;

    &.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }
}

.fab-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    font-weight: 500;
    @include md-transition(all, 0.15s);

    &:hover {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-primary);
    }
}

.fab-item-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.fab-item-label {
    white-space: nowrap;
}

.fab-divider {
    height: 1px;
    background: var(--md-sys-color-outline-variant);
    margin: 8px 0;
    list-style: none;
}

.fab-section-title {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    padding: 4px 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    list-style: none;
}

@media (max-width: 768px) {
    .fab-container {
        right: 16px !important;
        bottom: 80px !important;
    }
}
</style>
