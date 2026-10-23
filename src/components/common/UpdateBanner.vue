<!--
  UpdateBanner - 应用内更新提示条

  仅用于 Chromium 系（Chrome / Edge）自托管安装的场景：这些浏览器不会自动
  更新商店外的扩展，只能靠界面提示引导用户手动下载新版本。
  Firefox 有自己的 update_url 静默更新通道，正常情况下不会看到它。

  纯展示组件：是否显示、点按钮做什么，全部由父组件决定。
-->
<script setup lang="ts">
import IconSvg from '@/components/icon/IconSvg.vue';

interface Props {
    /** 最新版本号，如 1.0.0.109 */
    latestVersion: string;
    /** 当前版本号，用于展示「当前 → 最新」 */
    currentVersion?: string;
}

withDefaults(defineProps<Props>(), {
    currentVersion: '',
});

const emit = defineEmits<{
    /** 点击「立即更新」 */
    (e: 'update'): void;
    /** 关闭提示条（该版本不再提示） */
    (e: 'close'): void;
}>();
</script>

<template>
    <Transition name="update-banner" appear>
        <div class="update-banner" role="status" aria-live="polite">
            <span class="update-banner__icon" aria-hidden="true">
                <IconSvg name="download" :size="18" />
            </span>

            <div class="update-banner__text">
                <p class="update-banner__title">发现新版本 v{{ latestVersion }}</p>
                <p v-if="currentVersion" class="update-banner__sub">
                    当前 v{{ currentVersion }}
                </p>
            </div>

            <button
                type="button"
                class="update-banner__action"
                @click="emit('update')"
            >
                立即更新
            </button>

            <button
                type="button"
                class="update-banner__close"
                aria-label="关闭更新提示"
                @click="emit('close')"
            >
                <IconSvg name="close" :size="14" />
            </button>
        </div>
    </Transition>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.update-banner {
    position: fixed;
    left: 24px;
    bottom: 24px;
    // 低于 Toast（3000）与各类模态框，避免抢焦点层级；
    // 高于页面内容，保证在磁贴/卡片之上可见
    z-index: 2400;

    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 420px;
    padding: 12px 12px 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--md-sys-color-outline-variant);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);

    color: var(--md-sys-color-on-surface);
    @include glass(0.94, 16px);
    @include md-transition(transform, var(--md-transition-fast));

    &__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-on-primary-container);
    }

    &__text {
        flex: 1;
        min-width: 0;
    }

    &__title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
        @include text-ellipsis;
    }

    &__sub {
        margin: 2px 0 0;
        font-size: 11px;
        line-height: 1.4;
        color: var(--md-sys-color-on-surface-variant);
        @include text-ellipsis;
    }

    &__action {
        @include button-reset;
        @include focus-ring;
        flex-shrink: 0;
        padding: 7px 14px;
        border-radius: 18px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        @include md-transition(all, var(--md-transition-fast));

        &:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
    }

    &__close {
        @include button-reset;
        @include focus-ring;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border-radius: 8px;
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.7;
        @include md-transition(all, var(--md-transition-fast));

        &:hover {
            opacity: 1;
            background: var(--hover-bg);
        }
    }
}

// 入场/出场：从下方滑入
.update-banner-enter-active,
.update-banner-leave-active {
    transition: opacity 0.25s var(--md-easing), transform 0.25s var(--md-easing);
}

.update-banner-enter-from,
.update-banner-leave-to {
    opacity: 0;
    transform: translateY(12px);
}

@include respond-to(mobile) {
    .update-banner {
        left: 12px;
        right: 12px;
        bottom: 12px;
        max-width: none;
    }
}
</style>
