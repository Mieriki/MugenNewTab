<script setup lang="ts">
/**
 * MainContent - 主内容区域
 *
 * 提供带侧边栏间距的内容容器与内容头部，支持默认标题插槽、自定义标题插槽
 * 以及头部额外操作插槽。
 */
export interface MainContentProps {
    /** 内容区标题 */
    title?: string;
    /** 是否显示内容头部 */
    showHeader?: boolean;
    /** 侧边栏是否折叠（用于调整 margin-left） */
    collapsed?: boolean;
}

withDefaults(defineProps<MainContentProps>(), {
    title: '',
    showHeader: true,
    collapsed: false
});
</script>

<template>
    <main class="main-content" :class="{ collapsed }">
        <div class="content-wrapper">
            <header v-if="showHeader" class="content-header">
                <h2 class="content-title">
                    <slot name="header-title">{{ title }}</slot>
                </h2>
                <div class="header-extra">
                    <slot name="header-extra" />
                </div>
            </header>

            <div class="content-body">
                <slot />
            </div>
        </div>
    </main>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.main-content {
    margin-left: var(--sidebar-width);
    margin-top: var(--header-height);
    min-height: calc(100vh - var(--header-height));
    padding: var(--ui-space-6) var(--ui-space-7);
    transition: margin-left var(--ui-dur-slow) var(--ui-ease);

    &.collapsed {
        margin-left: var(--sidebar-collapsed-width);
    }
}

.content-wrapper {
    // 占满整个内容区：不再限宽居中。
    // 之前 max-width: 1200px + margin: 0 auto 在缩放（视口变宽）后会把站点挤到
    // 屏幕中间一小块、两侧大片空白，而缩放本来就是为了看到更多内容。
    // 宽度交给网格的 auto-fill 自适应列数。
    width: 100%;
}

.content-header {
    margin-bottom: var(--ui-space-5);
    padding-bottom: var(--ui-space-3);
    border-bottom: 1px solid var(--ui-hairline);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-4);

    // 主色短线：整页唯一的强调笔触，收窄到 28px 才像"标记"而不是"下划线"
    &::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        width: 28px;
        height: 2px;
        border-radius: var(--ui-radius-pill);
        background: var(--ui-accent);
    }
}

.content-title {
    // 页标题用正文色，不再用主色——主色留给 CTA 与选中态
    font-size: var(--ui-font-display);
    color: var(--ui-ink);
    font-weight: 600;
    letter-spacing: var(--ui-track-tight);
    margin: 0;
}

.header-extra {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
    flex-shrink: 0;
}

.content-body {
    min-height: 200px;
}

@media (max-width: 768px) {
    .main-content {
        margin-left: 0 !important;
        padding: var(--ui-space-4);
    }

    .content-title {
        font-size: 18px;
    }
}
</style>
