<script setup lang="ts">
/**
 * AppHeader - 顶部应用栏
 *
 * 包含品牌区（Logo / 标题）、侧边栏折叠按钮、移动端菜单按钮与右侧操作区插槽。
 * 个性化入口不在顶栏：已并入右下角 FAB 菜单（极简模式则由控制区的 palette 按钮提供）。
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
}

const props = withDefaults(defineProps<AppHeaderProps>(), {
    title: 'Mugen新标签页',
    logoSrc: '',
    showCollapseToggle: true,
    sidebarCollapsed: false
});

const emit = defineEmits<{
    (e: 'toggle-sidebar'): void;
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
    // 顶栏回到「主色渐变」的主题色语言：主色 → 主色混入一点次色。
    // 不用满幅 secondary：实测 5 套主题的 on-primary 压在 secondary 上只有 1.8~3.5:1，
    // 渐变右端的标题/按钮会糊掉；混 38% 后最差 3.1，其余 4.5+，视觉上仍是明显的两段渐变。
    // 先给纯主色兜底：万一 color-mix 不被支持，顶栏仍是主题色而不是透明。
    background: var(--md-sys-color-primary);
    background: linear-gradient(
        135deg,
        var(--md-sys-color-primary) 0%,
        color-mix(in srgb, var(--md-sys-color-primary) 62%, var(--md-sys-color-secondary)) 100%
    );
    color: var(--md-sys-color-on-primary);
    padding: 0 16px;
    z-index: 1000;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid color-mix(in srgb, var(--md-sys-color-on-primary) 18%, transparent);
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
    color: color-mix(in srgb, var(--md-sys-color-on-primary) 70%, transparent);
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    @include md-transition(color transform);

    &:hover {
        color: var(--md-sys-color-on-primary);
        background: color-mix(in srgb, var(--md-sys-color-on-primary) 14%, transparent);
        transform: scale(1.1);
    }

    &:active {
        transform: scale(0.95);
    }
}

.brand-icon {
    width: 32px;
    height: 32px;
    // 顶栏现在是渐变主色，容器色一律用 on-primary 的半透明层
    background: color-mix(in srgb, var(--md-sys-color-on-primary) 15%, transparent);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--md-sys-color-on-primary) 20%, transparent);
    overflow: hidden;
    flex-shrink: 0;
    @include md-transition(all);

    // 品牌图自带白底，直接按原图显示，只做圆角裁切，不加内边距/边框/投影
    &.is-image {
        width: 36px;
        height: 36px;
        background: transparent;
        border: none;
        border-radius: 10px;
        box-shadow: none;
        padding: 0;
    }

    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 2px;
    }

    &.is-image img {
        padding: 0;
        filter: none;
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
        // 顶栏是主色渐变，标题用配套的 on-primary
        color: var(--md-sys-color-on-primary);
        margin: 0;
        letter-spacing: -0.3px;
        line-height: 1.2;
    }
}

.menu-toggle {
    display: none;
    width: 32px;
    height: 32px;
    background: color-mix(in srgb, var(--md-sys-color-on-primary) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--md-sys-color-on-primary) 22%, transparent);
    border-radius: 8px;
    color: var(--md-sys-color-on-primary);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    @include md-transition(all);
    flex-shrink: 0;

    &:hover {
        background: color-mix(in srgb, var(--md-sys-color-on-primary) 22%, transparent);
    }
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
}

@media (max-width: 768px) {
    .collapse-toggle-btn {
        display: none !important;
    }

    .menu-toggle {
        display: flex;
        margin-right: 8px;
    }
}
</style>
