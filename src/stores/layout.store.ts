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
import { STORAGE_KEYS, type LayoutSettings } from '@/types/storage';

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
    const initialized = ref(false);
    const isMobile = ref(false);

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

    async function persist(): Promise<void> {
        const settings: LayoutSettings = {
            columns: columns.value,
            paginate: paginate.value,
            pageSize: pageSize.value,
            showAllCategory: showAllCategory.value,
            allViewFlat: allViewFlat.value,
            showIconBackground: showIconBackground.value,
        };
        await storageManager.set(STORAGE_KEYS.LAYOUT_SETTINGS, settings);
    }

    /**
     * 加载布局设置（幂等）
     */
    async function init(): Promise<void> {
        if (initialized.value) return;
        setupMediaListener();
        try {
            const saved = (await storageManager.get(STORAGE_KEYS.LAYOUT_SETTINGS)) as Partial<LayoutSettings> | null;
            if (saved && typeof saved === 'object') {
                if (saved.columns === 'auto' || (typeof saved.columns === 'number' && saved.columns >= 1 && saved.columns <= 12)) {
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

    return {
        columns,
        paginate,
        pageSize,
        showAllCategory,
        allViewFlat,
        showIconBackground,
        isMobile,
        initialized,
        init,
        setColumns,
        setPaginate,
        setPageSize,
        setShowAllCategory,
        setAllViewFlat,
        setShowIconBackground,
    };
});
