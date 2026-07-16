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
    </main>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.main-content {
    margin-left: var(--sidebar-width);
    margin-top: var(--header-height);
    min-height: calc(100vh - var(--header-height));
    padding: 24px 32px;
    @include md-transition(margin-left);

    &.collapsed {
        margin-left: var(--sidebar-collapsed-width);
    }
}

.content-header {
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--md-sys-color-primary-container);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    &::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        width: 40px;
        height: 2px;
        background: var(--md-sys-color-primary);
    }
}

.content-title {
    font-size: 1.35rem;
    color: var(--md-sys-color-primary);
    font-weight: 600;
    margin: 0;
}

.header-extra {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.content-body {
    min-height: 200px;
}

@media (max-width: 768px) {
    .main-content {
        margin-left: 0 !important;
        padding: 16px;
    }

    .content-title {
        font-size: 1.15rem;
    }
}
</style>
