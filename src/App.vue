<script setup lang="ts">
/**
 * App.vue - MugenNewTab 新标签页根组件
 *
 * 整合壁纸层、顶部栏、侧边栏、主内容区、浮动菜单、各类模态框、
 * 个性化面板、确认对话框与 Toast 容器，完成完整的页面集成。
 */
import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    watch,
} from 'vue';
import type { AppItem, Category } from '@/types/app';
import { useDataManager } from '@/composables/useDataManager';
import { useTheme } from '@/composables/useTheme';
import { provideConfirm, MntConfirmHost } from '@/composables/useConfirm';
import { useToast } from '@/composables/useToast';
import { useAppCardDrag, type AppCardDragCommit } from '@/composables/useAppCardDrag';
import { useLayoutStore } from '@/stores/layout.store';
import { storageManager } from '@/services/storage.service';
import { isJsonFile, readTextFile } from '@/utils/file.util';
import { STORAGE_KEYS } from '@/types/storage';

import WallpaperLayer from '@/components/layout/WallpaperLayer.vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import Sidebar from '@/components/layout/Sidebar.vue';
import MainContent from '@/components/layout/MainContent.vue';
import FabMenu from '@/components/layout/FabMenu.vue';
import SearchModal from '@/components/search/SearchModal.vue';
import AppEditModal from '@/components/appForm/AppEditModal.vue';
import CategoryEditModal from '@/components/category/CategoryEditModal.vue';
import CategoryManager from '@/components/category/CategoryManager.vue';
import UiLibPicker from '@/components/uiLib/UiLibPicker.vue';
import UiLibManager from '@/components/uiLib/UiLibManager.vue';
import PersonalizationPanel from '@/components/personalization/PersonalizationPanel.vue';
import ToastContainer from '@/components/common/ToastContainer.vue';
import CategorySection from '@/components/app/CategorySection.vue';
import AppGrid from '@/components/app/AppGrid.vue';
import AppCardDragGhost from '@/components/app/AppCardDragGhost.vue';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import CloudSyncPanel from '@/components/personalization/CloudSyncPanel.vue';
import IconSvg from '@/components/icon/IconSvg.vue';

// ==================== 初始化与全局能力 ====================
const dataManager = useDataManager({ autoInit: true });
useTheme({ autoInit: true });
const confirmManager = provideConfirm();
const toast = useToast();

// 卡片拖拽落下的统一提交入口
useAppCardDrag().onCommit((payload) => {
    void handleCardDragCommit(payload);
});

// ==================== 布局状态 ====================
const sidebarCollapsed = ref(false);
const mobileSidebarOpen = ref(false);
const personalizationOpen = ref(false);
const searchOpen = ref(false);

// ==================== 分类与应用状态 ====================
const activeCategoryId = ref<string>('all');
const showHiddenApps = ref(false);
const layoutStore = useLayoutStore();

// ==================== 模态框状态 ====================
const appEditOpen = ref(false);
const categoryEditOpen = ref(false);
const categoryManagerOpen = ref(false);
const uiLibPickerOpen = ref(false);
const uiLibManagerOpen = ref(false);
const cloudSyncOpen = ref(false);
const fabOpen = ref(false);

const editingApp = ref<AppItem | null>(null);
const editingCategory = ref<Category | undefined>(undefined);
const appEditInitialCategoryId = ref('');

const fileInputRef = ref<HTMLInputElement | null>(null);
const headerRef = ref<InstanceType<typeof AppHeader> | null>(null);
const headerWrapperRef = ref<HTMLDivElement | null>(null);

// ==================== 派生状态 ====================
const currentCategory = computed<Category | undefined>(() =>
    dataManager.getCategoryById(activeCategoryId.value)
);

const pageTitle = computed(() => currentCategory.value?.name ?? '全部应用');

/**
 * 获取分类下用于展示的应用列表。
 * 默认不显示隐藏站点；揭示模式（双击 Logo / Alt+Shift+H）下混入显示。
 */
function getDisplayApps(categoryId: string): AppItem[] {
    const apps = dataManager.getAppsByCategory(categoryId);
    return showHiddenApps.value ? apps : apps.filter((app) => !app.hidden);
}

const displayedApps = computed<AppItem[]>(() => {
    if (activeCategoryId.value === 'all') {
        return showHiddenApps.value ? dataManager.apps.value : dataManager.visibleApps.value;
    }
    return getDisplayApps(activeCategoryId.value);
});

const hasApps = computed(() => displayedApps.value.length > 0);

const categoriesWithVisibleApps = computed(() =>
    dataManager.userCategories.value.filter(
        (category) => getDisplayApps(category.id).length > 0
    )
);

/** 传给侧栏的分类列表（关闭「显示全部应用」时只按分类显示） */
const visibleCategories = computed(() => {
    if (layoutStore.showAllCategory) {
        return dataManager.categories.value;
    }
    return dataManager.categories.value.filter((category) => category.id !== 'all');
});

/**
 * 「全部应用」分类被隐藏时的当前分类兜底（切换到首个用户分类）
 */
function ensureActiveCategory(): void {
    if (layoutStore.showAllCategory || activeCategoryId.value !== 'all') return;
    const firstCategory = dataManager.userCategories.value[0];
    if (firstCategory) {
        activeCategoryId.value = firstCategory.id;
    }
}

watch(
    () => layoutStore.showAllCategory,
    () => {
        ensureActiveCategory();
    }
);

// ==================== 生命周期与持久化 ====================
let storageUnsubscribe: (() => void) | null = null;

async function loadSettings(): Promise<void> {
    try {
        const [collapsed, hidden] = await Promise.all([
            storageManager.get(STORAGE_KEYS.SIDEBAR_COLLAPSED),
            storageManager.get(STORAGE_KEYS.SHOW_HIDDEN_APPS),
        ]);
        sidebarCollapsed.value = !!collapsed;
        showHiddenApps.value = !!hidden;
    } catch (error) {
        console.error('[App] 加载设置失败:', error);
    }
}

async function saveSidebarCollapsed(value: boolean): Promise<void> {
    sidebarCollapsed.value = value;
    try {
        await storageManager.set(STORAGE_KEYS.SIDEBAR_COLLAPSED, value);
    } catch (error) {
        console.error('[App] 保存侧边栏状态失败:', error);
    }
}

async function saveShowHiddenApps(value: boolean): Promise<void> {
    showHiddenApps.value = value;
    try {
        await storageManager.set(STORAGE_KEYS.SHOW_HIDDEN_APPS, value);
    } catch (error) {
        console.error('[App] 保存隐藏站点状态失败:', error);
    }
}

onMounted(() => {
    loadSettings().catch((error) => {
        console.error('[App] 初始化设置失败:', error);
    });

    // 加载页面布局设置（列数 / 分页）
    useLayoutStore()
        .init()
        .catch((error) => {
            console.error('[App] 初始化布局设置失败:', error);
        });

    // 监听外部存储变更，同步侧边栏折叠与隐藏站点揭示状态（跨标签页/云同步）
    storageUnsubscribe = storageManager.subscribe((changes) => {
        const collapsedChange = changes[STORAGE_KEYS.SIDEBAR_COLLAPSED];
        if (collapsedChange && typeof collapsedChange.newValue === 'boolean') {
            sidebarCollapsed.value = collapsedChange.newValue;
        }
        const hiddenChange = changes[STORAGE_KEYS.SHOW_HIDDEN_APPS];
        if (hiddenChange && typeof hiddenChange.newValue === 'boolean') {
            showHiddenApps.value = hiddenChange.newValue;
        }
    });

    // 全局快捷键 Ctrl+K / Cmd+K 打开搜索
    document.addEventListener('keydown', handleGlobalKeydown);

    // 双击 Logo 切换隐藏站点视图
    headerWrapperRef.value?.addEventListener('dblclick', handleHeaderDblclick);
});

onUnmounted(() => {
    storageUnsubscribe?.();
    document.removeEventListener('keydown', handleGlobalKeydown);
    headerWrapperRef.value?.removeEventListener('dblclick', handleHeaderDblclick);
});

// ==================== 事件处理 ====================
function handleGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
        return;
    }
    // Alt+Shift+H：切换隐藏站点揭示模式（与双击 Logo 等效）
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        toggleHiddenApps();
    }
}

function handleHeaderDblclick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.brand')) {
        toggleHiddenApps();
    }
}

function toggleSidebar(): void {
    void saveSidebarCollapsed(!sidebarCollapsed.value);
}

function openMobileSidebar(): void {
    mobileSidebarOpen.value = true;
}

function closeMobileSidebar(): void {
    mobileSidebarOpen.value = false;
}

function togglePersonalization(): void {
    personalizationOpen.value = !personalizationOpen.value;
}

function openSearch(): void {
    searchOpen.value = true;
}

function toggleHiddenApps(): void {
    void saveShowHiddenApps(!showHiddenApps.value);
}

function handleSelectCategory(categoryId: string): void {
    activeCategoryId.value = categoryId;
    void saveShowHiddenApps(false);
    closeMobileSidebar();
}

function handleCategoryOrderChange(orderedIds: string[]): void {
    dataManager
        .updateCategoriesOrder(orderedIds)
        .then(() => {
            toast.success('分类排序已保存');
        })
        .catch((error) => {
            toast.error(error instanceof Error ? error.message : '分类排序失败');
        });
}

/**
 * 卡片拖拽落下后的统一提交（同分类排序 / 跨分类移动）
 */
async function handleCardDragCommit(payload: AppCardDragCommit): Promise<void> {
    const { appId, sourceCategoryId, targetCategoryId, orderedIds } = payload;
    try {
        if (sourceCategoryId !== targetCategoryId) {
            const updated = await dataManager.updateApp(appId, { category: targetCategoryId });
            if (!updated) {
                throw new Error('应用不存在');
            }
        }

        if (targetCategoryId === 'all') {
            // 「全部应用」平铺视图：直接按可见顺序全局重排，
            // 未出现的应用（如隐藏站点）保持相对顺序跟在后面
            const currentIds = dataManager.apps.value.map((app) => app.id);
            if (orderedIds.join('\0') !== currentIds.join('\0')) {
                await dataManager.updateAppsOrder(orderedIds);
            }
            toast.success('应用排序已保存');
            return;
        }

        // 与原项目一致：把目标分类的可见顺序合并回全局顺序，
        // 未出现在列表中的应用（如未显示的隐藏站点）保持原相对位置
        const orderedSet = new Set(orderedIds);
        let cursor = 0;
        const mergedIds = dataManager.apps.value.map((app) => {
            if (app.category !== targetCategoryId || !orderedSet.has(app.id)) {
                return app.id;
            }
            return orderedIds[cursor++];
        });

        const currentIds = dataManager.apps.value.map((app) => app.id);
        if (mergedIds.join('\0') !== currentIds.join('\0')) {
            await dataManager.updateAppsOrder(mergedIds);
        }

        toast.success(sourceCategoryId !== targetCategoryId ? '应用已移动到新分类' : '应用排序已保存');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '拖拽排序失败');
    }
}

function handleAppClick(app: AppItem): void {
    if (!app.url) return;
    window.open(app.url, '_blank');
}

function openAddApp(categoryId?: string): void {
    editingApp.value = null;
    appEditInitialCategoryId.value = categoryId ?? activeCategoryId.value ?? '';
    if (appEditInitialCategoryId.value === 'all') {
        appEditInitialCategoryId.value = '';
    }
    appEditOpen.value = true;
}

function openEditApp(app: AppItem): void {
    editingApp.value = app;
    appEditOpen.value = true;
}

async function handleDeleteApp(app: AppItem): Promise<void> {
    const confirmed = await confirmManager.confirm(
        `确定要删除网站"${app.name}"吗？`,
        { isDanger: true, title: '删除网站' }
    );
    if (!confirmed) return;

    try {
        const deleted = await dataManager.deleteApp(app.id);
        if (!deleted) {
            throw new Error('网站不存在或已删除');
        }
        toast.success('网站已删除');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '删除失败');
    }
}

function openAddCategory(): void {
    editingCategory.value = undefined;
    categoryEditOpen.value = true;
}

function handleSavedCategory(category: Category): void {
    // 新建分类后可选中该分类
    if (!editingCategory.value) {
        activeCategoryId.value = category.id;
    }
}

function handleFabSelect(action: string): void {
    switch (action) {
        case 'add-app':
            openAddApp();
            break;
        case 'add-category':
            openAddCategory();
            break;
        case 'manage-categories':
            categoryManagerOpen.value = true;
            break;
        case 'ui-lib':
            uiLibPickerOpen.value = true;
            break;
        case 'cloud-sync':
            cloudSyncOpen.value = true;
            break;
        case 'export':
            void handleExport();
            break;
        case 'import':
            triggerImport();
            break;
    }
}

function handleCategoryManagerEdit(category: Category): void {
    categoryManagerOpen.value = false;
    nextTick(() => {
        editingCategory.value = category;
        categoryEditOpen.value = true;
    });
}

function handleCategoryManagerAdd(): void {
    categoryManagerOpen.value = false;
    nextTick(() => {
        editingCategory.value = undefined;
        categoryEditOpen.value = true;
    });
}

function handleUiLibPickerManage(): void {
    uiLibPickerOpen.value = false;
    nextTick(() => {
        uiLibManagerOpen.value = true;
    });
}

// ==================== 导入导出 ====================
async function handleExport(): Promise<void> {
    try {
        const backup = await dataManager.exportData();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mugen_newtab_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('数据已导出');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '导出失败');
    }
}

function triggerImport(): void {
    fileInputRef.value?.click();
}

async function handleImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!isJsonFile(file)) {
        toast.error('请选择 JSON 备份文件');
        return;
    }

    try {
        const text = await readTextFile(file);
        const backup = JSON.parse(text) as Record<string, unknown>;
        await dataManager.importData(backup);
        toast.success('数据已导入');
        if (layoutStore.showAllCategory) {
            activeCategoryId.value = 'all';
        } else {
            activeCategoryId.value = dataManager.userCategories.value[0]?.id ?? 'all';
        }
        void saveShowHiddenApps(false);
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '导入失败');
    }
}

// ==================== FAB 菜单配置 ====================
const fabItems = [
    { action: 'add-app', label: '添加网站', icon: 'plus' },
    { action: 'add-category', label: '添加分类', icon: 'folder' },
    { action: 'manage-categories', label: '管理分类', icon: 'setting' },
    { divider: true },
    { section: '数据' },
    { action: 'cloud-sync', label: '云同步', icon: 'cloud' },
    { action: 'ui-lib', label: '图标库', icon: 'picture' },
    { action: 'export', label: '导出数据', icon: 'download' },
    { action: 'import', label: '导入数据', icon: 'upload' },
];
</script>

<template>
    <div id="app-root" class="app-root">
        <WallpaperLayer />

        <div ref="headerWrapperRef" class="header-wrapper">
            <AppHeader
                ref="headerRef"
                :sidebar-collapsed="sidebarCollapsed"
                :is-personalization-open="personalizationOpen"
                @toggle-sidebar="toggleSidebar"
                @toggle-personalization="togglePersonalization"
                @menu-click="openMobileSidebar"
            />
        </div>

        <Sidebar
            :categories="visibleCategories"
            :active-category-id="activeCategoryId"
            :collapsed="sidebarCollapsed"
            :mobile-open="mobileSidebarOpen"
            @select-category="handleSelectCategory"
            @update:mobile-open="mobileSidebarOpen = $event"
            @open-search="openSearch"
            @order-change="handleCategoryOrderChange"
        />

        <MainContent :title="pageTitle" :collapsed="sidebarCollapsed">
            <template #header-extra>
                <button
                    v-if="activeCategoryId !== 'all'"
                    type="button"
                    class="content-action-btn"
                    @click="openAddApp(activeCategoryId)"
                >
                    <IconSvg name="plus" :size="16" />
                    添加网站
                </button>
            </template>

            <div v-if="dataManager.isLoading.value" class="app-loading">
                <IconSvg name="refresh" :size="32" />
                <p>数据加载中…</p>
            </div>

            <div v-else-if="!hasApps" class="app-empty">
                <IconSvg name="folder" :size="64" />
                <p>该分类下暂无应用</p>
                <button
                    type="button"
                    class="content-action-btn"
                    @click="openAddApp(activeCategoryId)"
                >
                    添加网站
                </button>
            </div>

            <template v-else-if="activeCategoryId === 'all' && layoutStore.allViewFlat">
                <AppGrid
                    :apps="displayedApps"
                    :category-id="'all'"
                    :draggable="true"
                    @app-click="handleAppClick"
                    @edit-app="openEditApp"
                    @delete-app="handleDeleteApp"
                />
            </template>

            <template v-else-if="activeCategoryId === 'all'">
                <CategorySection
                    v-for="(category, index) in categoriesWithVisibleApps"
                    :key="category.id"
                    :category="category"
                    :apps="getDisplayApps(category.id)"
                    :draggable="true"
                    :animation-delay="index * 0.05"
                    @app-click="handleAppClick"
                    @edit-app="openEditApp"
                    @delete-app="handleDeleteApp"
                />
            </template>

            <template v-else>
                <CategorySection
                    :category="currentCategory!"
                    :apps="displayedApps"
                    :show-title="false"
                    :draggable="true"
                    @app-click="handleAppClick"
                    @edit-app="openEditApp"
                    @delete-app="handleDeleteApp"
                />
            </template>
        </MainContent>

        <FabMenu
            :items="fabItems"
            :active="fabOpen"
            @update:active="fabOpen = $event"
            @select="handleFabSelect"
        />

        <SearchModal v-model="searchOpen" />

        <AppEditModal
            v-model="appEditOpen"
            :app="editingApp"
            :initial-category-id="appEditInitialCategoryId"
        />

        <CategoryEditModal
            v-model="categoryEditOpen"
            :category="editingCategory"
            @saved="handleSavedCategory"
        />

        <CategoryManager
            v-model="categoryManagerOpen"
            @edit="handleCategoryManagerEdit"
            @add="handleCategoryManagerAdd"
        />

        <UiLibPicker
            v-model="uiLibPickerOpen"
            @manage="handleUiLibPickerManage"
        />

        <UiLibManager v-model="uiLibManagerOpen" />

        <ModalOverlay v-model="cloudSyncOpen" title="云同步" :max-width="420" close-on-overlay>
            <CloudSyncPanel />
        </ModalOverlay>

        <PersonalizationPanel v-model="personalizationOpen" />

        <MntConfirmHost />
        <ToastContainer position="top-right" />

        <AppCardDragGhost />

        <input
            ref="fileInputRef"
            type="file"
            accept="application/json,.json"
            class="visually-hidden"
            @change="handleImportFile"
        />
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.app-root {
    min-height: 100vh;
    position: relative;
}

.content-action-btn {
    @include button-reset;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 20px;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    @include md-transition(all, var(--md-transition-fast));

    &:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    }

    :deep(.icon-svg) {
        filter: brightness(0) invert(1);
    }
}

.app-loading,
.app-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 80px 20px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
}

.app-loading :deep(.icon-svg) {
    animation: spin 1s linear infinite;
}

// 卡片拖拽期间禁止文本选择并显示抓取光标
:global(body.is-dragging-cards) {
    user-select: none;
    cursor: grabbing;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>
