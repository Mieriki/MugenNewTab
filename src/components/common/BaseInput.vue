<script setup lang="ts">
import { computed } from 'vue';

export type InputType = 'text' | 'password' | 'email' | 'url' | 'search' | 'number' | 'tel';

interface Props {
    /** 输入值（支持 v-model） */
    modelValue?: string | number;
    /** 输入框标签 */
    label?: string;
    /** 占位符 */
    placeholder?: string;
    /** 原生 input type */
    type?: InputType;
    /** 是否必填 */
    required?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否只读 */
    readonly?: boolean;
    /** 错误提示文本 */
    error?: string;
    /** 辅助提示文本 */
    hint?: string;
    /** 原生 input id */
    id?: string;
    /** 原生 name */
    name?: string;
    /** 原生 autocomplete */
    autocomplete?: string;
}

const props = withDefaults(defineProps<Props>(), {
    type: 'text',
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'blur', event: FocusEvent): void;
    (e: 'focus', event: FocusEvent): void;
    (e: 'keydown', event: KeyboardEvent): void;
    (e: 'enter', value: string): void;
}>();

const inputId = computed(() => props.id || `mnt-input-${Math.random().toString(36).slice(2, 9)}`);

function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    emit('update:modelValue', target.value);
}

function handleKeydown(event: KeyboardEvent): void {
    emit('keydown', event);
    if (event.key === 'Enter') {
        emit('enter', String(props.modelValue ?? ''));
    }
}

function handleBlur(event: FocusEvent): void {
    emit('blur', event);
}

function handleFocus(event: FocusEvent): void {
    emit('focus', event);
}
</script>

<template>
    <div class="mnt-base-input" :class="{ 'mnt-base-input--error': !!error, 'mnt-base-input--disabled': disabled }">
        <label v-if="label" :for="inputId" class="mnt-base-input__label">
            {{ label }}
            <span v-if="required" class="mnt-base-input__required" aria-hidden="true">*</span>
        </label>

        <div class="mnt-base-input__wrapper">
            <div v-if="$slots.prefix" class="mnt-base-input__prefix">
                <slot name="prefix" />
            </div>

            <input
                :id="inputId"
                class="mnt-base-input__field"
                :class="{ 'mnt-base-input__field--has-prefix': $slots.prefix, 'mnt-base-input__field--has-suffix': $slots.suffix }"
                :type="type"
                :value="modelValue"
                :placeholder="placeholder"
                :required="required"
                :disabled="disabled"
                :readonly="readonly"
                :name="name"
                :autocomplete="autocomplete"
                @input="handleInput"
                @blur="handleBlur"
                @focus="handleFocus"
                @keydown="handleKeydown"
            />

            <div v-if="$slots.suffix" class="mnt-base-input__suffix">
                <slot name="suffix" />
            </div>
        </div>

        <div v-if="error || hint" class="mnt-base-input__messages">
            <p v-if="error" class="mnt-base-input__error">{{ error }}</p>
            <p v-else-if="hint" class="mnt-base-input__hint">{{ hint }}</p>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-base-input {
    display: flex;
    flex-direction: column;
    gap: 6px;

    &__label {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__required {
        color: var(--md-sys-color-error);
    }

    &__wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: 10px;
        background: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        @include md-transition(border-color, var(--md-transition-fast));
    }

    &__field {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        color: inherit;
        font-size: 14px;
        font-family: inherit;
        outline: none;

        &::placeholder {
            color: var(--md-sys-color-on-surface-variant);
            opacity: 0.55;
        }

        &--has-prefix {
            padding-left: 4px;
        }

        &--has-suffix {
            padding-right: 4px;
        }
    }

    &__prefix,
    &__suffix {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__messages {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    &__hint,
    &__error {
        margin: 0;
        font-size: 12px;
        line-height: 1.4;
    }

    &__hint {
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.85;
    }

    &__error {
        color: var(--md-sys-color-error);
    }

    &:focus-within &__wrapper {
        border-color: var(--md-sys-color-primary);
        box-shadow: 0 0 0 3px rgba(177, 74, 107, 0.08);
    }

    &--error &__wrapper {
        border-color: var(--md-sys-color-error);
    }

    &--error:focus-within &__wrapper {
        box-shadow: 0 0 0 3px rgba(186, 26, 26, 0.08);
    }

    &--disabled &__wrapper {
        background: var(--md-sys-color-surface-variant);
        opacity: 0.65;
        cursor: not-allowed;
    }
}

// 深色模式覆盖
:global(html.dark-mode),
:global(body.dark-mode) {
    .mnt-base-input__wrapper {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);
    }
}
</style>
