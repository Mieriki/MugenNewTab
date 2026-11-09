<script setup lang="ts">
/**
 * WallpaperSettings - 壁纸背景设置
 *
 * 提供预设壁纸、网络图片 URL、本地图片上传，以及透明度/模糊/遮罩调节。
 * 所有状态通过 useWallpaper 读写并持久化。
 */
import { computed, ref, watch } from 'vue';
import { useWallpaper } from '@/composables/useWallpaper';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSlider from '@/components/common/BaseSlider.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';

export interface WallpaperSettingsProps {
    /** 面板标题 */
    title?: string;
    /** 预设壁纸 URL 列表 */
    presets?: string[];
    /** 是否自动初始化壁纸 store */
    autoInit?: boolean;
}

const props = withDefaults(defineProps<WallpaperSettingsProps>(), {
    title: '壁纸背景',
    presets: () => [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
        'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1920&q=80',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80',
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80'
    ],
    autoInit: true
});

const emit = defineEmits<{
    (e: 'error', message: string): void;
    (e: 'change'): void;
}>();

const {
    settings,
    effectiveUrl,
    hasWallpaper,
    isLocalImage,
    imageData,
    loading,
    setUrl,
    setLocalImage,
    setOpacity,
    setBlur,
    setOverlayOpacity,
    removeWallpaper
} = useWallpaper({ autoInit: props.autoInit });

const urlInput = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

watch(
    () => settings.value.url,
    (next) => {
        urlInput.value = next ?? '';
    },
    { immediate: true }
);

/** 分组说明：直接把「当前是否启用壁纸」写在这里，省掉原来底部那一行状态 */
const statusText = computed(() => {
    if (!hasWallpaper.value) {
        return '尚未设置壁纸';
    }
    return `当前已启用${isLocalImage.value ? '本地图片' : '网络图片'}壁纸`;
});

function isPresetActive(url: string): boolean {
    return !isLocalImage.value && effectiveUrl.value === url;
}

async function handlePresetClick(url: string): Promise<void> {
    try {
        await setUrl(url);
        emit('change');
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

async function handleApplyUrl(): Promise<void> {
    try {
        await setUrl(urlInput.value.trim());
        emit('change');
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

function handleFileSelect(): void {
    fileInputRef.value?.click();
}

async function handleFileChange(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
        return;
    }

    try {
        await setLocalImage(file);
        emit('change');
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    } finally {
        if (target) {
            target.value = '';
        }
    }
}

async function handleRemove(): Promise<void> {
    try {
        await removeWallpaper();
        urlInput.value = '';
        emit('change');
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

async function handleOpacityChange(value: number): Promise<void> {
    try {
        await setOpacity(value);
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

async function handleBlurChange(value: number): Promise<void> {
    try {
        await setBlur(value);
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

async function handleOverlayChange(value: number): Promise<void> {
    try {
        await setOverlayOpacity(value);
    } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err));
    }
}

function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function formatPx(value: number): string {
    return `${value}px`;
}
</script>

<template>
    <div class="wallpaper-settings">
        <SettingsSection :title="title" :description="statusText">
            <SettingsRow label="预设壁纸" description="点击即应用，本地缓存开启时会存到本地" stacked>
                <template #actions>
                    <div class="wallpaper-presets" role="group" aria-label="预设壁纸">
                        <button
                            v-for="(url, index) in presets"
                            :key="index"
                            type="button"
                            class="wallpaper-preset"
                            :class="{ active: isPresetActive(url) }"
                            :style="{ backgroundImage: `url(${url})` }"
                            :title="`预设壁纸 ${index + 1}`"
                            @click="handlePresetClick(url)"
                        />
                    </div>
                </template>
            </SettingsRow>

            <SettingsRow label="图片地址" description="支持任意 http(s) 图片直链" stacked>
                <template #actions>
                    <div class="wallpaper-row">
                        <BaseInput
                            v-model="urlInput"
                            placeholder="输入图片 URL..."
                            type="url"
                            :disabled="loading"
                            class="wallpaper-row__input"
                            @enter="handleApplyUrl"
                        />
                        <BaseButton
                            variant="primary"
                            size="small"
                            :loading="loading"
                            :disabled="!urlInput"
                            @click="handleApplyUrl"
                        >
                            应用
                        </BaseButton>
                    </div>
                </template>
            </SettingsRow>

            <SettingsRow label="本地图片" :description="imageData ? imageData.name : '从设备选择图片，只存在本机'">
                <template #actions>
                    <input
                        ref="fileInputRef"
                        type="file"
                        accept="image/*"
                        class="wallpaper-local__input"
                        @change="handleFileChange"
                    >
                    <BaseButton
                        variant="outlined"
                        size="small"
                        :loading="loading"
                        @click="handleFileSelect"
                    >
                        选择图片
                    </BaseButton>
                </template>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="显示效果" description="调整壁纸与页面的叠加方式。">
            <SettingsRow label="壁纸透明度" stacked>
                <template #actions>
                    <BaseSlider
                        v-model="settings.opacity"
                        :show-value="true"
                        :min="0"
                        :max="1"
                        :step="0.01"
                        :format-value="formatPercent"
                        :disabled="loading"
                        class="wallpaper-slider"
                        @change="handleOpacityChange"
                    />
                </template>
            </SettingsRow>

            <SettingsRow label="模糊程度" stacked>
                <template #actions>
                    <BaseSlider
                        v-model="settings.blur"
                        :show-value="true"
                        :min="0"
                        :max="20"
                        :step="0.5"
                        :format-value="formatPx"
                        :disabled="loading"
                        class="wallpaper-slider"
                        @change="handleBlurChange"
                    />
                </template>
            </SettingsRow>

            <SettingsRow label="背景遮罩" description="遮罩越深，壁纸上的文字越清晰" stacked>
                <template #actions>
                    <BaseSlider
                        v-model="settings.overlayOpacity"
                        :show-value="true"
                        :min="0"
                        :max="1"
                        :step="0.01"
                        :format-value="formatPercent"
                        :disabled="loading"
                        class="wallpaper-slider"
                        @change="handleOverlayChange"
                    />
                </template>
            </SettingsRow>
        </SettingsSection>

        <div class="wallpaper-settings__actions">
            <BaseButton
                variant="outlined"
                size="small"
                :loading="loading"
                @click="handleRemove"
            >
                恢复默认背景
            </BaseButton>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.wallpaper-settings {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5);

    &__actions {
        display: flex;
        justify-content: flex-start;
    }
}

// ==================== 预设壁纸 ====================
.wallpaper-presets {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-2);
    width: 100%;
}

.wallpaper-preset {
    @include button-reset;
    aspect-ratio: 16 / 10;
    border-radius: var(--ui-radius-md);
    // 预设缩略图直接铺满，靠 1px 描边勾出边界
    box-shadow: inset 0 0 0 1px var(--ui-hairline-strong);
    background-size: cover;
    background-position: center;
    opacity: 0.72;
    @include ui-transition(opacity);
    @include ui-focus-ring;

    &:hover {
        opacity: 1;
    }

    &.active {
        opacity: 1;
        box-shadow:
            inset 0 0 0 2px var(--ui-accent),
            0 0 0 3px var(--ui-accent-soft);
    }
}

// ==================== 地址行 ====================
.wallpaper-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
    width: 100%;

    &__input {
        flex: 1;
        min-width: 0;
    }
}

.wallpaper-local__input {
    display: none;
}

.wallpaper-slider {
    width: 100%;
}

@include respond-to(mobile) {
    .wallpaper-presets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
