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
            'is-monochrome': isMonochromeIcon,
            'is-inline': isInlineSvg,
        }"
        :style="rootStyle"
        :aria-label="safeAlt"
        role="img"
    >
        <template v-if="isInlineSvg">
            <span class="icon-svg__inline" v-html="sanitizedSvg"></span>
        </template>
        <!--
            内置单色图标（image/icons/*.svg）用 CSS mask 渲染：
            图形当遮罩、颜色由 background-color: currentColor 提供，
            于是 color / currentColor / 主题变量都能直接生效，
            深色模式下也不必再靠 filter 反转。
        -->
        <template v-else-if="isMaskIcon">
            <span class="icon-svg__mask" :style="maskStyle" aria-hidden="true"></span>
        </template>
        <template v-else>
            <!--
                解析缓存期间不渲染 <img>：src 为空会立即触发 error，
                从而被误判成「图标加载失败」而永久回退到占位图。
            -->
            <img
                v-if="currentSrc"
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
import { mediaCacheService } from '@/services/mediaCache.service';

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
    /** 颜色覆盖（内联 SVG 与系统图标均生效；图片图标不生效） */
    color?: string;
    /** 是否为单色图标：图片图标在深色模式下自动反转 */
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

/**
 * 是否为「内置单色图标」：public/image/icons/*.svg
 *
 * 这批文件全是 `fill="#000000"` 的纯黑图形，既没有品牌色也不需要保留颜色，
 * 渲染成 <img> 后无法跟随 currentColor（深色背景上直接看不见），
 * 所以统一改成 CSS mask 渲染：图形当遮罩、颜色取 currentColor。
 */
const BUILTIN_ICON_SRC_PATTERN = /(?:^|\/)(image\/icons\/[\w-]+\.svg)$/i;

/**
 * 归一化内置图标地址，返回站点绝对路径 /image/icons/xxx.svg；非内置图标返回空串
 *
 * 必须归一化：遮罩地址是通过 --icon-mask 交给样式表里的 mask-image: var(...) 使用的，
 * 而自定义属性里的 url() 会按「使用它的那条规则所在的样式表」解析，
 * 不是按元素所在文档解析。打包后样式表在 /js/ 下，`./image/icons/x.svg`
 * 就会被解析成 /js/image/icons/x.svg 而 404（开发模式样式内联在文档里，看不出来）。
 */
function normalizeBuiltinIconSource(source?: string): string {
    if (!source) {
        return '';
    }
    const match = BUILTIN_ICON_SRC_PATTERN.exec(source);
    return match ? `/${match[1]}` : '';
}

function isBuiltinIconSource(source?: string): boolean {
    return !!normalizeBuiltinIconSource(source);
}

/**
 * 是否需要按单色图标处理（图片图标在深色模式下反转成白色）
 *
 * 内置单色图标已经走 mask（见 isMaskIcon），颜色天然跟随 currentColor，
 * 不再需要 filter 反转；这个标记只对仍然走 <img> 的图片图标有意义。
 * 自动判定规则：
 * - 内置单色图标（系统图标名 / image/icons 下的 svg）：自动单色
 * - 显式传了远程或 data URL（应用品牌图标，通常是彩色的）：绝不反转
 * - path/paths 内联图标：用 currentColor 绘制，反转会反向，不自动处理
 */
const isMonochromeIcon = computed(() => {
    if (props.monochrome) {
        return true;
    }
    if (isInlineSvg.value) {
        return false;
    }
    return isBuiltinIconSource(effectiveSource.value);
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

/**
 * 实际用于渲染的地址
 *
 * 空串表示「还在解析缓存」，此时不渲染网络地址——否则每次打开新标签页
 * 都会先按网络地址发一遍请求，缓存等于白做。解析完再决定用 blob: 还是网络地址。
 */
const resolvedSource = ref('');

/** 当前源的图片加载失败次数（需在 watch 之前声明：watch immediate 会立即访问） */
const imageErrorCount = ref(0);

// 远程图标：先查缓存，未命中再抓一次并缓存（只发一次请求），失败才回退网络地址
watch(
    effectiveSource,
    source => {
        resolvedSource.value = '';
        // 源变化时重置错误计数，让新地址有机会正常加载（否则会一直停留在回退图）
        imageErrorCount.value = 0;

        if (!mediaCacheService.isCacheableUrl(source)) {
            resolvedSource.value = source;
            return;
        }

        void (async () => {
            const cached = await mediaCacheService.resolve(source);
            if (effectiveSource.value !== source) return;
            if (cached) {
                resolvedSource.value = cached;
                return;
            }
            const fetched = await mediaCacheService.fetchAndCache(source, 'icon');
            if (effectiveSource.value !== source) return;
            // 抓不到（跨域被拦等）时退回原始地址，图标仍能显示
            resolvedSource.value = fetched ?? source;
        })();
    },
    { immediate: true }
);

/** 图片模式下的当前地址（内联模式为空） */
const currentSrc = computed(() => {
    if (isInlineSvg.value) {
        return '';
    }
    if (imageErrorCount.value > 0 && resolvedFallback.value) {
        return resolvedFallback.value;
    }
    return resolvedSource.value;
});

/** 遮罩图地址：内置图标是扩展内置文件，不经媒体缓存，统一用站点绝对路径 */
const maskUrl = computed(() => {
    const source = resolvedSource.value || effectiveSource.value;
    return normalizeBuiltinIconSource(source);
});

/**
 * 内置单色图标一律走 CSS mask 渲染
 *
 * mask 渲染要求图形是「纯单色轮廓」，image/icons 下的 svg 正好全是
 * fill="#000000" 的纯黑图形，天生适合当遮罩。
 * 品牌图标（src 指向远程 / 用户上传的图片）是彩色的，必须继续用 <img>。
 */
const isMaskIcon = computed(() => !!maskUrl.value);

/** 遮罩图以 CSS 变量注入，具体尺寸 / 重复方式在样式里声明 */
const maskStyle = computed(() => {
    if (!maskUrl.value) {
        return undefined;
    }
    return { '--icon-mask': `url("${maskUrl.value}")` };
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

function onImageError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (img && resolvedSource.value.startsWith('blob:')) {
        // 缓存内容损坏：移除缓存并回退到原始网络地址重新加载
        const source = effectiveSource.value;
        void mediaCacheService.evict(source);
        resolvedSource.value = source;
        return;
    }
    // 只在首次失败时切换回退图；回退图自身再失败时不再重复赋值 img.src，
    // 否则相对路径回退会因 img.src（绝对 URL）与 resolvedFallback（原始字符串）永不相等而无限触发 error
    const alreadyOnFallback = imageErrorCount.value > 0;
    imageErrorCount.value += 1;
    if (!alreadyOnFallback && img) {
        img.src = resolvedFallback.value;
    }
    emit('error', event);
}

function onImageLoad(event: Event) {
    // 缓存写入已在 fetchAndCache 里完成，这里只负责向上抛事件
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

    /*
      系统图标遮罩：图形来自 --icon-mask，颜色来自 currentColor。
      显式 color 属性会同时写进 --icon-fill，这里优先用它，保持一致。
    */
    &__mask {
        display: block;
        width: 100%;
        height: 100%;
        background-color: var(--icon-fill, currentColor);
        -webkit-mask-image: var(--icon-mask);
        mask-image: var(--icon-mask);
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        -webkit-mask-size: contain;
        mask-size: contain;
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

    /*
      只对仍然走 <img> 的图片图标做深色反转；
      __mask 不在选择器里，它的颜色由 currentColor 决定，不能反。
    */
    &.is-monochrome &__img,
    &.is-monochrome :deep(svg) {
        filter: var(--icon-filter, none);
    }
}
</style>
