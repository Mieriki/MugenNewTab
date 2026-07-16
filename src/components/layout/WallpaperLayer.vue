<script setup lang="ts">
/**
 * WallpaperLayer - 壁纸背景层
 *
 * 使用 useWallpaper 获取当前壁纸设置与样式，渲染背景图片层与遮罩层。
 * 该组件为纯展示层，所有交互逻辑由父组件或 useWallpaper 提供。
 */
import { computed } from 'vue';
import { useWallpaper } from '@/composables/useWallpaper';

const { wallpaperStyle, settings, hasWallpaper } = useWallpaper();

const overlayStyle = computed(() => ({
    opacity: String(settings.value.overlayOpacity)
}));

const hasBackground = computed(() => hasWallpaper.value);
</script>

<template>
    <div
        class="wallpaper-layer"
        :class="{ 'has-background': hasBackground }"
        :style="wallpaperStyle"
        aria-hidden="true"
    />
    <div
        class="wallpaper-overlay"
        :style="overlayStyle"
        aria-hidden="true"
    />
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.wallpaper-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    @include md-transition(opacity filter);
    pointer-events: none;
    will-change: transform, opacity;

    &:not(.has-background) {
        background-image: none !important;
    }
}

.wallpaper-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background: var(--md-sys-color-background);
    @include md-transition(opacity);
    pointer-events: none;
}

@media (max-width: 768px) {
    .wallpaper-layer {
        filter: none !important;
    }
}
</style>
