/**
 * cardStyle.store
 * 卡片样式设置（不透明度 / 磨砂 / 圆角 / 阴影 / 描边）的状态管理与持久化。
 *
 * 设计要点：
 * - 设置经 storageManager 持久化（键 CARD_STYLE），并同步镜像到 localStorage，
 *   保证首屏第一帧就是用户设定的样式（见 SYNC_MIRROR_KEYS）；
 * - 值最终落成 :root 上的 --card-* 变量，卡片（AppCard / AppCardDragGhost）只读变量，
 *   因此改一处全站生效，主题切换时底色也会自动跟着 --md-sys-color-surface-rgb 走；
 * - store 创建时先按同步镜像铺一遍，init() 再用真实存储校正（与 layout.store 一致）。
 */

import { ref } from 'vue';
import { defineStore } from 'pinia';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS, type CardStyleSettings } from '@/types/storage';

/** 卡片底色默认不透明度：与 --card-surface-opacity 的默认值保持一致 */
const DEFAULT_OPACITY = 0.78;
/** 磨砂默认关闭（backdrop-filter 对几十张卡片有合成开销，按需开启） */
const DEFAULT_BLUR = 0;
/** 默认圆角，对应 --card-radius 的默认值 */
const DEFAULT_RADIUS = 12;
/** 阴影默认满强度 */
const DEFAULT_SHADOW = 1;
/** 默认显示描边 */
const DEFAULT_BORDERED = true;

/** 磨砂半径上限（px） */
const MAX_BLUR = 24;
/** 圆角上限（px） */
const MAX_RADIUS = 24;

export const useCardStyleStore = defineStore('cardStyle', () => {
    const opacity = ref(DEFAULT_OPACITY);
    const blur = ref(DEFAULT_BLUR);
    const radius = ref(DEFAULT_RADIUS);
    const shadow = ref(DEFAULT_SHADOW);
    const bordered = ref(DEFAULT_BORDERED);
    const initialized = ref(false);

    /** 判断数值是否在闭区间内 */
    function inRange(value: unknown, min: number, max: number): value is number {
        return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
    }

    /**
     * 把选择器数值映射到 CSS 变量
     *
     * 变量只带数值/长度，颜色拼装留给 variables.scss：主题换色时
     * --md-sys-color-surface-rgb 变了，卡片底色自然跟着变。
     */
    function applyToDocument(): void {
        if (typeof document === 'undefined') {
            return;
        }
        const root = document.documentElement;
        root.style.setProperty('--card-surface-opacity', String(opacity.value));
        root.style.setProperty('--card-radius', `${radius.value}px`);
        root.style.setProperty('--card-shadow-alpha', String(shadow.value));
        root.style.setProperty(
            '--card-border-color',
            bordered.value ? 'var(--md-sys-color-outline-variant)' : 'transparent'
        );
        // 0 时输出 none：避免给每张卡片都建一层昂贵的背景模糊合成
        root.style.setProperty(
            '--card-backdrop',
            blur.value > 0 ? `blur(${blur.value}px)` : 'none'
        );
    }

    /**
     * 把一份（可能不完整 / 来自旧版本的）设置合并进当前状态。
     *
     * 字段缺失或取值非法时保持原值，因此可以安全地拿「同步镜像」和
     * 「storage 里的真实值」各调一次，后调的自然覆盖前调的。
     */
    function applySettings(saved: Partial<CardStyleSettings> | null | undefined): void {
        if (!saved || typeof saved !== 'object') return;

        if (inRange(saved.opacity, 0, 1)) {
            opacity.value = saved.opacity;
        }
        if (inRange(saved.blur, 0, MAX_BLUR)) {
            blur.value = saved.blur;
        }
        if (inRange(saved.radius, 0, MAX_RADIUS)) {
            radius.value = saved.radius;
        }
        if (inRange(saved.shadow, 0, 1)) {
            shadow.value = saved.shadow;
        }
        if (typeof saved.bordered === 'boolean') {
            bordered.value = saved.bordered;
        }
    }

    /** 同步读取 localStorage 镜像（首屏兜底，避免先按默认样式画一遍再变） */
    function readMirroredSettings(): Partial<CardStyleSettings> | null {
        try {
            const mirrored = storageManager.getSync(STORAGE_KEYS.CARD_STYLE);
            return mirrored && typeof mirrored === 'object'
                ? (mirrored as Partial<CardStyleSettings>)
                : null;
        } catch (error) {
            console.warn('[CardStyleStore] 读取卡片样式镜像失败:', error);
            return null;
        }
    }

    // 首屏同步兜底：必须在第一次渲染前完成
    applySettings(readMirroredSettings());
    applyToDocument();

    /** 当前状态对应的完整设置对象（持久化与镜像回填共用） */
    function buildSettings(): CardStyleSettings {
        return {
            opacity: opacity.value,
            blur: blur.value,
            radius: radius.value,
            shadow: shadow.value,
            bordered: bordered.value,
        };
    }

    async function persist(): Promise<void> {
        await storageManager.set(STORAGE_KEYS.CARD_STYLE, buildSettings());
    }

    /**
     * 加载卡片样式（幂等）
     *
     * 首屏已经用同步镜像铺过一遍，这里读到真实存储后再校正一次；
     * 两者一致时不会触发任何重渲染，因此不会产生二次闪烁。
     */
    async function init(): Promise<void> {
        if (initialized.value) return;
        try {
            const saved = (await storageManager.get(STORAGE_KEYS.CARD_STYLE)) as Partial<CardStyleSettings> | null;
            applySettings(saved);
            applyToDocument();
            if (saved && typeof saved === 'object') {
                storageManager.writeSyncMirror(STORAGE_KEYS.CARD_STYLE, buildSettings());
            }
            initialized.value = true;
        } catch (error) {
            console.error('[CardStyleStore] 加载卡片样式失败:', error);
        }
    }

    async function setOpacity(value: number): Promise<void> {
        if (!inRange(value, 0, 1)) return;
        opacity.value = value;
        applyToDocument();
        await persist();
    }

    async function setBlur(value: number): Promise<void> {
        if (!inRange(value, 0, MAX_BLUR)) return;
        blur.value = value;
        applyToDocument();
        await persist();
    }

    async function setRadius(value: number): Promise<void> {
        if (!inRange(value, 0, MAX_RADIUS)) return;
        radius.value = value;
        applyToDocument();
        await persist();
    }

    async function setShadow(value: number): Promise<void> {
        if (!inRange(value, 0, 1)) return;
        shadow.value = value;
        applyToDocument();
        await persist();
    }

    async function setBordered(value: boolean): Promise<void> {
        bordered.value = value;
        applyToDocument();
        await persist();
    }

    /** 恢复全部默认值 */
    async function reset(): Promise<void> {
        opacity.value = DEFAULT_OPACITY;
        blur.value = DEFAULT_BLUR;
        radius.value = DEFAULT_RADIUS;
        shadow.value = DEFAULT_SHADOW;
        bordered.value = DEFAULT_BORDERED;
        applyToDocument();
        await persist();
    }

    return {
        opacity,
        blur,
        radius,
        shadow,
        bordered,
        initialized,
        init,
        setOpacity,
        setBlur,
        setRadius,
        setShadow,
        setBordered,
        reset,
    };
});

/** 默认值与取值范围，供设置面板复用（避免两份硬编码） */
export const CARD_STYLE_DEFAULTS = {
    opacity: DEFAULT_OPACITY,
    blur: DEFAULT_BLUR,
    radius: DEFAULT_RADIUS,
    shadow: DEFAULT_SHADOW,
    bordered: DEFAULT_BORDERED,
    maxBlur: MAX_BLUR,
    maxRadius: MAX_RADIUS,
} as const;
