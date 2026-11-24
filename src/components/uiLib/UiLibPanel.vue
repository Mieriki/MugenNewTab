<!--
  UiLibPanel - 设置中心的「图标库」栏目
  集浏览、搜索与分类/图标管理于一体（替代原 UiLibPicker + UiLibManager 两层弹窗）。
  系统数据仅可查看，用户分类与图标支持删除；点击图标卡片可预览大图。

  自身不再承载弹窗外壳：由 SettingsCenter 作为栏目内容渲染。
  「图标预览」仍是独立浮层，那是真正的模态查看，保留 ModalOverlay。
-->
<template>
    <div class="ui-lib-panel">
            <div class="ui-lib-panel__search">
                <BaseInput
                    v-model="searchKeyword"
                    placeholder="搜索图标…"
                    autocomplete="off"
                >
                    <template #prefix>
                        <IconSvg name="search" :size="16" />
                    </template>
                </BaseInput>
            </div>

            <div v-if="store.isLoading" class="ui-lib-panel__state">
                <IconSvg name="refresh" :size="28" />
                <p>图标库加载中…</p>
            </div>

            <template v-else>
                <div class="ui-lib-panel__tabs" role="tablist">
                    <button
                        v-for="cat in categories"
                        :key="cat.id"
                        type="button"
                        class="ui-lib-panel__tab"
                        :class="{ 'is-active': activeCategoryId === cat.id }"
                        role="tab"
                        :aria-selected="activeCategoryId === cat.id"
                        @click="activeCategoryId = cat.id"
                    >
                        {{ cat.name }}
                        <span class="ui-lib-panel__tab-count">{{ countByCategory[cat.id] || 0 }}</span>
                        <span
                            v-if="!isSystemCategory(cat.id) && activeCategoryId === cat.id"
                            class="ui-lib-panel__tab-delete"
                            role="button"
                            aria-label="删除分类"
                            @click.stop="deleteCategory(cat.id, cat.name)"
                        >
                            <IconSvg name="close" :size="12" />
                        </span>
                    </button>

                    <button
                        v-if="!addingCategory"
                        type="button"
                        class="ui-lib-panel__tab-add"
                        aria-label="新建分类"
                        title="新建分类"
                        @click="startAddCategory"
                    >
                        <IconSvg name="plus" :size="16" />
                    </button>
                    <input
                        v-else
                        ref="categoryInputRef"
                        v-model="newCategoryName"
                        type="text"
                        class="ui-lib-panel__tab-input"
                        placeholder="分类名称"
                        aria-label="新分类名称"
                        @keydown.enter="addCategory"
                        @keydown.esc="cancelAddCategory"
                        @blur="cancelAddCategory"
                    />
                </div>

                <div class="ui-lib-panel__content" role="tabpanel">
                    <div v-if="visibleItems.length === 0" class="ui-lib-panel__state">
                        <IconSvg name="picture" :size="36" />
                        <p>{{ emptyText }}</p>
                    </div>

                    <div v-else class="ui-lib-panel__grid">
                        <button
                            v-for="item in visibleItems"
                            :key="item.id"
                            type="button"
                            class="ui-lib-panel__item"
                            :title="item.name"
                            @click="previewItem(item)"
                        >
                            <span
                                v-if="!item.isSystem"
                                class="ui-lib-panel__item-delete"
                                role="button"
                                aria-label="删除图标"
                                @click.stop="deleteItem(item.id, item.name)"
                            >
                                <IconSvg name="close" :size="12" />
                            </span>
                            <span class="ui-lib-panel__icon">
                                <IconSvg :src="item.url" :size="26" :alt="item.name" />
                            </span>
                            <span class="ui-lib-panel__item-name">{{ item.name }}</span>
                        </button>
                    </div>

                    <div v-if="addingItem" class="ui-lib-panel__item-form">
                        <BaseInput
                            v-model="itemName"
                            label="图标名称"
                            placeholder="例如：Vue"
                        />
                        <BaseInput
                            v-model="itemUrl"
                            type="url"
                            label="图标 URL"
                            placeholder="https://.../logo.svg"
                            hint="支持网络地址或本地路径，不支持 data URL"
                        />
                        <div class="ui-lib-panel__form-group">
                            <label class="ui-lib-panel__label" for="ui-lib-panel-item-category">所属分类</label>
                            <select
                                id="ui-lib-panel-item-category"
                                v-model="itemCategory"
                                class="ui-lib-panel__select"
                            >
                                <option value="" disabled>请选择分类</option>
                                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                                    {{ cat.name }}
                                </option>
                            </select>
                        </div>
                        <div class="ui-lib-panel__form-actions">
                            <BaseButton variant="text" size="small" @click="cancelAddItem">取消</BaseButton>
                            <BaseButton
                                variant="primary"
                                size="small"
                                :loading="isAddingItem"
                                @click="addItem"
                            >
                                添加图标
                            </BaseButton>
                        </div>
                    </div>
                    <button
                        v-else
                        type="button"
                        class="ui-lib-panel__add-row"
                        @click="startAddItem"
                    >
                        <IconSvg name="plus" :size="18" />
                        <span>添加图标</span>
                    </button>
                </div>
            </template>
        </div>

        <div class="ui-lib-panel__footer-total">
            共 {{ categories.length }} 个分类 · {{ items.length }} 个图标
        </div>

    <ModalOverlay
        v-model="previewVisible"
        title="图标预览"
        max-width="400"
        :z-index="2200"
    >
        <div v-if="previewTarget" class="ui-lib-panel__preview">
            <div class="ui-lib-panel__preview-box">
                <IconSvg :src="previewTarget.url" :size="64" :alt="previewTarget.name" />
            </div>
            <div class="ui-lib-panel__preview-name">{{ previewTarget.name }}</div>
            <div class="ui-lib-panel__preview-desc">
                {{ getCategoryName(previewTarget.category) }}
                <template v-if="previewTarget.isSystem"> · 系统图标</template>
            </div>
        </div>
    </ModalOverlay>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import { useUiLibStore } from '@/stores/uiLib.store';
import { useConfirm } from '@/composables/useConfirm';
import { useToast } from '@/composables/useToast';
import type { UiItem } from '@/types/ui';

/** 组件不再需要 props / 与弹窗相关的 emit：它由 SettingsCenter 作为栏目直接渲染 */
defineEmits<{
    /** 面板关闭（保留以兼容旧调用方） */
    (e: 'close'): void;
}>();

const store = useUiLibStore();
const confirm = useConfirm();
const toast = useToast();

const searchKeyword = ref('');
const activeCategoryId = ref('');

const addingCategory = ref(false);
const newCategoryName = ref('');
const categoryInputRef = ref<HTMLInputElement | null>(null);

const addingItem = ref(false);
const itemName = ref('');
const itemUrl = ref('');
const itemCategory = ref('');
const isAddingItem = ref(false);

const previewVisible = ref(false);
const previewTarget = ref<UiItem | null>(null);

const categories = computed(() => store.categories);
const items = computed(() => store.items);

/** 各分类下的图标数量 */
const countByCategory = computed(() => {
    const counts: Record<string, number> = {};
    for (const item of items.value) {
        counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
});

/** 当前可见图标：有关键词时跨分类按名称过滤，否则按当前分类 */
const visibleItems = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase();
    if (keyword) {
        return items.value.filter(item => item.name.toLowerCase().includes(keyword));
    }
    return items.value.filter(item => item.category === activeCategoryId.value);
});

const emptyText = computed(() => {
    if (searchKeyword.value.trim()) {
        return '未找到匹配的图标';
    }
    if (categories.value.length === 0) {
        return '暂无分类，点击上方 + 新建分类';
    }
    return '该分类下暂无图标';
});

/** 挂载即初始化：作为设置栏目渲染时没有“打开”这个事件了 */
onMounted(async () => {
    await store.init();
    if (!activeCategoryId.value && categories.value.length > 0) {
        activeCategoryId.value = categories.value[0].id;
    }
});

/** 分类变化后，若当前分类不存在则回退到第一个 */
watch(
    () => categories.value.map(c => c.id).join(','),
    () => {
        if (!categories.value.some(c => c.id === activeCategoryId.value)) {
            activeCategoryId.value = categories.value[0]?.id ?? '';
        }
    }
);

function isSystemCategory(id: string): boolean {
    return !store.userCategoryIds.has(id);
}

function getCategoryName(categoryId: string): string {
    return categories.value.find(c => c.id === categoryId)?.name ?? '未分类';
}

// ==================== 分类管理 ====================

function startAddCategory(): void {
    addingCategory.value = true;
    newCategoryName.value = '';
    nextTick(() => {
        categoryInputRef.value?.focus();
    });
}

function cancelAddCategory(): void {
    addingCategory.value = false;
    newCategoryName.value = '';
}

async function addCategory(): Promise<void> {
    const name = newCategoryName.value.trim();
    if (!name) {
        toast.error('请输入分类名称');
        return;
    }
    try {
        const created = await store.addCategory({ name });
        cancelAddCategory();
        activeCategoryId.value = created.id;
        toast.success('分类已添加');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '添加分类失败');
    }
}

async function deleteCategory(id: string, name: string): Promise<void> {
    const confirmed = await confirm.confirm(
        `确定要删除分类「${name}」吗？该分类下的图标也会一并删除。`,
        { title: '删除分类', isDanger: true }
    );
    if (!confirmed) {
        return;
    }
    try {
        await store.deleteCategory(id);
        toast.success('分类已删除');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '删除分类失败');
    }
}

// ==================== 图标管理 ====================

function startAddItem(): void {
    if (categories.value.length === 0) {
        toast.error('请先新建分类');
        return;
    }
    addingItem.value = true;
    itemName.value = '';
    itemUrl.value = '';
    itemCategory.value = activeCategoryId.value || categories.value[0]?.id || '';
}

function cancelAddItem(): void {
    addingItem.value = false;
    itemName.value = '';
    itemUrl.value = '';
    itemCategory.value = '';
}

async function addItem(): Promise<void> {
    if (!itemCategory.value) {
        toast.error('请选择图标分类');
        return;
    }
    const name = itemName.value.trim();
    if (!name) {
        toast.error('请输入图标名称');
        return;
    }
    const url = itemUrl.value.trim();
    if (!url) {
        toast.error('请输入图标 URL');
        return;
    }

    isAddingItem.value = true;
    try {
        await store.addItem({ name, url, category: itemCategory.value });
        cancelAddItem();
        toast.success('图标已添加');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '添加图标失败');
    } finally {
        isAddingItem.value = false;
    }
}

async function deleteItem(id: string, name: string): Promise<void> {
    const confirmed = await confirm.confirm(`确定要删除图标「${name}」吗？`, {
        title: '删除图标',
        isDanger: true,
    });
    if (!confirmed) {
        return;
    }
    try {
        await store.deleteItem(id);
        toast.success('图标已删除');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '删除图标失败');
    }
}

function previewItem(item: UiItem): void {
    previewTarget.value = item;
    previewVisible.value = true;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
@use '@/styles/mixins.scss' as *;

// =====================================================
// 图标库面板
// 层级只用「底色差 + 1px 发丝描边」表达，投影留给真正的浮层（弹窗本身）；
// 主色稀缺：仅出现在选中标签、焦点环与可点元素的 hover 描边上，容器一律中性表面。
// 底色 / 描边 / 文字全部来自 --ui-* 语义 token，明暗主题自动适配，因此不再有 dark-mode 覆盖。
// =====================================================
.ui-lib-panel {
    display: flex;
    flex-direction: column;
    min-height: 320px;

    &__title {
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
        font-size: var(--ui-font-title);
        font-weight: 600;
        color: var(--ui-ink);
        letter-spacing: var(--ui-track-tight);
    }

    &__footer-total {
        font-size: var(--ui-font-caption);
        color: var(--ui-muted-soft);
        font-variant-numeric: tabular-nums;
        padding-top: var(--ui-space-1);
        color: var(--ui-muted);
    }

    &__search {
        padding: var(--ui-space-3) var(--ui-space-6) 0;
    }

    &__state {
        flex: 1;
        @include flex-center(column, var(--ui-space-3));
        padding: var(--ui-space-8) var(--ui-space-6);
        color: var(--ui-muted);
        font-size: var(--ui-font-body);

        p {
            margin: 0;
        }
    }

    // ==================== 分类标签栏 ====================
    &__tabs {
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
        padding: var(--ui-space-3) var(--ui-space-6);
        border-bottom: 1px solid var(--ui-hairline);
        overflow-x: auto;
        @include hide-scrollbar;
    }

    &__tab {
        @include button-reset;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px var(--ui-space-3);
        border-radius: var(--ui-radius-pill);
        border: 1px solid var(--ui-hairline-strong);
        background: var(--ui-panel);
        color: var(--ui-muted);
        font-size: var(--ui-font-small);
        font-weight: 500;
        white-space: nowrap;
        transition:
            background-color var(--ui-dur-fast) var(--ui-ease),
            border-color var(--ui-dur-fast) var(--ui-ease),
            color var(--ui-dur-fast) var(--ui-ease);
        @include ui-focus-ring;

        &:hover {
            background: var(--ui-elevated-hover);
            color: var(--ui-ink);
        }

        // 选中：浅主色底 + 主色发丝描边，不做整块主色填充
        &.is-active {
            background: var(--ui-accent-soft);
            border-color: var(--ui-accent);
            color: var(--ui-accent);
        }
    }

    &__tab-count {
        padding: 0 6px;
        border-radius: var(--ui-radius-pill);
        font-size: var(--ui-font-micro);
        font-weight: 600;
        background: var(--ui-accent-softer);
        color: var(--ui-muted);

        // 选中标签内的小徽标是这一行唯一允许实色主色的地方
        .is-active & {
            background: var(--ui-accent);
            color: var(--ui-on-accent);
        }
    }

    &__tab-delete {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: var(--ui-radius-pill);
        cursor: pointer;
        color: inherit;
        @include ui-transition(background-color, var(--ui-dur-fast));

        &:hover {
            background: var(--ui-accent);
            color: var(--ui-on-accent);
        }
    }

    &__tab-add {
        @include button-reset;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        border-radius: var(--ui-radius-pill);
        border: 1.5px dashed var(--ui-hairline-strong);
        color: var(--ui-muted);
        @include flex-center(row, 0);
        transition:
            background-color var(--ui-dur-fast) var(--ui-ease),
            border-color var(--ui-dur-fast) var(--ui-ease),
            color var(--ui-dur-fast) var(--ui-ease);
        @include ui-focus-ring;

        &:hover {
            border-color: var(--ui-accent);
            color: var(--ui-accent);
            background: var(--ui-accent-softer);
        }
    }

    &__tab-input {
        width: 120px;
        flex-shrink: 0;
        padding: 6px var(--ui-space-3);
        border-radius: var(--ui-radius-pill);
        border: 1px solid var(--ui-accent);
        background: var(--ui-elevated);
        color: var(--ui-ink);
        font-size: var(--ui-font-small);
        font-family: inherit;
        outline: none;

        &::placeholder {
            color: var(--ui-muted-soft);
        }

        &:focus-visible {
            box-shadow: 0 0 0 3px var(--ui-accent-softer);
        }
    }

    // ==================== 图标网格 ====================
    &__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--ui-space-4) var(--ui-space-6);
        @include hide-scrollbar;
    }

    &__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
        gap: var(--ui-space-3);
    }

    &__item {
        @include button-reset;
        position: relative;
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ui-space-1);
        padding: var(--ui-space-2);
        border-radius: var(--ui-radius-lg);
        border: 1px solid var(--ui-hairline);
        background: var(--ui-panel);
        transition:
            background-color var(--ui-dur-base) var(--ui-ease),
            border-color var(--ui-dur-base) var(--ui-ease);
        @include ui-focus-ring;

        // hover / 键盘聚焦：描边转主色 + 底色微提，不做位移也不加投影
        &:hover,
        &:focus-visible {
            border-color: var(--ui-accent);
            background: var(--ui-accent-softer);
        }
    }

    &__item-delete {
        position: absolute;
        top: var(--ui-space-1);
        right: var(--ui-space-1);
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--ui-radius-pill);
        cursor: pointer;
        color: var(--ui-danger);
        background: var(--md-sys-color-error-container);
        opacity: 0;
        @include ui-transition(opacity, var(--ui-dur-fast));

        .ui-lib-panel__item:hover &,
        .ui-lib-panel__item:focus-visible & {
            opacity: 1;
        }
    }

    // 图标底座：常态中性抬升底，hover 时染一层浅主色
    &__icon {
        width: 40px;
        height: 40px;
        border-radius: var(--ui-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--ui-elevated);
        transition: background-color var(--ui-dur-base) var(--ui-ease);

        .ui-lib-panel__item:hover &,
        .ui-lib-panel__item:focus-visible & {
            background: var(--ui-accent-soft);
        }
    }

    &__item-name {
        width: 100%;
        font-size: var(--ui-font-micro);
        color: var(--ui-muted);
        text-align: center;
        @include text-ellipsis;
    }

    // ==================== 新增图标 ====================
    &__add-row {
        @include button-reset;
        margin-top: var(--ui-space-3);
        width: 100%;
        padding: var(--ui-space-3) var(--ui-space-4);
        border-radius: var(--ui-radius-lg);
        border: 1.5px dashed var(--ui-hairline-strong);
        color: var(--ui-muted);
        font-size: var(--ui-font-body);
        font-weight: 500;
        @include flex-center(row, var(--ui-space-2));
        transition:
            background-color var(--ui-dur-base) var(--ui-ease),
            border-color var(--ui-dur-base) var(--ui-ease),
            color var(--ui-dur-base) var(--ui-ease);
        @include ui-focus-ring;

        &:hover {
            border-color: var(--ui-accent);
            color: var(--ui-accent);
            background: var(--ui-accent-softer);
        }
    }

    // 表单区块比面板深一档，内部控件再浅回来，形成「降 - 升」层次
    &__item-form {
        margin-top: var(--ui-space-3);
        padding: var(--ui-space-4);
        display: flex;
        flex-direction: column;
        gap: var(--ui-space-3);
        @include ui-surface(var(--ui-sunken), var(--ui-radius-lg));
    }

    &__form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    &__label {
        font-size: var(--ui-font-small);
        font-weight: 600;
        letter-spacing: var(--ui-track-tight);
        color: var(--ui-ink);
    }

    &__select {
        width: 100%;
        min-height: 36px;
        padding: 0 var(--ui-space-3);
        border: 1px solid var(--ui-hairline-strong);
        border-radius: var(--ui-radius-md);
        background: var(--ui-panel);
        color: var(--ui-ink);
        font-size: var(--ui-font-body);
        font-family: inherit;
        outline: none;
        cursor: pointer;
        @include ui-transition(border-color, var(--ui-dur-fast));

        // 焦点：主色描边 + 柔和主色光晕（不再写死主色 rgba）
        &:focus-visible {
            border-color: var(--ui-accent);
            box-shadow: 0 0 0 3px var(--ui-accent-softer);
        }
    }

    &__form-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--ui-space-2);
    }

    // ==================== 预览弹层 ====================
    &__preview {
        padding: var(--ui-space-4) var(--ui-space-2);
        text-align: center;
    }

    &__preview-box {
        width: 120px;
        height: 120px;
        margin: 0 auto var(--ui-space-4);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--ui-sunken);
        border: 1px solid var(--ui-hairline);
        border-radius: var(--ui-radius-xl);
    }

    &__preview-name {
        margin-bottom: var(--ui-space-2);
        font-size: var(--ui-font-title);
        font-weight: 600;
        letter-spacing: var(--ui-track-tight);
        color: var(--ui-ink);
    }

    &__preview-desc {
        font-size: var(--ui-font-caption);
        color: var(--ui-muted);
    }
}
</style>
