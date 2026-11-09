<script setup lang="ts">
/**
 * BaseSwitch - 拨动开关
 *
 * 设置面板里的行尾控件：轨道 40×22，滑块 16px，选中时轨道填充主色。
 * 用原生 button + role="switch" 实现，Enter / Space 由浏览器默认行为触发 click，
 * 因此不需要额外的键盘处理；aria-checked 与视觉状态始终同源。
 */
interface Props {
    /** 是否开启，支持 v-model */
    modelValue: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 无障碍名称（行标题已经提供文字时可不传） */
    ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    ariaLabel: undefined
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'change', value: boolean): void;
}>();

function toggle(): void {
    if (props.disabled) return;
    const next = !props.modelValue;
    emit('update:modelValue', next);
    emit('change', next);
}
</script>

<template>
    <button
        type="button"
        class="mnt-switch"
        role="switch"
        :class="{ 'mnt-switch--on': modelValue, 'mnt-switch--disabled': disabled }"
        :aria-checked="modelValue"
        :aria-label="ariaLabel"
        :disabled="disabled"
        @click="toggle"
    >
        <span class="mnt-switch__thumb" aria-hidden="true" />
    </button>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-switch {
    @include button-reset;
    position: relative;
    flex-shrink: 0;
    width: 40px;
    height: 22px;
    border-radius: var(--ui-radius-pill);
    background: var(--ui-sunken);
    border: 1px solid var(--ui-hairline);
    @include ui-transition(background-color, border-color);
    @include ui-focus-ring;

    &__thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--ui-panel);
        // 未开启时滑块压在 sunken 轨道上，需要一圈描边才不糊
        border: 1px solid var(--ui-hairline-strong);
        transition:
            transform var(--ui-dur-base) var(--ui-ease),
            background-color var(--ui-dur-base) var(--ui-ease),
            border-color var(--ui-dur-base) var(--ui-ease);
    }

    &--on {
        background: var(--ui-accent);
        border-color: var(--ui-accent);

        .mnt-switch__thumb {
            transform: translateX(18px);
            background: var(--ui-on-accent);
            border-color: transparent;
        }
    }

    &--disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}
</style>
