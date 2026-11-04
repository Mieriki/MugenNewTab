<script setup lang="ts">
/**
 * CardStyleSettings - 卡片样式设置
 *
 * 调整标准视图站点卡片的不透明度 / 磨砂 / 圆角 / 阴影 / 描边。
 * 具体数值由 cardStyle store 落到 :root 的 --card-* 变量上，这里只做交互，
 * 滑块拖动过程中不写存储，松手（change）才落库。
 */
import { onMounted, ref, watch } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import BaseSlider from '@/components/common/BaseSlider.vue';
import BaseButton from '@/components/common/BaseButton.vue';
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

function handleBorderedChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    void cardStyle.setBordered(target.checked);
}

async function handleReset(): Promise<void> {
    await cardStyle.reset();
    toast.success('已恢复默认卡片样式');
}
</script>

<template>
    <section class="card-style-settings" aria-label="卡片样式">
        <header class="card-style-settings__header">
            <IconSvg name="filter" :size="18" color="var(--md-sys-color-primary)" />
            <h3 class="card-style-settings__title">卡片样式</h3>
        </header>

        <div class="card-style-settings__sliders">
            <BaseSlider
                v-model="opacityPercent"
                label="卡片不透明度"
                :min="0"
                :max="100"
                :step="1"
                :format-value="formatPercent"
                @change="handleOpacityChange"
            />

            <BaseSlider
                v-model="blurPx"
                label="磨砂程度"
                :min="0"
                :max="CARD_STYLE_DEFAULTS.maxBlur"
                :step="1"
                :format-value="formatPx"
                @change="handleBlurChange"
            />

            <BaseSlider
                v-model="radiusPx"
                label="圆角"
                :min="0"
                :max="CARD_STYLE_DEFAULTS.maxRadius"
                :step="1"
                :format-value="formatPx"
                @change="handleRadiusChange"
            />

            <BaseSlider
                v-model="shadowPercent"
                label="阴影强度"
                :min="0"
                :max="100"
                :step="1"
                :format-value="formatPercent"
                @change="handleShadowChange"
            />
        </div>

        <div class="card-style-settings__group">
            <label class="card-style-settings__toggle">
                <input
                    type="checkbox"
                    :checked="cardStyle.bordered"
                    @change="handleBorderedChange"
                />
                <span>显示卡片描边（关闭后只靠底色与阴影区分卡片）</span>
            </label>
        </div>

        <p class="card-style-settings__hint">
            不透明度越低壁纸透出越多；磨砂会采样卡片背后的壁纸，卡片较多时有一定合成开销。
            卡片底色始终跟随当前主题，极简约模式的磁贴不受这里影响。
        </p>

        <BaseButton
            class="card-style-settings__reset"
            variant="outlined"
            size="small"
            @click="handleReset"
        >
            恢复默认
        </BaseButton>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.card-style-settings {
    display: flex;
    flex-direction: column;
    gap: 14px;

    &__header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0;
    }

    &__sliders {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    &__group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    &__toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 13px;
        color: var(--md-sys-color-on-surface);

        input[type='checkbox'] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--md-sys-color-primary);
        }
    }

    &__hint {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__reset {
        align-self: flex-start;
    }
}
</style>
