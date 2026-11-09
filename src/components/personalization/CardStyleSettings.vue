<script setup lang="ts">
/**
 * CardStyleSettings - 卡片样式设置
 *
 * 调整标准视图站点卡片的不透明度 / 磨砂 / 圆角 / 阴影 / 描边。
 * 具体数值由 cardStyle store 落到 :root 的 --card-* 变量上，这里只做交互，
 * 滑块拖动过程中不写存储，松手（change）才落库。
 */
import { onMounted, ref, watch } from 'vue';
import BaseSlider from '@/components/common/BaseSlider.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseSwitch from '@/components/common/BaseSwitch.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';
import { CARD_STYLE_DEFAULTS, useCardStyleStore } from '@/stores/cardStyle.store';
import { useToast } from '@/composables/useToast';

const cardStyle = useCardStyleStore();
const toast = useToast();

/** 滑块用 0-100 的百分比表示，store 里存 0-1 */
const opacityPercent = ref(Math.round(cardStyle.opacity * 100));
const shadowPercent = ref(Math.round(cardStyle.shadow * 100));
const blurPx = ref(cardStyle.blur);
const radiusPx = ref(cardStyle.radius);

// store 被外部改动（恢复默认、跨标签页同步）时回填滑块
watch(
    () => cardStyle.opacity,
    (value) => {
        opacityPercent.value = Math.round(value * 100);
    }
);

watch(
    () => cardStyle.shadow,
    (value) => {
        shadowPercent.value = Math.round(value * 100);
    }
);

watch(
    () => cardStyle.blur,
    (value) => {
        blurPx.value = value;
    }
);

watch(
    () => cardStyle.radius,
    (value) => {
        radiusPx.value = value;
    }
);

onMounted(() => {
    void cardStyle.init();
});

function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
}

function formatPx(value: number): string {
    return `${Math.round(value)}px`;
}

function handleOpacityChange(value: number): void {
    void cardStyle.setOpacity(value / 100);
}

function handleShadowChange(value: number): void {
    void cardStyle.setShadow(value / 100);
}

function handleBlurChange(value: number): void {
    void cardStyle.setBlur(value);
}

function handleRadiusChange(value: number): void {
    void cardStyle.setRadius(value);
}

function handleBorderedChange(value: boolean): void {
    void cardStyle.setBordered(value);
}

async function handleReset(): Promise<void> {
    await cardStyle.reset();
    toast.success('已恢复默认卡片样式');
}
</script>

<template>
    <div class="card-style-settings">
        <SettingsSection
            title="外观"
            description="卡片底色始终跟随当前主题；极简约模式的磁贴不受这里影响。"
        >
            <SettingsRow
                label="卡片不透明度"
                description="越低壁纸透出越多"
                stacked
            >
                <template #actions>
                    <BaseSlider
                        v-model="opacityPercent"
                        :show-value="true"
                        :min="0"
                        :max="100"
                        :step="1"
                        :format-value="formatPercent"
                        class="card-style-settings__slider"
                        @change="handleOpacityChange"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                label="磨砂程度"
                description="采样卡片背后的壁纸，卡片较多时有一定合成开销"
                stacked
            >
                <template #actions>
                    <BaseSlider
                        v-model="blurPx"
                        :show-value="true"
                        :min="0"
                        :max="CARD_STYLE_DEFAULTS.maxBlur"
                        :step="1"
                        :format-value="formatPx"
                        class="card-style-settings__slider"
                        @change="handleBlurChange"
                    />
                </template>
            </SettingsRow>

            <SettingsRow label="圆角" stacked>
                <template #actions>
                    <BaseSlider
                        v-model="radiusPx"
                        :show-value="true"
                        :min="0"
                        :max="CARD_STYLE_DEFAULTS.maxRadius"
                        :step="1"
                        :format-value="formatPx"
                        class="card-style-settings__slider"
                        @change="handleRadiusChange"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                label="阴影强度"
                description="关闭后完全依赖底色与描边分层"
                stacked
            >
                <template #actions>
                    <BaseSlider
                        v-model="shadowPercent"
                        :show-value="true"
                        :min="0"
                        :max="100"
                        :step="1"
                        :format-value="formatPercent"
                        class="card-style-settings__slider"
                        @change="handleShadowChange"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                label="显示卡片描边"
                description="关闭后只靠底色与阴影区分卡片"
            >
                <template #actions>
                    <BaseSwitch
                        :model-value="cardStyle.bordered"
                        aria-label="显示卡片描边"
                        @update:model-value="handleBorderedChange"
                    />
                </template>
            </SettingsRow>
        </SettingsSection>

        <div class="card-style-settings__footer">
            <BaseButton variant="outlined" size="small" @click="handleReset">
                恢复默认
            </BaseButton>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.card-style-settings {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4);

    // 滑杆本身是块级控件，撑满行宽
    &__slider {
        width: 100%;
    }

    &__footer {
        display: flex;
        justify-content: flex-start;
    }
}
</style>
