<!--
  IconSvg - 统一 SVG 图标渲染组件
  支持系统图标 name、外部 src、错误回退、尺寸与颜色控制。
  禁止使用 emoji 作为图标，缺失或无效时渲染系统 SVG 占位。
-->
<template>
    <component
        :is="tag"
        class="icon-svg"
        :class="{
            'is-monochrome': monochrome,
            'is-inline': isInlineSvg,
        }"
        :style="rootStyle"
        :aria-label="safeAlt"
        role="img"
    >
        <template v-if="isInlineSvg">
            <span class="icon-svg__inline" v-html="sanitizedSvg"></span>
        </template>
        <template v-else>
            <img
                class="icon-svg__img"
                :src="currentSrc"
                :alt="safeAlt"
                loading="lazy"
                decoding="async"
                draggable="false"
                @error="onImageError"
                @load="onImageLoad"
            />
        </template>
    </component>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    getSystemIconUrl,
    createPlaceholderSvg,
} from '@/utils/image.util';
import { iconCacheService } from '@/services/iconCache.service';

/** 组件接收的属性 */
interface Props {
    /** 系统图标名称，将解析为 /image/icons/{name}.svg */
    name?: string;
    /** 图标地址：URL、路径或 data URL */
    src?: string;
    /** 加载失败时的回退图标名称或地址 */
    fallback?: string;
    /** 图标尺寸，默认 24（单位 px） */
    size?: number | string;
    /** 颜色覆盖（对内联 SVG 有效） */
    color?: string;
    /** 是否为单色图标，深色模式下自动反转 */
    monochrome?: boolean;
    /** 无障碍替代文本 */
    alt?: string;
    /** 是否尝试将 SVG 字符串以内联方式渲染 */
    inline?: boolean;
    /** 单条 SVG path 的 d 属性（自动以内联方式渲染） */
    path?: string;
    /** 多条 SVG path 的 d 属性数组（自动以内联方式渲染） */
    paths?: string[];
    /** 渲染标签，默认 span */
    tag?: string;
}

const props = withDefaults(defineProps<Props>(), {
    name: undefined,
    src: undefined,
    fallback: undefined,
    size: 24,
    color: undefined,
    monochrome: false,
    alt: '',
    inline: false,
    path: undefined,
    paths: undefined,
    tag: 'span',
});

const emit = defineEmits<{
    /** 图片加载失败 */
    (e: 'error', event: Event): void;
    /** 图片加载完成 */
    (e: 'load', event: Event): void;
}>();

const SYSTEM_PLACEHOLDER = createPlaceholderSvg();

/** 检测字符串是否包含 emoji（基于 Unicode Extended_Pictographic） */
function containsEmoji(value: string): boolean {
    return /\p{Extended_Pictographic}/u.test(value);
}

/** 判断是否为内联 SVG 字符串 */
function isInlineSvgString(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.startsWith('<svg') || trimmed.startsWith('<?xml');
}

/** 解析有效图标源地址 */
function resolveIconSrc(value?: string): string | null {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (containsEmoji(trimmed)) {
        return null;
    }
    if (isInlineSvgString(trimmed)) {
        return trimmed;
    }
    return trimmed;
}

/** 将纯图标名称解析为系统 SVG URL；其他值原样返回 */
function resolveNameOrUrl(value: string): string {
    if (/^[\w-]+$/i.test(value) && !value.includes('/') && !value.includes('.')) {
        return getSystemIconUrl(value);
    }
    return value;
}

/** 当前生效的源（可能为 SVG 字符串或图片 URL） */
const effectiveSource = computed<string>(() => {
    const fromSrc = resolveIconSrc(props.src);
    if (fromSrc) {
        return fromSrc;
    }
    if (props.name) {
        const fromName = resolveNameOrUrl(props.name);
        if (!containsEmoji(fromName)) {
            return fromName;
        }
    }
    const fromFallback = resolveIconSrc(props.fallback);
    if (fromFallback) {
        return resolveNameOrUrl(fromFallback);
    }
    return SYSTEM_PLACEHOLDER;
});

const isInlineSvg = computed(() => {
    if (props.path || (props.paths && props.paths.length > 0)) {
        return true;
    }
    return props.inline && isInlineSvgString(effectiveSource.value);
});

/** 内联 SVG 内容 */
const sanitizedSvg = computed(() => {
    if (props.path || (props.paths && props.paths.length > 0)) {
        const paths = props.paths && props.paths.length > 0 ? props.paths : [props.path];
        const pathEls = paths
            ?.filter((d): d is string => !!d)
            .map(d => `<path d="${d.replace(/"/g, '&quot;')}" />`)
            .join('') ?? '';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathEls}</svg>`;
    }

    const svg = effectiveSource.value;
    if (!isInlineSvgString(svg)) {
        return '';
    }
    return svg
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\son\w+=["'][^"']*["']/gi, '');
});

const resolvedFallback = computed(() => {
    const fb = resolveIconSrc(props.fallback);
    const resolved = fb ? resolveNameOrUrl(fb) : SYSTEM_PLACEHOLDER;
    return resolved !== effectiveSource.value ? resolved : SYSTEM_PLACEHOLDER;
});

/** 当前源是否为可缓存的远程图标地址 */
const isRemoteSource = computed(() => {
    return !isInlineSvg.value && iconCacheService.isCacheableUrl(effectiveSource.value);
});

/** 从 IndexedDB 缓存解析出的对象地址（未命中时为 null） */
const cachedObjectUrl = ref<string | null>(null);

// 远程图标优先尝试命中缓存；缓存不可用时静默回退到网络加载
watch(
    effectiveSource,
    source => {
        cachedObjectUrl.value = null;
        if (!iconCacheService.isCacheableUrl(source)) {
            return;
        }
        void iconCacheService.resolve(source).then(objectUrl => {
            if (objectUrl && effectiveSource.value === source) {
                cachedObjectUrl.value = objectUrl;
            }
        });
    },
    { immediate: true }
);

/** 图片模式下的当前地址（内联模式为空） */
const currentSrc = computed(() => {
    if (isInlineSvg.value) {
        return '';
    }
    if (imageErrorCount.value === 0 && cachedObjectUrl.value) {
        return cachedObjectUrl.value;
    }
    return imageErrorCount.value > 0 && resolvedFallback.value
        ? resolvedFallback.value
        : effectiveSource.value;
});

const safeAlt = computed(() => props.alt?.trim() ?? '');

const numericSize = computed(() => {
    const size = props.size;
    const num = typeof size === 'string' ? parseFloat(size) : size;
    return Number.isFinite(num) && num > 0 ? num : 24;
});

const rootStyle = computed(() => {
    const style: Record<string, string> = {
        width: `${numericSize.value}px`,
        height: `${numericSize.value}px`,
    };
    if (props.color) {
        style.color = props.color;
        style['--icon-fill'] = props.color;
    }
    return style;
});

const imageErrorCount = ref(0);

function onImageError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (img && cachedObjectUrl.value && img.src === cachedObjectUrl.value) {
        // 缓存内容损坏：移除缓存并回退到原始网络地址重新加载
        const source = effectiveSource.value;
        cachedObjectUrl.value = null;
        void iconCacheService.evict(source);
        return;
    }
    imageErrorCount.value += 1;
    if (img && img.src !== resolvedFallback.value) {
        img.src = resolvedFallback.value;
    }
    emit('error', event);
}

function onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (isRemoteSource.value && img && img.src === effectiveSource.value) {
        // 网络加载成功：后台写入 IndexedDB 缓存，供下次打开直接使用
        void iconCacheService.cache(effectiveSource.value);
    }
    emit('load', event);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
@use '@/styles/mixins.scss' as *;

.icon-svg {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    vertical-align: middle;
    overflow: hidden;
    color: var(--md-sys-color-on-surface-variant);

    &__img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        pointer-events: none;
    }

    &__inline {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;

        :deep(svg) {
            width: 100%;
            height: 100%;
            fill: var(--icon-fill, currentColor);
        }
    }

    &.is-monochrome &__img,
    &.is-monochrome :deep(svg) {
        filter: var(--icon-filter, none);
    }
}
</style>
