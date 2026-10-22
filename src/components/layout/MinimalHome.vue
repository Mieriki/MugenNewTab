<script setup lang="ts">
/**
 * MinimalHome - 极简约模式首页
 *
 * 对齐浏览器默认新标签页的形态：页面正中一个大号搜索框，下方是若干行站点磁贴。
 * 不渲染顶栏 / 侧边栏 / 分类标题 / 浮动按钮，只保留「找站点」和「去站点」两件事。
 *
 * 交互：
 * - 搜索框自动聚焦，输入即联想（复用 useSearch 与 SearchSuggestions）
 * - Enter 搜索 / 选中高亮建议，↑↓ 切换建议，Esc 清空
 * - 磁贴 hover 浮起并露出「更多」按钮，点击打开站点
 * - 磁贴右键 / 触屏长按 / 更多按钮 / ContextMenu 键 → 站点操作菜单
 *   （打开、复制链接、编辑、移动到分类、隐藏、删除）
 * - 磁贴可直接拖拽排序，仅在当前分类范围内生效
 * - 分类切换用一行极轻的胶囊标签承载，超过 16 个站点时可展开全部
 * - 右下角悬停控制区提供：添加站点 / 完整搜索 / 云同步 / 个性化 / 显示隐藏站点 / 退出极简
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { AppItem } from '@/types/app';
import { useDataManager } from '@/composables/useDataManager';
import { useSearch } from '@/composables/useSearch';
import { useToast } from '@/composables/useToast';
import { isImageIcon } from '@/utils/image.util';
import IconSvg from '@/components/icon/IconSvg.vue';
import SearchSuggestions from '@/components/search/SearchSuggestions.vue';
import EngineSelector from '@/components/search/EngineSelector.vue';
import MinimalSiteMenu from '@/components/layout/MinimalSiteMenu.vue';

/** 首屏磁贴数量（超出后需手动展开） */
const TILE_LIMIT = 16;

/** 触屏长按打开菜单的等待时长（毫秒） */
const LONG_PRESS_DURATION = 480;

/** 长按弹出菜单后，抑制随后的 click 事件的时长（毫秒） */
const CLICK_SUPPRESS_DURATION = 700;

export interface MinimalHomeProps {
    /** 是否显示隐藏站点（与完整模式的揭示模式共享同一状态） */
    showHidden?: boolean;
}

const props = withDefaults(defineProps<MinimalHomeProps>(), {
    showHidden: false
});

const emit = defineEmits<{
    /** 打开个性化面板 */
    (e: 'open-personalization'): void;
    /** 添加站点 */
    (e: 'add-app'): void;
    /** 编辑站点 */
    (e: 'edit-app', app: AppItem): void;
    /** 删除站点（由外层弹确认框） */
    (e: 'delete-app', app: AppItem): void;
    /** 切换隐藏站点揭示模式 */
    (e: 'toggle-hidden-reveal'): void;
    /** 打开完整搜索（历史 / 引擎切换） */
    (e: 'open-full-search'): void;
    /** 打开云同步面板 */
    (e: 'open-cloud-sync'): void;
    /** 退出极简约模式 */
    (e: 'exit-minimal'): void;
}>();

const dataManager = useDataManager({ autoInit: true });
const toast = useToast();

const activeCategoryId = ref('all');
const showAll = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);

/** 当前打开操作菜单的站点（null 表示菜单关闭） */
const menuApp = ref<AppItem | null>(null);
const menuPoint = ref({ x: 0, y: 0 });

/** 正在拖拽的站点 id */
const dragId = ref<string | null>(null);
/** 拖拽经过的目标索引 */
const dropIndex = ref<number | null>(null);

/** 长按计时器 */
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
/** 该时间戳之前忽略磁贴 click（长按菜单弹出后手指抬起会触发一次 click） */
let suppressClickUntil = 0;

const {
    query,
    engines,
    currentEngineIndex,
    suggestions,
    activeSuggestionIndex,
    isLoadingSuggestions,
    hasSuggestions,
    canSearch,
    currentEngine,
    executeSearch,
    executeSearchWithSuggestion,
    clearSuggestions,
    moveSuggestionDown,
    moveSuggestionUp,
    selectActiveSuggestion,
    selectEngine
} = useSearch({ debounceMs: 180, maxSuggestions: 8, maxLocalSuggestions: 4 });

// ==================== 数据 ====================

const categories = computed(() => dataManager.categories.value);

/** 可移动到的分类（不含「全部」虚拟分类） */
const userCategories = computed(() => dataManager.userCategories.value);

/** 当前分类下的站点；未开启揭示模式时过滤掉隐藏站点 */
const scopedApps = computed<AppItem[]>(() => {
    const source =
        activeCategoryId.value === 'all'
            ? dataManager.apps.value
            : dataManager.getAppsByCategory(activeCategoryId.value);
    return props.showHidden ? source : source.filter((app) => !app.hidden);
});

const hiddenCount = computed(
    () =>
        (activeCategoryId.value === 'all'
            ? dataManager.apps.value
            : dataManager.getAppsByCategory(activeCategoryId.value)
        ).filter((app) => app.hidden).length
);

const tiles = computed<AppItem[]>(() =>
    showAll.value ? scopedApps.value : scopedApps.value.slice(0, TILE_LIMIT)
);

const hasMore = computed(() => scopedApps.value.length > TILE_LIMIT);

const isEmpty = computed(() => !dataManager.isLoading.value && scopedApps.value.length === 0);

/** 占位文案跟随当前搜索引擎，句式对齐浏览器原生新标签页 */
const searchPlaceholder = computed(
    () => `在 ${currentEngine.value?.name ?? '网页'} 中搜索，或输入网址`
);

// ==================== 搜索 ====================

function focusInput(): void {
    nextTick(() => {
        inputEl.value?.focus();
        inputEl.value?.select();
    });
}

async function submitSearch(rawQuery?: string): Promise<void> {
    await executeSearch(rawQuery);
}

/**
 * 切换搜索引擎。
 *
 * 复用 EngineSelector 的 select 事件，落到 useSearch → search.store.selectEngine，
 * 与完整搜索弹窗（SearchModal）共用同一份 Pinia 状态与持久化键，
 * 因此在任一入口切换都会立刻同步到另一处。
 */
async function handleEngineSelect(payload: { index: number }): Promise<void> {
    await selectEngine(payload.index);
    // 切换后把焦点交还输入框，方便直接打字
    focusInput();
}

function handleInputKeydown(event: KeyboardEvent): void {
    switch (event.key) {
        case 'ArrowDown':
            if (hasSuggestions.value) {
                event.preventDefault();
                moveSuggestionDown();
            }
            break;
        case 'ArrowUp':
            if (hasSuggestions.value) {
                event.preventDefault();
                moveSuggestionUp();
            }
            break;
        case 'Enter': {
            event.preventDefault();
            if (activeSuggestionIndex.value >= 0 && suggestions.value[activeSuggestionIndex.value]) {
                const selected = selectActiveSuggestion();
                if (selected) {
                    void executeSearchWithSuggestion(selected);
                    return;
                }
            }
            if (canSearch.value) {
                void submitSearch();
            }
            break;
        }
        case 'Escape':
            if (query.value) {
                event.preventDefault();
                query.value = '';
                clearSuggestions();
            }
            break;
    }
}

/** 点击输入框以外区域时收起建议 */
function handlePagePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.minimal-search')) {
        return;
    }
    clearSuggestions();
}

// ==================== 磁贴 ====================

function handleTileClick(app: AppItem): void {
    // 长按刚弹出菜单时，手指抬起会补发一次 click，这里直接吞掉
    if (Date.now() < suppressClickUntil) return;
    if (!app.url) return;
    window.open(app.url, '_blank');
}

function iconIsMonochrome(app: AppItem): boolean {
    const icon = app.icon?.trim();
    return !!icon && !isImageIcon(icon);
}

function toggleShowAll(): void {
    showAll.value = !showAll.value;
}

// ==================== 站点操作菜单 ====================

function openMenu(app: AppItem, point: { clientX: number; clientY: number }): void {
    clearLongPress();
    menuApp.value = app;
    menuPoint.value = { x: point.clientX, y: point.clientY };
}

function closeMenu(): void {
    menuApp.value = null;
}

/** 「更多」按钮：把菜单挂在按钮右下角 */
function openMenuFromButton(app: AppItem, event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    openMenu(app, {
        clientX: rect ? rect.left + rect.width : 0,
        clientY: rect ? rect.bottom + 4 : 0
    });
}

/** 键盘打开菜单（ContextMenu 键 / Shift+F10），锚定在磁贴中心 */
function handleTileKeydown(app: AppItem, event: KeyboardEvent): void {
    const isMenuKey =
        event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
    if (!isMenuKey) return;

    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    openMenu(app, {
        clientX: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        clientY: rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    });
}

function clearLongPress(): void {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

/** 触屏长按打开菜单；鼠标交给 contextmenu 事件 */
function handleTilePointerDown(app: AppItem, event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;

    clearLongPress();
    const { clientX, clientY } = event;
    longPressTimer = setTimeout(() => {
        longPressTimer = null;
        suppressClickUntil = Date.now() + CLICK_SUPPRESS_DURATION;
        openMenu(app, { clientX, clientY });
    }, LONG_PRESS_DURATION);
}

function handleMenuOpen(): void {
    const app = menuApp.value;
    closeMenu();
    if (!app?.url) return;
    window.open(app.url, '_blank');
}

async function handleMenuCopyLink(): Promise<void> {
    const app = menuApp.value;
    closeMenu();
    if (!app) return;

    try {
        await navigator.clipboard?.writeText(app.url);
        toast.success('链接已复制');
        return;
    } catch {
        // 剪贴板 API 不可用（未聚焦 / 无权限）时退回临时 textarea 方案
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = app.url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('execCommand failed');
        toast.success('链接已复制');
    } catch {
        toast.error('复制失败，请手动复制链接');
    }
}

function handleMenuEdit(): void {
    const app = menuApp.value;
    closeMenu();
    if (app) emit('edit-app', app);
}

function handleMenuDelete(): void {
    const app = menuApp.value;
    closeMenu();
    if (app) emit('delete-app', app);
}

async function handleMenuToggleHidden(): Promise<void> {
    const app = menuApp.value;
    closeMenu();
    if (!app) return;

    try {
        await dataManager.updateApp(app.id, { hidden: !app.hidden });
        toast.success(app.hidden ? `已取消隐藏「${app.name}」` : `已隐藏「${app.name}」`);
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '操作失败');
    }
}

async function handleMenuMove(categoryId: string): Promise<void> {
    const app = menuApp.value;
    closeMenu();
    if (!app || app.category === categoryId) return;

    try {
        await dataManager.updateApp(app.id, { category: categoryId });
        const target = dataManager.getCategoryById(categoryId);
        toast.success(`已移动到「${target?.name ?? '新分类'}」`);
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '移动失败');
    }
}

// ==================== 拖拽排序 ====================

function handleDragStart(app: AppItem, event: DragEvent): void {
    closeMenu();
    clearLongPress();
    dragId.value = app.id;
    dropIndex.value = null;

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        // Firefox 必须写入数据才会真正开始拖拽
        event.dataTransfer.setData('text/plain', app.id);
    }
}

function handleDragOver(index: number): void {
    if (!dragId.value) return;
    dropIndex.value = index;
}

function handleDragEnd(): void {
    dragId.value = null;
    dropIndex.value = null;
}

/**
 * 把当前分类的展示顺序写回全局顺序。
 *
 * 全局 apps 是跨分类混排的，直接整体重排会把其他分类的位置也打乱，
 * 因此只替换「属于当前展示范围」的那些槽位。
 */
async function applyScopedOrder(orderedIds: string[]): Promise<void> {
    const scopedIds = new Set(scopedApps.value.map((app) => app.id));
    const nextIds = dataManager.apps.value.map((app) => app.id);
    const slots: number[] = [];

    dataManager.apps.value.forEach((app, index) => {
        if (scopedIds.has(app.id)) slots.push(index);
    });

    if (slots.length !== orderedIds.length) return;

    slots.forEach((slot, index) => {
        nextIds[slot] = orderedIds[index];
    });

    // 顺序没变就不写盘，避免每次拖动都触发一次存储更新
    const currentIds = dataManager.apps.value.map((app) => app.id);
    if (nextIds.join('\u0000') === currentIds.join('\u0000')) return;

    await dataManager.updateAppsOrder(nextIds);
}

async function handleDrop(index: number): Promise<void> {
    const id = dragId.value;
    const target = tiles.value[index];
    dragId.value = null;
    dropIndex.value = null;

    if (!id || !target || target.id === id) return;

    const visibleIds = tiles.value
        .map((app) => app.id)
        .filter((itemId) => itemId !== id);
    const insertAt = visibleIds.indexOf(target.id);
    if (insertAt === -1) return;
    visibleIds.splice(insertAt, 0, id);

    // 超出首屏的站点保持原相对顺序，排在可见项之后
    const rest = scopedApps.value
        .map((app) => app.id)
        .filter((itemId) => !visibleIds.includes(itemId));

    try {
        await applyScopedOrder([...visibleIds, ...rest]);
        toast.success('排序已保存');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '排序失败');
    }
}

// ==================== 生命周期 ====================

onMounted(() => {
    // 首屏自动聚焦，模拟浏览器默认新标签页「打开即可打字」
    window.setTimeout(focusInput, 80);
});

onUnmounted(() => {
    clearLongPress();
});

// 切换分类后收起展开态，避免停留在超长列表；菜单锚定的站点可能已不在当前视图
watch(activeCategoryId, () => {
    showAll.value = false;
    closeMenu();
});

defineExpose({ focusInput });
</script>

<template>
    <div ref="rootEl" class="minimal-home" @pointerdown="handlePagePointerDown">
        <div class="minimal-home__inner">
            <!-- ============ 居中搜索框 ============ -->
            <div class="minimal-search">
                <div class="minimal-search__box">
                    <EngineSelector
                        class="minimal-search__engine-selector"
                        :engines="engines"
                        :model-value="currentEngineIndex"
                        @select="handleEngineSelect"
                    />

                    <span class="minimal-search__divider" aria-hidden="true" />

                    <input
                        ref="inputEl"
                        v-model="query"
                        class="minimal-search__input"
                        type="text"
                        :placeholder="searchPlaceholder"
                        autocomplete="off"
                        spellcheck="false"
                        aria-label="搜索"
                        @keydown="handleInputKeydown"
                    />

                    <button
                        type="button"
                        class="minimal-search__submit"
                        title="搜索"
                        :disabled="!canSearch"
                        @click="submitSearch()"
                    >
                        <IconSvg name="search" :size="18" monochrome alt="" />
                    </button>
                </div>

                <div v-show="hasSuggestions || isLoadingSuggestions" class="minimal-search__panel">
                    <SearchSuggestions
                        :suggestions="suggestions"
                        :active-index="activeSuggestionIndex"
                        :loading="isLoadingSuggestions"
                        :visible="hasSuggestions"
                        :query="query"
                        @select="executeSearchWithSuggestion"
                    />
                </div>
            </div>

            <!-- ============ 分类胶囊 ============ -->
            <nav v-if="categories.length > 1" class="minimal-chips" aria-label="分类">
                <button
                    v-for="category in categories"
                    :key="category.id"
                    type="button"
                    class="minimal-chips__item"
                    :class="{ active: category.id === activeCategoryId }"
                    @click="activeCategoryId = category.id"
                >
                    {{ category.name }}
                </button>
            </nav>

            <!-- ============ 站点磁贴 ============ -->
            <section v-if="tiles.length > 0" class="minimal-tiles" aria-label="常用站点">
                <button
                    v-for="(app, index) in tiles"
                    :key="app.id"
                    type="button"
                    class="minimal-tile"
                    :class="{
                        'is-hidden': app.hidden,
                        'is-dragging': dragId === app.id,
                        'is-drop-target': dropIndex === index && !!dragId && dragId !== app.id,
                    }"
                    :data-app-id="app.id"
                    :title="app.description || app.name"
                    draggable="true"
                    @click="handleTileClick(app)"
                    @contextmenu.prevent="openMenu(app, $event)"
                    @keydown="handleTileKeydown(app, $event)"
                    @pointerdown="handleTilePointerDown(app, $event)"
                    @pointerup="clearLongPress"
                    @pointercancel="clearLongPress"
                    @pointerleave="clearLongPress"
                    @dragstart="handleDragStart(app, $event)"
                    @dragover.prevent="handleDragOver(index)"
                    @drop.prevent="handleDrop(index)"
                    @dragend="handleDragEnd"
                >
                    <span class="minimal-tile__icon">
                        <IconSvg
                            :src="app.icon"
                            name="site"
                            fallback="site"
                            :size="40"
                            :monochrome="iconIsMonochrome(app)"
                            :alt="app.name"
                        />
                    </span>
                    <span class="minimal-tile__name">{{ app.name }}</span>

                    <span
                        class="minimal-tile__more"
                        role="button"
                        tabindex="-1"
                        title="更多操作"
                        @click.stop="openMenuFromButton(app, $event)"
                    >
                        <IconSvg name="more" :size="14" monochrome alt="" />
                    </span>
                </button>
            </section>

            <p v-else-if="dataManager.isLoading.value" class="minimal-hint">加载中…</p>
            <p v-else-if="isEmpty && hiddenCount > 0 && !showHidden" class="minimal-hint">
                当前分类下的 {{ hiddenCount }} 个站点都已隐藏
                <button type="button" class="minimal-hint__link" @click="emit('toggle-hidden-reveal')">
                    显示它们
                </button>
            </p>
            <p v-else-if="isEmpty" class="minimal-hint">
                当前分类下还没有站点
                <button type="button" class="minimal-hint__link" @click="emit('add-app')">添加一个</button>
            </p>

            <button v-if="hasMore" type="button" class="minimal-more" @click="toggleShowAll">
                <IconSvg :name="showAll ? 'Fold' : 'arrow-down'" :size="14" monochrome alt="" />
                <span>{{ showAll ? '收起' : `显示全部 ${scopedApps.length} 个` }}</span>
            </button>
        </div>

        <!-- ============ 右上角控制区：默认收成一个设置按钮，悬停向左展开 ============ -->
        <div class="minimal-controls">
            <div class="minimal-controls__actions">
                <button type="button" class="minimal-controls__btn" title="添加站点" @click="emit('add-app')">
                    <IconSvg name="plus" :size="18" monochrome alt="" />
                </button>
                <button type="button" class="minimal-controls__btn" title="完整搜索与历史" @click="emit('open-full-search')">
                    <IconSvg name="search" :size="18" monochrome alt="" />
                </button>
                <button type="button" class="minimal-controls__btn" title="云同步" @click="emit('open-cloud-sync')">
                    <IconSvg name="cloud" :size="18" monochrome alt="" />
                </button>
                <button
                    type="button"
                    class="minimal-controls__btn"
                    :class="{ 'is-active': showHidden }"
                    :title="showHidden ? '恢复隐藏站点 (Alt+Shift+H)' : '显示隐藏站点 (Alt+Shift+H)'"
                    :aria-pressed="showHidden"
                    @click="emit('toggle-hidden-reveal')"
                >
                    <IconSvg :name="showHidden ? 'eye' : 'eye-off'" :size="18" monochrome alt="" />
                </button>
                <button type="button" class="minimal-controls__btn" title="个性化设置" @click="emit('open-personalization')">
                    <IconSvg name="palette" :size="18" monochrome alt="" />
                </button>
                <button type="button" class="minimal-controls__btn" title="退出极简约模式 (Alt+Shift+M)" @click="emit('exit-minimal')">
                    <IconSvg name="Expand" :size="18" monochrome alt="" />
                </button>
            </div>

            <button
                type="button"
                class="minimal-controls__trigger"
                title="更多操作"
                aria-label="更多操作"
            >
                <IconSvg name="setting" :size="18" monochrome alt="" />
            </button>
        </div>

        <!-- ============ 站点操作菜单（右键 / 长按 / 更多按钮触发） ============ -->
        <MinimalSiteMenu
            v-if="menuApp"
            :app="menuApp"
            :categories="userCategories"
            :x="menuPoint.x"
            :y="menuPoint.y"
            @close="closeMenu"
            @open="handleMenuOpen"
            @copy-link="handleMenuCopyLink"
            @edit="handleMenuEdit"
            @delete="handleMenuDelete"
            @toggle-hidden="handleMenuToggleHidden"
            @move="handleMenuMove"
        />
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.minimal-home {
    position: relative;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    padding: 14vh 24px 96px;
}

.minimal-home__inner {
    width: 100%;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

// ==================== 搜索框 ====================
.minimal-search {
    position: relative;
    z-index: 30; // 高于磁贴行，确保引擎下拉 / 搜索建议向下展开时盖住磁贴而非被磁贴盖住
    width: 100%;
    max-width: 580px;
}

.minimal-search__box {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    padding: 0 10px 0 8px;
    border-radius: 26px;
    background: rgba(var(--md-sys-color-surface-rgb), 0.9);
    border: 1px solid var(--md-sys-color-outline-variant);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.05);
    backdrop-filter: blur(12px);
    @include md-transition(all, var(--md-transition-fast));

    &:focus-within {
        background: rgba(var(--md-sys-color-surface-rgb), 0.98);
        border-color: var(--md-sys-color-primary);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
}

// 左侧搜索引擎选择器（复用 EngineSelector，与完整搜索弹窗共享同一份 store 状态）
.minimal-search__engine-selector {
    :deep(.engine-selector__trigger) {
        padding: 6px 8px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface-variant);

        &:hover:not(:disabled) {
            background: var(--md-sys-color-surface-variant);
            color: var(--md-sys-color-primary);
        }
    }

    :deep(.engine-selector__name) {
        max-width: 88px;
    }

    :deep(.engine-selector__dropdown) {
        top: calc(100% + 16px);
        left: 0;
        min-width: 190px;
    }
}

.minimal-search__divider {
    flex-shrink: 0;
    width: 1px;
    height: 20px;
    background: var(--md-sys-color-outline-variant);
    opacity: 0.8;
}

// 右侧搜索按钮（与浏览器原生新标签页一致：放大镜在右）
.minimal-search__submit {
    @include button-reset;
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.75;
    @include md-transition(all, var(--md-transition-fast));

    &:hover:not(:disabled) {
        opacity: 1;
        color: var(--md-sys-color-primary);
        background: var(--md-sys-color-primary-container);
    }

    &:disabled {
        opacity: 0.3;
        cursor: default;
    }
}

.minimal-search__input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 16px;
    color: var(--md-sys-color-on-surface);

    &::placeholder {
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.6;
    }
}

.minimal-search__panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    padding: 6px;
    border-radius: 20px;
    background: rgba(var(--md-sys-color-surface-rgb), 0.98);
    border: 1px solid var(--md-sys-color-outline-variant);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(16px);
    z-index: 20;
}

// ==================== 分类胶囊 ====================
.minimal-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 22px;
}

.minimal-chips__item {
    @include button-reset;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.55;
    @include md-transition(all, var(--md-transition-fast));

    &:hover {
        opacity: 0.9;
        background: var(--md-sys-color-surface-variant);
    }

    &.active {
        opacity: 1;
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-primary);
        font-weight: 600;
    }
}

// ==================== 站点磁贴 ====================
.minimal-tiles {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 8px;
    margin-top: 28px;
    width: 100%;
}

.minimal-tile {
    @include button-reset;
    position: relative;
    width: 88px;
    padding: 12px 4px 10px;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    @include md-transition(all, var(--md-transition-fast));
    @include focus-ring;

    &:hover {
        background: var(--md-sys-color-primary-container);

        .minimal-tile__more {
            opacity: 1;
        }
    }

    // 揭示模式下的隐藏站点：虚线 + 半透明，与完整模式保持一致
    &.is-hidden {
        opacity: 0.55;

        .minimal-tile__icon {
            border: 1px dashed var(--md-sys-color-outline-variant);
        }
    }

    // 拖拽中：原地留一个淡出占位，避免布局跳动
    &.is-dragging {
        opacity: 0.35;
    }

    // 拖拽经过的目标：左侧插入指示线
    &.is-drop-target::before {
        content: '';
        position: absolute;
        left: 0;
        top: 10%;
        bottom: 10%;
        width: 2px;
        border-radius: 2px;
        background: var(--md-sys-color-primary);
    }
}

.minimal-tile__icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 5%, transparent);
}

.minimal-tile__name {
    max-width: 100%;
    font-size: 12px;
    line-height: 1.3;
    color: var(--md-sys-color-on-surface);
    text-align: center;
    @include line-clamp(2);
}

.minimal-tile__more {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--md-sys-color-surface-rgb), 0.95);
    border: 1px solid var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0;
    @include md-transition(opacity, var(--md-transition-fast));

    &:hover {
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        border-color: transparent;
    }
}

// ==================== 辅助文案 ====================
.minimal-hint {
    margin: 28px 0 0;
    font-size: 13px;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.6;
}

.minimal-hint__link {
    @include button-reset;
    color: var(--md-sys-color-primary);
    text-decoration: underline;
    margin-left: 4px;
}

.minimal-more {
    @include button-reset;
    margin-top: 24px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.6;
    @include md-transition(all, var(--md-transition-fast));

    &:hover {
        opacity: 1;
        background: var(--md-sys-color-surface-variant);
    }
}

// ==================== 右下角控制区（默认收成一个按钮，悬停展开） ====================
// 放右下角而不是右上角：Toast 固定在右上角，站点操作后的提示会盖住控制区
.minimal-controls {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    padding: 6px;
    border-radius: 999px;
    background: rgba(var(--md-sys-color-surface-rgb), 0.85);
    border: 1px solid var(--md-sys-color-outline-variant);
    backdrop-filter: blur(12px);
    // 默认灰暗隐藏
    opacity: 0.25;
    @include md-transition(opacity, var(--md-transition-fast));

    &:hover,
    &:focus-within {
        opacity: 1;
    }
}

// 折叠态：宽度收为 0，悬停时向左展开
.minimal-controls__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 0;
    margin-right: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    @include md-transition(all, var(--md-transition-fast));
}

.minimal-controls:hover .minimal-controls__actions,
.minimal-controls:focus-within .minimal-controls__actions {
    max-width: 300px;
    margin-right: 6px;
    opacity: 1;
    pointer-events: auto;
}

.minimal-controls__btn,
.minimal-controls__trigger {
    @include button-reset;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--md-sys-color-on-surface-variant);
    @include md-transition(all, var(--md-transition-fast));

    &:hover {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-primary);
    }

    // 揭示模式开启时高亮，避免用户忘了自己还开着
    &.is-active {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-primary);
    }
}

// 触发器：始终可见，作为展开的锚点
.minimal-controls__trigger {
    cursor: default;
}

@include respond-to(mobile) {
    // 触屏没有 hover，直接常驻展开，隐藏锚点按钮
    .minimal-controls__actions {
        max-width: 300px;
        margin-right: 0;
        opacity: 1;
        pointer-events: auto;
    }

    .minimal-controls__trigger {
        display: none;
    }

    .minimal-home {
        padding: 10vh 16px 80px;
    }

    .minimal-search__box {
        height: 48px;
        padding: 0 14px;
    }

    .minimal-tile {
        width: 76px;
    }
}
</style>