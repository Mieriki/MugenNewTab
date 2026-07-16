<script setup lang="ts">
/**
 * AppHeader - 顶部应用栏
 *
 * 包含品牌区（Logo / 标题 / 副标题）、侧边栏折叠按钮、移动端菜单按钮、
 * 右侧操作区插槽以及个性化设置入口。
 */
import { computed } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface AppHeaderProps {
    /** 主标题 */
    title?: string;
    /** 副标题 */
    subtitle?: string;
    /** Logo 图片地址 */
    logoSrc?: string;
    /** 是否显示侧边栏折叠按钮 */
    showCollapseToggle?: boolean;
    /** 当前侧边栏是否折叠 */
    sidebarCollapsed?: boolean;
    /** 是否显示个性化设置按钮 */
    showPersonalizationToggle?: boolean;
    /** 个性化下拉面板是否展开 */
    isPersonalizationOpen?: boolean;
}

const props = withDefaults(defineProps<AppHeaderProps>(), {
    title: 'Mugen新标签页',
    subtitle: '统一应用管理平台',
    logoSrc: '/image/logo/mugen.png',
    showCollapseToggle: true,
    sidebarCollapsed: false,
    showPersonalizationToggle: true,
    isPersonalizationOpen: false
});

const emit = defineEmits<{
    (e: 'toggle-sidebar'): void;
    (e: 'toggle-personalization'): void;
    (e: 'menu-click'): void;
}>();

const collapseIconName = computed(() => (props.sidebarCollapsed ? 'Expand' : 'Fold'));

function handleCollapseClick(): void {
    emit('toggle-sidebar');
}

function handlePersonalizationClick(): void {
    emit('toggle-personalization');
}

function handleMenuClick(): void {
    emit('menu-click');
}
</script>

<template>
    <header class="app-header">
        <div class="header-brand">
            <button
                v-if="showCollapseToggle"
                type="button"
                class="collapse-toggle-btn"
                :title="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
                @click="handleCollapseClick"
            >
                <IconSvg :name="collapseIconName" :size="18" />
            </button>

            <button
                type="button"
                class="menu-toggle"
                title="打开菜单"
                @click="handleMenuClick"
            >
                <IconSvg name="menu" :size="20" />
            </button>

            <div class="brand">
                <div class="brand-icon is-image">
                    <img :src="logoSrc" alt="Mugen" loading="lazy" />
                </div>
                <div class="brand-text">
                    <h1>{{ title }}</h1>
                    <p v-if="subtitle">{{ subtitle }}</p>
                </div>
            </div>
        </div>

        <div class="header-actions">
            <slot name="actions" />

            <button
                v-if="showPersonalizationToggle"
                type="button"
                class="personalization-toggle-btn"
                :class="{ active: isPersonalizationOpen }"
                :title="isPersonalizationOpen ? '关闭个性化面板' : '打开个性化面板'"
                @click="handlePersonalizationClick"
            >
                <span class="personalization-icon">
                    <IconSvg name="setting" :size="18" />
                </span>
                <span class="personalization-label">个性化</span>
                <span class="dropdown-arrow">
                    <IconSvg name="arrow-down" :size="12" />
                </span>
            </button>
        </div>
    </header>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.app-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--header-height);
    background: linear-gradient(135deg, var(--md-sys-color-primary) 0%, var(--md-sys-color-secondary) 100%);
    color: var(--md-sys-color-on-primary);
    padding: 0 16px;
    z-index: 1000;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 100%;
    flex: 1;
    min-width: 0;
}

.brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 100%;
    min-width: 0;
    transition: gap 0.2s ease;
}

.collapse-toggle-btn {
    @include button-reset;
    margin-left: 6px;
    color: rgba(255, 255, 255, 0.7);
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    @include md-transition(color transform);

    &:hover {
        color: #fff;
        transform: scale(1.1);
    }

    &:active {
        transform: scale(0.95);
    }

    :deep(.icon-svg) {
        filter: brightness(0) invert(1);
        opacity: 0.8;
    }

    &:hover :deep(.icon-svg) {
        opacity: 1;
    }
}

.brand-icon {
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.2);
    overflow: hidden;
    flex-shrink: 0;
    @include md-transition(all);

    &.is-image {
        background: transparent;
        border: none;
        width: 34px;
        height: 34px;
    }

    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 2px;
    }

    &.is-image img {
        padding: 0;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
    }
}

.brand-text {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    gap: 1px;
    transition: opacity 0.2s ease, width 0.2s ease;
    overflow: hidden;
    white-space: nowrap;

    h1 {
        font-size: 1.05rem;
        font-weight: 600;
        color: #fff;
        margin: 0;
        letter-spacing: -0.3px;
        line-height: 1.2;
    }

    p {
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.8);
        margin: 0;
        font-weight: 400;
        line-height: 1.2;
    }
}

.menu-toggle {
    display: none;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    @include md-transition(all);
    flex-shrink: 0;

    &:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    :deep(.icon-svg) {
        filter: brightness(0) invert(1);
    }
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
}

.personalization-toggle-btn {
    @include button-reset;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--md-sys-color-primary);
    border-radius: 24px;
    color: var(--md-sys-color-on-primary);
    font-size: 14px;
    font-weight: 600;
    position: relative;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1);
    @include md-transition(all, 0.25s);

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0) 50%);
        opacity: 0;
        @include md-transition(opacity);
    }

    &:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    &:hover::before {
        opacity: 1;
    }

    &:active {
        transform: translateY(0);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    }

    &.active .dropdown-arrow :deep(.icon-svg) {
        transform: rotate(180deg);
    }

    :deep(.icon-svg) {
        filter: brightness(0) invert(1);
    }
}

.personalization-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
}

.dropdown-arrow :deep(.icon-svg) {
    @include md-transition(transform, 0.25s);
}

@media (max-width: 768px) {
    .collapse-toggle-btn {
        display: none !important;
    }

    .menu-toggle {
        display: flex;
        margin-right: 8px;
    }

    .brand-text p {
        display: none;
    }

    .personalization-label,
    .dropdown-arrow {
        display: none;
    }

    .personalization-toggle-btn {
        padding: 10px;
        border-radius: 50%;
    }

    .personalization-icon {
        width: 20px;
        height: 20px;
    }
}
</style>
