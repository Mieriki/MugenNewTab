<script setup lang="ts">
/**
 * HiddenTipModal - 隐藏站点方法提示弹窗
 *
 * 用户将站点设为隐藏后弹出，说明「双击 Logo / Alt+Shift+H」的临时显示方法。
 * 勾选「不再提示」后写入 STORAGE_KEYS.HIDDEN_TIP_DISMISSED，此后不再弹出，
 * 避免其他人从提示中获知显示方法。
 */
import { ref, watch } from 'vue';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';

interface Props {
    /** 是否显示模态框（支持 v-model） */
    modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
}>();

/** 是否勾选「不再提示」 */
const dontRemind = ref(false);

function close(): void {
    emit('update:modelValue', false);
}

// 弹窗关闭（按钮 / 遮罩 / ESC 任意途径）时统一持久化「不再提示」并重置勾选状态
watch(
    () => props.modelValue,
    (visible, previous) => {
        if (visible || !previous) return;
        if (dontRemind.value) {
            storageManager.set(STORAGE_KEYS.HIDDEN_TIP_DISMISSED, true).catch((error) => {
                console.error('[HiddenTipModal] 保存「不再提示」设置失败:', error);
            });
        }
        dontRemind.value = false;
    }
);
</script>

<template>
    <ModalOverlay
        :model-value="modelValue"
        title="站点已隐藏"
        :max-width="420"
        close-on-overlay
        @update:model-value="$emit('update:modelValue', $event)"
    >
        <div class="hidden-tip">
            <p class="hidden-tip__text">
                该站点已从首页隐藏。需要查看时，双击页面左上角的 Logo 图标，或按
                <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd>，即可临时显示隐藏的站点；再次操作恢复隐藏。
            </p>
            <label class="hidden-tip__checkbox">
                <input v-model="dontRemind" type="checkbox" />
                <span>不再提示</span>
            </label>
        </div>

        <template #footer>
            <BaseButton variant="primary" @click="close">我知道了</BaseButton>
        </template>
    </ModalOverlay>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.hidden-tip {
    display: flex;
    flex-direction: column;
    gap: 16px;

    &__text {
        margin: 0;
        font-size: 14px;
        line-height: 1.7;
        color: var(--md-sys-color-on-surface);

        kbd {
            display: inline-block;
            min-width: 20px;
            padding: 1px 6px;
            margin: 0 2px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 12px;
            text-align: center;
            background: color-mix(in srgb, var(--md-sys-color-on-surface) 6%, transparent);
            border: 1px solid color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
            border-bottom-width: 2px;
        }
    }

    &__checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 14px;
        color: var(--md-sys-color-on-surface-variant);

        input[type='checkbox'] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--md-sys-color-primary);
        }
    }
}
</style>
