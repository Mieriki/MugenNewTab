<script setup lang="ts">
/**
 * AppHeader - 顶部应用栏
 *
 * 包含品牌区（Logo / 标题）、侧边栏折叠按钮、移动端菜单按钮、
 * 右侧操作区插槽以及个性化设置入口。
 */
import { computed } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import { getBrandLogo } from '@/utils/browser.util';

export interface AppHeaderProps {
    /** 主标题 */
    title?: string;
    /** Logo 图片地址；不传时使用统一的 logo_girl */
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
    logoSrc: '',
    showCollapseToggle: true,
    sidebarCollapsed: false,
    showPersonalizationToggle: true,
    isPersonalizationOpen: false
});

const emit = defineEmits<{
    (e: 'toggle-sidebar'): void;
    (e: 'toggle-personalization'): void;
    (e: 'menu-click'): void;
    /** 双击品牌区（Logo / 标题）：用于切换隐藏站点揭示模式 */
    (e: 'brand-dblclick'): void;
}>();

/** 未显式传入 logoSrc 时使用统一的品牌 Logo */
const resolvedLogoSrc = computed(() => props.logoSrc || getBrandLogo());

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

/**
 * 双击品牌区切换隐藏站点揭示模式
 *
 * 用模板事件绑定而非在父组件里手动 addEventListener：
 * 头部位于 `v-if / v-else` 分支中，进出极简模式会重建 DOM，
 * 手动绑定的监听器会随之丢失（这正是「双击 Logo 没反应」的原因）。
 */
function handleBrandDblclick(): void {
    emit('brand-dblclick');
}
</script>

<template>
    <header class="app-header">
        <div class="header-brand">
            <button
                type="button"
                class="menu-toggle"
                title="打开菜单"
                @click="handleMenuClick"
            >
                <IconSvg name="menu" :size="20" />
            </button>

            <!-- 不加 title 提示：隐藏站点的入口刻意保持隐蔽，提示由 HiddenTipModal 负责 -->
            <div class="brand" @dblclick="handleBrandDblclick">
                <div class="brand-icon is-image">
                    <img :src="resolvedLogoSrc" alt="Mugen" loading="lazy" />
                </div>
                <div class="brand-text">
                    <h1>{{ title }}</h1>
                </div>
            </div>

            <button
                v-if="showCollapseToggle"
                type="button"
                class="collapse-toggle-btn"
                :title="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
                @click="handleCollapseClick"
            >
                <IconSvg :name="collapseIconName" :size="18" />
            </button>
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
                    <IconSvg name="palette" :size="18" />
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
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    padding: 0 16px;
    z-index: 1000;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
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
    /* 双击切换隐藏站点时不希望顺带选中标题文字 */
    user-select: none;
}

.collapse-toggle-btn {
    @include button-reset;
    color: var(--md-sys-color-on-surface-variant);
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    @include md-transition(color transform);

    &:hover {
        color: var(--md-sys-color-primary);
        background: var(--md-sys-color-surface-variant);
        transform: scale(1.1);
    }

    &:active {
        transform: scale(0.95);
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
        color: var(--md-sys-color-primary);
        margin: 0;
        letter-spacing: -0.3px;
        line-height: 1.2;
    }
}

.menu-toggle {
    display: none;
    width: 32px;
    height: 32px;
    background: var(--md-sys-color-surface-variant);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 8px;
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    @include md-transition(all);
    flex-shrink: 0;

    &:hover {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-primary);
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
    background: var(--md-sys-color-primary-container);
    border-radius: 24px;
    color: var(--md-sys-color-primary);
    font-size: 14px;
    font-weight: 600;
    position: relative;
    overflow: hidden;
    box-shadow: none;
    @include md-transition(all, 0.25s);

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 50%);
        opacity: 0;
        @include md-transition(opacity);
    }

    &:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    &:hover::before {
        opacity: 1;
    }

    &:active {
        transform: translateY(0);
        box-shadow: none;
    }

    &.active .dropdown-arrow :deep(.icon-svg) {
        transform: rotate(180deg);
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
