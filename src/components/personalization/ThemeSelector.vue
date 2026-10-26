<script setup lang="ts">
/**
 * ThemeSelector - 主题选择器
 *
 * 每套主题都有明亮/深色两套配色，所以选择器拆成两层：
 * - 上方「明亮 / 深色」开关决定用哪一套配色渲染
 * - 下方列表只列主题族（色系），点一下即在该色系内切换
 *
 * 这样 12 个主题不会变成 24 个卡片，切换明暗也不用重新找位置。
 */
import { computed } from 'vue';
import { useTheme } from '@/composables/useTheme';
import IconSvg from '@/components/icon/IconSvg.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import type { ThemeFamily, ThemeMode } from '@/types/config';

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
    (e: 'select-mode', mode: ThemeMode): void;
    (e: 'error', message: string): void;
}>();

const {
    themeFamilies,
    currentFamilyId,
    currentMode,
    selectedThemeId,
    isInitializing,
    isFollowingSystem,
    setTheme,
    setMode,
    followSystemTheme
} = useTheme({ autoInit: props.autoInit });

const familyList = computed<ThemeFamily[]>(() => themeFamilies.value);

const MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
    { value: 'light', label: '明亮' },
    { value: 'dark', label: '深色' }
];

const SPARKLE_PATH = 'M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z';

/**
 * 预览圆点：左半是明亮模式的表面色、右半是深色模式的表面色，
 * 中间的小圆是这一族的主色——一眼看出「同一色系的两种渲染」。
 */
function getPreviewStyle(family: ThemeFamily): Record<string, string> {
    const lightSurface = family.light?.colors['--md-sys-color-surface'] ?? '#FFFFFF';
    const darkSurface = family.dark?.colors['--md-sys-color-surface'] ?? '#121212';
    const accent = (currentMode.value === 'dark' ? family.dark : family.light)
        ?.colors['--md-sys-color-primary']
        ?? family.light?.colors['--md-sys-color-primary']
        ?? '#B14A6B';

    return {
        '--preview-light': lightSurface,
        '--preview-dark': darkSurface,
        '--preview-accent': accent
    };
}

async function handleSelect(family: ThemeFamily): Promise<void> {
    const target = (currentMode.value === 'dark' ? family.dark : family.light)
        ?? family.light
        ?? family.dark;
    if (!target || target.id === selectedThemeId.value) {
        return;
    }
    try {
        await setTheme(target.id);
        emit('select-theme', target.id);
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

async function handleModeChange(mode: ThemeMode): Promise<void> {
    if (mode === currentMode.value) {
        return;
    }
    try {
        await setMode(mode);
        emit('select-mode', mode);
        // 模式切换同样会落到一个具体变体上，父组件按主题 ID 处理时不必区分来源
        if (selectedThemeId.value) {
            emit('select-theme', selectedThemeId.value);
        }
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

        <div class="theme-mode" role="radiogroup" aria-label="明暗模式">
            <button
                v-for="option in MODE_OPTIONS"
                :key="option.value"
                type="button"
                class="theme-mode__btn"
                :class="{ active: currentMode === option.value }"
                :aria-checked="currentMode === option.value"
                role="radio"
                @click="handleModeChange(option.value)"
            >
                {{ option.label }}
            </button>
        </div>

        <div
            v-if="isInitializing && familyList.length === 0"
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
                v-for="family in familyList"
                :key="family.id"
                type="button"
                class="theme-option"
                :class="{ active: family.id === currentFamilyId }"
                :aria-checked="family.id === currentFamilyId"
                role="radio"
                :title="family.description"
                @click="handleSelect(family)"
            >
                <span
                    class="theme-option__preview"
                    :style="getPreviewStyle(family)"
                    aria-hidden="true"
                >
                    <span class="theme-option__preview-dot" />
                </span>
                <span class="theme-option__name">{{ family.name }}</span>
                <span
                    v-if="!family.light || !family.dark"
                    class="theme-option__badge"
                >
                    {{ family.light ? '仅明亮' : '仅深色' }}
                </span>
                <IconSvg
                    v-if="family.id === currentFamilyId"
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

// ==================== 明/暗模式开关 ====================
.theme-mode {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: var(--md-sys-color-surface-variant);
    // 深色主题下 surface-variant 与面板底色很接近，加一圈内描边把轨道勾出来
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-sys-color-on-surface) 7%, transparent);

    &__btn {
        @include button-reset;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 9px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface-variant);
        @include md-transition(all, var(--md-transition-fast));

        &:hover {
            color: var(--md-sys-color-on-surface);
        }

        &.active {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            box-shadow: 0 2px 8px var(--md-shadow);
        }
    }
}

.theme-options-list {
    // 12 个主题族两列排布：一屏能看全，不用在隐藏了滚动条的列表里找
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    max-height: 420px;
    overflow-y: auto;
    @include hide-scrollbar;
}

@media (max-width: 380px) {
    .theme-options-list {
        grid-template-columns: 1fr;
    }
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
        position: relative;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        // 左半明亮表面、右半深色表面，中间是这一族的主色
        background: linear-gradient(
            135deg,
            var(--preview-light) 0 50%,
            var(--preview-dark) 50% 100%
        );
        box-shadow: inset 0 0 0 1.5px var(--preview-accent);
        @include md-transition(transform, var(--md-transition-fast));
    }

    &__preview-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--preview-accent);
    }

    &:hover &__preview,
    &.active &__preview {
        transform: scale(1.1);
    }

    &.active &__preview {
        box-shadow:
            inset 0 0 0 1.5px var(--preview-accent),
            0 0 0 2px var(--md-sys-color-primary-container);
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
