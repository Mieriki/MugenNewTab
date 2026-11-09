<script setup lang="ts">
/**
 * SettingsSection - 设置分组容器
 *
 * 对应截图里「外观」「通知」「数据与隐私」的结构：一行小标题 + 一个圆角卡片，
 * 卡片内部由若干 SettingsRow 组成，行与行之间自动补 1px 发丝分隔线。
 *
 * 分隔线放在容器上而不是行上：行组件不必知道自己是不是第一个，
 * 外层也不需要给最后一行单独去边框。
 */
export interface SettingsSectionProps {
    /** 分组标题，留空则不渲染标题行 */
    title?: string;
    /** 标题下方的补充说明 */
    description?: string;
}

withDefaults(defineProps<SettingsSectionProps>(), {
    title: '',
    description: ''
});
</script>

<template>
    <section class="settings-section">
        <header v-if="title || description" class="settings-section__header">
            <h3 v-if="title" class="settings-section__title">{{ title }}</h3>
            <p v-if="description" class="settings-section__description">{{ description }}</p>
        </header>

        <div class="settings-section__card">
            <slot />
        </div>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.settings-section {
    display: flex;
    flex-direction: column;
    gap: 10px;

    &__header {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 0 2px;
    }

    &__title {
        @include ui-caption;
        font-size: var(--ui-font-subtitle);
        letter-spacing: 0;
        color: var(--ui-ink);
    }

    &__description {
        margin: 0;
        @include ui-description;
        color: var(--ui-muted-soft);
    }

    &__card {
        @include ui-surface(var(--ui-panel), var(--ui-radius-lg));
        padding: 0 var(--ui-space-4);
        overflow: hidden;

        // 行与行之间的发丝分隔：第一个子元素不画
        > :deep(*:not(:first-child)) {
            border-top: 1px solid var(--ui-hairline);
        }
    }
}
</style>
