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
    border-radius: var(--ui-radius-lg);
    color: var(--ui-ink);
    @include ui-floating(2, var(--ui-radius-lg));

    &__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border-radius: var(--ui-radius-md);
        background: var(--ui-accent-soft);
        color: var(--ui-accent);
    }

    &__text {
        flex: 1;
        min-width: 0;
    }

    &__title {
        margin: 0;
        font-size: var(--ui-font-small);
        font-weight: 600;
        letter-spacing: var(--ui-track-tight);
        line-height: 1.4;
        @include text-ellipsis;
    }

    &__sub {
        margin: 2px 0 0;
        font-size: var(--ui-font-micro);
        line-height: 1.4;
        color: var(--ui-muted);
        @include text-ellipsis;
    }

    &__action {
        @include button-reset;
        @include ui-focus-ring;
        flex-shrink: 0;
        min-height: 28px;
        padding: 0 12px;
        border-radius: var(--ui-radius-sm);
        font-size: var(--ui-font-small);
        font-weight: 500;
        white-space: nowrap;
        background: var(--ui-accent);
        color: var(--ui-on-accent);
        @include ui-transition(background-color);

        &:hover {
            background: var(--ui-accent-hover);
        }
    }

    &__close {
        @include button-reset;
        @include ui-focus-ring;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border-radius: var(--ui-radius-sm);
        color: var(--ui-muted);
        @include ui-transition(background-color, color);

        &:hover {
            background: var(--ui-elevated-hover);
            color: var(--ui-ink);
        }
    }
}

// 入场/出场：只做淡入淡出与 8px 位移
.update-banner-enter-active,
.update-banner-leave-active {
    transition:
        opacity var(--ui-dur-slow) var(--ui-ease),
        transform var(--ui-dur-slow) var(--ui-ease);
}

.update-banner-enter-from,
.update-banner-leave-to {
    opacity: 0;
    transform: translateY(8px);
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
