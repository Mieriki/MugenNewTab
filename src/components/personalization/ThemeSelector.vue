<script setup lang="ts">
/**
 * ThemeSelector - 主题选择器
 *
 * 从 useTheme 获取可用主题列表与当前主题，渲染为单选列表。
 * 点击主题后调用 store 切换并持久化，同时向父组件抛出事件。
 */
import { computed } from 'vue';
import { useTheme } from '@/composables/useTheme';
import IconSvg from '@/components/icon/IconSvg.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import type { Theme } from '@/types/config';

export interface ThemeSelectorProps {
    /** 面板标题 */
    title?: string;
    /** 是否自动初始化主题 store */
    autoInit?: boolean;
    /** 是否显示“跟随系统”按钮 */
    showFollowSystem?: boolean;
}

const props = withDefaults(defineProps<ThemeSelectorProps>(), {
    title: '主题配色',
    autoInit: true,
    showFollowSystem: true
});

const emit = defineEmits<{
    (e: 'select-theme', themeId: string): void;
    (e: 'error', message: string): void;
}>();

const {
    themes,
    selectedThemeId,
    isInitializing,
    isFollowingSystem,
    setTheme,
    followSystemTheme
} = useTheme({ autoInit: props.autoInit });

const themeList = computed<Theme[]>(() => themes.value);

const SPARKLE_PATH = 'M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z';

function getThemePreviewColor(theme: Theme): string {
    return theme.colors['--md-sys-color-primary'] ?? '#B14A6B';
}

async function handleSelect(theme: Theme): Promise<void> {
    try {
        await setTheme(theme.id);
        emit('select-theme', theme.id);
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

async function handleFollowSystem(): Promise<void> {
    try {
        await followSystemTheme();
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}
</script>

<template>
    <section class="theme-selector" aria-label="主题选择">
        <header class="theme-selector__header">
            <IconSvg :path="SPARKLE_PATH" :size="18" color="var(--md-sys-color-primary)" />
            <h3 class="theme-selector__title">{{ title }}</h3>
        </header>

        <div
            v-if="isInitializing && themeList.length === 0"
            class="theme-selector__loading"
            role="status"
            aria-live="polite"
        >
            正在加载主题…
        </div>

        <div
            v-else
            class="theme-options-list"
            role="radiogroup"
            :aria-label="title"
        >
            <button
                v-for="theme in themeList"
                :key="theme.id"
                type="button"
                class="theme-option"
                :class="{ active: theme.id === selectedThemeId }"
                :aria-checked="theme.id === selectedThemeId"
                role="radio"
                @click="handleSelect(theme)"
            >
                <span
                    class="theme-option__preview"
                    :style="{ backgroundColor: getThemePreviewColor(theme) }"
                    aria-hidden="true"
                />
                <span class="theme-option__name">{{ theme.name }}</span>
                <span v-if="theme.isDark" class="theme-option__badge">深色</span>
                <IconSvg
                    v-if="theme.id === selectedThemeId"
                    name="check"
                    :size="18"
                    class="theme-option__check"
                    aria-hidden="true"
                />
            </button>
        </div>

        <BaseButton
            v-if="showFollowSystem"
            variant="outlined"
            size="small"
            block
            class="theme-selector__follow"
            :aria-label="isFollowingSystem ? '已跟随系统深色偏好' : '跟随系统深色偏好'"
            @click="handleFollowSystem"
        >
            {{ isFollowingSystem ? '已跟随系统深色偏好' : '跟随系统深色偏好' }}
        </BaseButton>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.theme-selector {
    display: flex;
    flex-direction: column;
    gap: 12px;

    &__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }

    &__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0;
    }

    &__loading {
        font-size: 13px;
        color: var(--md-sys-color-on-surface-variant);
        padding: 8px 0;
    }

    &__follow {
        margin-top: 4px;
    }
}

.theme-options-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 360px;
    overflow-y: auto;
    @include hide-scrollbar;
}

.theme-option {
    @include button-reset;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    color: var(--md-sys-color-on-surface);
    text-align: left;
    width: 100%;
    @include md-transition(all, var(--md-transition-fast));

    &:hover {
        background: var(--md-sys-color-primary-container);
    }

    &.active {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-primary);
    }

    &__preview {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid transparent;
        flex-shrink: 0;
        @include md-transition(transform, var(--md-transition-fast));
    }

    &:hover &__preview,
    &.active &__preview {
        transform: scale(1.1);
    }

    &.active &__preview {
        border-color: var(--md-sys-color-primary);
        box-shadow: 0 0 0 2px var(--md-sys-color-primary-container);
    }

    &__name {
        font-size: 13px;
        font-weight: 500;
        flex: 1;
        min-width: 0;
        @include text-ellipsis;
    }

    &__badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 10px;
        background: var(--md-sys-color-surface-variant);
        color: var(--md-sys-color-on-surface-variant);
        flex-shrink: 0;
    }

    &__check {
        color: var(--md-sys-color-primary);
        flex-shrink: 0;
        @include md-transition(all, var(--md-transition-fast));
    }
}

html.dark-mode,
body.dark-mode {
    .theme-option__badge {
        background: rgba(255, 255, 255, 0.1);
    }
}
</style>
