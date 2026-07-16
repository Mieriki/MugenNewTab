<script setup lang="ts">
/**
 * WallpaperSettings - 壁纸背景设置
 *
 * 提供预设壁纸、网络图片 URL、本地图片上传，以及透明度/模糊/遮罩调节。
 * 所有状态通过 useWallpaper 读写并持久化。
 */
import { ref, watch } from 'vue';
import { useWallpaper } from '@/composables/useWallpaper';
import IconSvg from '@/components/icon/IconSvg.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSlider from '@/components/common/BaseSlider.vue';
import BaseButton from '@/components/common/BaseButton.vue';

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

const PICTURE_PATH = 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z';
const UPLOAD_PATH = 'M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z';
const REFRESH_PATH = 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z';

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
    <section class="wallpaper-settings" aria-label="壁纸设置">
        <header class="wallpaper-settings__header">
            <IconSvg :path="PICTURE_PATH" :size="18" color="var(--md-sys-color-primary)" />
            <h3 class="wallpaper-settings__title">{{ title }}</h3>
        </header>

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

        <div class="wallpaper-url">
            <BaseInput
                v-model="urlInput"
                placeholder="输入图片 URL..."
                type="url"
                :disabled="loading"
                @enter="handleApplyUrl"
            >
                <template #suffix>
                    <BaseButton
                        variant="primary"
                        size="small"
                        :loading="loading"
                        :disabled="!urlInput"
                        @click="handleApplyUrl"
                    >
                        应用
                    </BaseButton>
                </template>
            </BaseInput>
        </div>

        <div class="wallpaper-local">
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
                block
                :loading="loading"
                @click="handleFileSelect"
            >
                <template #icon>
                    <IconSvg :path="UPLOAD_PATH" :size="16" />
                </template>
                选择本地图片
            </BaseButton>
            <div v-if="imageData" class="wallpaper-local__name">
                {{ imageData.name }}
            </div>
        </div>

        <div class="wallpaper-sliders">
            <BaseSlider
                v-model="settings.opacity"
                label="壁纸透明度"
                :min="0"
                :max="1"
                :step="0.01"
                :format-value="formatPercent"
                :disabled="loading"
                @update:model-value="handleOpacityChange"
            />

            <BaseSlider
                v-model="settings.blur"
                label="模糊程度"
                :min="0"
                :max="20"
                :step="0.5"
                :format-value="formatPx"
                :disabled="loading"
                @update:model-value="handleBlurChange"
            />

            <BaseSlider
                v-model="settings.overlayOpacity"
                label="背景遮罩"
                :min="0"
                :max="1"
                :step="0.01"
                :format-value="formatPercent"
                :disabled="loading"
                @update:model-value="handleOverlayChange"
            />
        </div>

        <div class="wallpaper-actions">
            <BaseButton
                variant="outlined"
                size="small"
                :loading="loading"
                @click="handleRemove"
            >
                <template #icon>
                    <IconSvg :path="REFRESH_PATH" :size="16" />
                </template>
                重置
            </BaseButton>
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

        <div v-if="hasWallpaper" class="wallpaper-status">
            当前{{ isLocalImage ? '本地图片' : '网络图片' }}壁纸已启用
        </div>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.wallpaper-settings {
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
}

.wallpaper-presets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
}

.wallpaper-preset {
    @include button-reset;
    aspect-ratio: 16 / 10;
    border-radius: 8px;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    border: 2px solid transparent;
    cursor: pointer;
    @include md-transition(all, var(--md-transition-fast));

    &:hover {
        transform: scale(1.05);
        border-color: var(--md-sys-color-primary);
    }

    &.active {
        border-color: var(--md-sys-color-primary);
        box-shadow: 0 0 0 3px var(--md-sys-color-primary-container);
    }
}

.wallpaper-url {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.wallpaper-local {
    display: flex;
    flex-direction: column;
    gap: 4px;

    &__input {
        @include visually-hidden;
    }

    &__name {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }
}

.wallpaper-sliders {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.wallpaper-actions {
    display: flex;
    gap: 8px;

    > * {
        flex: 1;
    }
}

.wallpaper-status {
    font-size: 12px;
    color: var(--md-sys-color-success);
    text-align: center;
}
</style>
