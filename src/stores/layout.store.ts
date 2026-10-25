/**
 * layout.store
 * 页面布局设置（列数 / 分页）的状态管理与持久化。
 *
 * 设置经 storageManager 持久化（键 LAYOUT_SETTINGS，随云同步），
 * isMobile 通过 matchMedia 监听视口宽度（<768px 时列数强制自适应）。
 */

import { ref } from 'vue';
import { defineStore } from 'pinia';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS, type LayoutSettings, type LinkOpenMode } from '@/types/storage';
import { DEFAULT_OPEN_MODE, isLinkOpenMode } from '@/utils/navigation.util';

const DEFAULT_COLUMNS: number | 'auto' = 'auto';
const DEFAULT_PAGE_SIZE = 24;
const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

export const useLayoutStore = defineStore('layout', () => {
    const columns = ref<number | 'auto'>(DEFAULT_COLUMNS);
    const paginate = ref(false);
    const pageSize = ref(DEFAULT_PAGE_SIZE);
    const showAllCategory = ref(true);
    const allViewFlat = ref(false);
    const showIconBackground = ref(true);
    const minimalMode = ref(false);
    const openMode = ref<LinkOpenMode>(DEFAULT_OPEN_MODE);
    const initialized = ref(false);
    const isMobile = ref(false);

    /**
     * 把一份（可能不完整 / 来自旧版本的）设置合并进当前状态。
     *
     * 字段缺失或取值非法时保持原值，因此可以安全地拿「同步镜像」和
     * 「storage 里的真实值」各调一次，后调的自然覆盖前调的。
     */
    function applySettings(saved: Partial<LayoutSettings> | null | undefined): void {
        if (!saved || typeof saved !== 'object') return;

        if (
            saved.columns === 'auto' ||
            (typeof saved.columns === 'number' && saved.columns >= 1 && saved.columns <= 12)
        ) {
            columns.value = saved.columns;
        }
        if (typeof saved.paginate === 'boolean') {
            paginate.value = saved.paginate;
        }
        if (typeof saved.pageSize === 'number' && saved.pageSize > 0) {
            pageSize.value = saved.pageSize;
        }
        if (typeof saved.showAllCategory === 'boolean') {
            showAllCategory.value = saved.showAllCategory;
        }
        if (typeof saved.allViewFlat === 'boolean') {
            allViewFlat.value = saved.allViewFlat;
        }
        if (typeof saved.showIconBackground === 'boolean') {
            showIconBackground.value = saved.showIconBackground;
        }
        if (typeof saved.minimalMode === 'boolean') {
            minimalMode.value = saved.minimalMode;
        }
        if (isLinkOpenMode(saved.openMode)) {
            openMode.value = saved.openMode;
        }
    }

    /**
     * 同步读取 localStorage 镜像（首屏兜底）。
     *
     * storage.local / chrome.storage 都是异步的：若等它返回再渲染，首帧会先画出
     * 默认的「标准三栏布局」，随后才切成极简约模式——用户看到的就是打开新标签页
     * 时闪一下。这里在 store 创建时同步取镜像，让首次渲染直接是最终形态，
     * init() 再用真实存储校正一次。
     */
    function readMirroredSettings(): Partial<LayoutSettings> | null {
        try {
            const mirrored = storageManager.getSync(STORAGE_KEYS.LAYOUT_SETTINGS);
            return mirrored && typeof mirrored === 'object'
                ? (mirrored as Partial<LayoutSettings>)
                : null;
        } catch (error) {
            console.warn('[LayoutStore] 读取布局镜像失败:', error);
            return null;
        }
    }

    // 首屏同步兜底：必须在第一次渲染前完成
    applySettings(readMirroredSettings());

    let mediaQueryList: MediaQueryList | null = null;
    let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

    /**
     * 监听视口宽度变化（jsdom 等无 matchMedia 的环境下保持 isMobile=false）
     */
    function setupMediaListener(): void {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
        isMobile.value = mediaQueryList.matches;
        mediaListener = (event: MediaQueryListEvent) => {
            isMobile.value = event.matches;
        };
        mediaQueryList.addEventListener('change', mediaListener);
    }

    /** 当前状态对应的完整设置对象（持久化与镜像回填共用） */
    function buildSettings(): LayoutSettings {
        return {
            columns: columns.value,
            paginate: paginate.value,
            pageSize: pageSize.value,
            showAllCategory: showAllCategory.value,
            allViewFlat: allViewFlat.value,
            showIconBackground: showIconBackground.value,
            minimalMode: minimalMode.value,
            openMode: openMode.value,
        };
    }

    async function persist(): Promise<void> {
        await storageManager.set(STORAGE_KEYS.LAYOUT_SETTINGS, buildSettings());
    }

    /**
     * 加载布局设置（幂等）
     *
     * 首屏已经用同步镜像铺过一遍，这里读到真实存储后再校正一次；
     * 两者一致时不会触发任何重渲染，因此不会产生二次闪烁。
     */
    async function init(): Promise<void> {
        if (initialized.value) return;
        setupMediaListener();
        try {
            const saved = (await storageManager.get(STORAGE_KEYS.LAYOUT_SETTINGS)) as Partial<LayoutSettings> | null;
            applySettings(saved);
            // 回填同步镜像：老版本没有这份镜像，或镜像被清掉过。
            // 不回填的话，这类用户每次打开新标签页都会再闪一次（永远等不到同步数据）。
            if (saved && typeof saved === 'object') {
                storageManager.writeSyncMirror(STORAGE_KEYS.LAYOUT_SETTINGS, buildSettings());
            }
            initialized.value = true;
        } catch (error) {
            console.error('[LayoutStore] 加载布局设置失败:', error);
        }
    }

    async function setColumns(value: number | 'auto'): Promise<void> {
        columns.value = value;
        await persist();
    }

    async function setPaginate(value: boolean): Promise<void> {
        paginate.value = value;
        await persist();
    }

    async function setPageSize(value: number): Promise<void> {
        if (value <= 0) return;
        pageSize.value = value;
        await persist();
    }

    async function setShowAllCategory(value: boolean): Promise<void> {
        showAllCategory.value = value;
        await persist();
    }

    async function setAllViewFlat(value: boolean): Promise<void> {
        allViewFlat.value = value;
        await persist();
    }

    async function setShowIconBackground(value: boolean): Promise<void> {
        showIconBackground.value = value;
        await persist();
    }

    async function setMinimalMode(value: boolean): Promise<void> {
        minimalMode.value = value;
        await persist();
    }

    async function setOpenMode(value: LinkOpenMode): Promise<void> {
        if (!isLinkOpenMode(value)) return;
        openMode.value = value;
        await persist();
    }

    return {
        columns,
        paginate,
        pageSize,
        showAllCategory,
        allViewFlat,
        showIconBackground,
        minimalMode,
        openMode,
        isMobile,
        initialized,
        init,
        setColumns,
        setPaginate,
        setPageSize,
        setShowAllCategory,
        setAllViewFlat,
        setShowIconBackground,
        setMinimalMode,
        setOpenMode,
    };
});
