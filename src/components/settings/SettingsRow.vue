<script setup lang="ts">
/**
 * SettingsRow - 设置行
 *
 * 左「标题 + 描述」右「控件」的两栏布局，与截图里每一行设置一致。
 * 控件放在 actions 插槽；描述省略时标题垂直居中。
 *
 * 标题未显式传入且行本身可点击时，用 ariaLabel 补无障碍名称。
 */
export interface SettingsRowProps {
    /** 行标题 */
    label?: string;
    /** 行描述，说明这一项具体影响什么 */
    description?: string;
    /** 控件是否换行到下一行（描述很长或控件较宽时用） */
    stacked?: boolean;
    /** 整行可点击时传入，用于无障碍名称 */
    ariaLabel?: string;
    /** 标题左侧的系统图标名 */
    icon?: string;
}

withDefaults(defineProps<SettingsRowProps>(), {
    label: '',
    description: '',
    stacked: false,
    ariaLabel: undefined,
    icon: undefined
});
</script>

<template>
    <div
        class="settings-row"
        :class="{ 'settings-row--stacked': stacked }"
        :aria-label="ariaLabel"
    >
        <div class="settings-row__main">
            <div class="settings-row__heading">
                <slot name="icon" />
                <span v-if="label" class="settings-row__label">{{ label }}</span>
                <slot name="label" />
            </div>
            <p v-if="description" class="settings-row__description">{{ description }}</p>
            <slot name="description" />
        </div>

        <div v-if="$slots.actions" class="settings-row__actions">
            <slot name="actions" />
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-4);
    min-height: 56px;
    padding: var(--ui-space-3) 0;

    &__main {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        flex: 1;
    }

    &__heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    &__label {
        @include ui-label;
    }

    &__description {
        margin: 0;
        @include ui-description;
        // 描述比标题更弱，长文案最多两行
        @include line-clamp(2);
    }

    &__actions {
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
        flex-shrink: 0;
    }

    // 控件较宽（滑杆、输入框、整块列表）时换到下一行占满宽度
    &--stacked {
        flex-direction: column;
        align-items: stretch;

        .settings-row__actions {
            justify-content: flex-end;
        }
    }
}
</style>
