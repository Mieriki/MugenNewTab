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
import BaseSegmented, { type SegmentedOption } from '@/components/common/BaseSegmented.vue';
import BaseSwitch from '@/components/common/BaseSwitch.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';
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

const MODE_OPTIONS: SegmentedOption[] = [
    { value: 'light', label: '明亮' },
    { value: 'dark', label: '深色' }
];

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

/**
 * 跟随系统开关
 *
 * 打开时调用 followSystemTheme()；关闭时要显式落一次当前主题——setTheme 会把
 * followSystem 置回 false，否则开关看着关了、存储里还写着跟随，重启又会跳回去。
 */
async function handleFollowSystem(enabled: boolean): Promise<void> {
    try {
        if (enabled) {
            await followSystemTheme();
            return;
        }
        const currentId = selectedThemeId.value;
        if (currentId) {
            await setTheme(currentId);
        }
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}
</script>

<template>
    <div class="theme-selector">
        <SettingsSection title="外观" description="明暗决定用哪一套配色渲染；主题族决定色系。">
            <SettingsRow label="外观" description="选择应用的明暗外观">
                <template #actions>
                    <BaseSegmented
                        :model-value="currentMode"
                        :options="MODE_OPTIONS"
                        aria-label="明暗模式"
                        @change="handleModeChange($event as ThemeMode)"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                v-if="showFollowSystem"
                label="跟随系统"
                description="系统切换深色时自动切到同一色系的暗色变体"
            >
                <template #actions>
                    <BaseSwitch
                        :model-value="isFollowingSystem"
                        aria-label="跟随系统深色偏好"
                        @update:model-value="handleFollowSystem"
                    />
                </template>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection :title="title">
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
                        :size="16"
                        class="theme-option__check"
                        aria-hidden="true"
                    />
                </button>
            </div>
        </SettingsSection>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.theme-selector {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5);

    &__loading {
        font-size: var(--ui-font-small);
        color: var(--ui-muted);
        padding: var(--ui-space-4) 0;
    }
}

// ==================== 主题族列表 ====================
.theme-options-list {
    // 12 个主题族两列排布：一屏能看全，不用在隐藏了滚动条的列表里找
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    padding: var(--ui-space-2) 0;
}

@media (max-width: 560px) {
    .theme-options-list {
        grid-template-columns: 1fr;
    }
}

.theme-option {
    @include button-reset;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: var(--ui-radius-md);
    color: var(--ui-ink);
    text-align: left;
    width: 100%;
    @include ui-interactive;
    @include ui-focus-ring;

    &.active {
        background: var(--ui-elevated);
        box-shadow: inset 0 0 0 1px var(--ui-hairline);
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
        // 预览色可能接近面板底色，用一圈中性描边勾出轮廓
        box-shadow: inset 0 0 0 1px var(--ui-hairline-strong);
    }

    &__preview-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--preview-accent);
    }

    &__name {
        font-size: var(--ui-font-small);
        font-weight: 500;
        flex: 1;
        min-width: 0;
        @include text-ellipsis;
    }

    &__badge {
        font-size: var(--ui-font-micro);
        padding: 1px 6px;
        border-radius: var(--ui-radius-pill);
        background: var(--ui-sunken);
        color: var(--ui-muted);
        flex-shrink: 0;
    }

    &__check {
        color: var(--ui-accent);
        flex-shrink: 0;
    }
}
</style>
