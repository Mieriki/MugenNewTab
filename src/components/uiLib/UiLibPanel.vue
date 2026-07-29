<!--
  UiLibPanel - 图标库统一面板
  集浏览、搜索与分类/图标管理于一体（替代原 UiLibPicker + UiLibManager 两层弹窗）。
  系统数据仅可查看，用户分类与图标支持删除；点击图标卡片可预览大图。
-->
<template>
    <ModalOverlay
        v-model="isOpen"
        max-width="640"
        max-height="80vh"
        :z-index="2100"
        @close="emit('close')"
    >
        <template #header>
            <div class="ui-lib-panel__title">
                <IconSvg name="picture" :size="20" />
                <span>图标库</span>
            </div>
        </template>

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

        <template #footer>
            <span class="ui-lib-panel__footer-total">
                共 {{ categories.length }} 个分类 · {{ items.length }} 个图标
            </span>
            <BaseButton variant="text" size="small" @click="close">关闭</BaseButton>
        </template>
    </ModalOverlay>

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
import { computed, nextTick, ref, watch } from 'vue';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import { useUiLibStore } from '@/stores/uiLib.store';
import { useConfirm } from '@/composables/useConfirm';
import { useToast } from '@/composables/useToast';
import type { UiItem } from '@/types/ui';

/** 组件 Props */
interface Props {
    /** 是否显示面板（支持 v-model） */
    modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    /** 面板显示状态变化 */
    (e: 'update:modelValue', value: boolean): void;
    /** 面板关闭 */
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

const isOpen = computed({
    get: () => props.modelValue,
    set: (value: boolean) => emit('update:modelValue', value),
});

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

/** 打开时初始化 store 并重置面板状态 */
watch(
    () => props.modelValue,
    async (visible) => {
        if (visible) {
            searchKeyword.value = '';
            addingCategory.value = false;
            newCategoryName.value = '';
            cancelAddItem();
            await store.init();
            if (!activeCategoryId.value && categories.value.length > 0) {
                activeCategoryId.value = categories.value[0].id;
            }
        }
    },
    { immediate: true }
);

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

function close(): void {
    isOpen.value = false;
    emit('close');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
@use '@/styles/mixins.scss' as *;

.ui-lib-panel {
    display: flex;
    flex-direction: column;
    min-height: 320px;

    &__title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__footer-total {
        margin-right: auto;
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__search {
        padding: 12px 24px 0;
    }

    &__state {
        flex: 1;
        @include flex-center(column, 12px);
        padding: 48px 24px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 14px;

        p {
            margin: 0;
        }
    }

    &__tabs {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
        overflow-x: auto;
        @include hide-scrollbar;
    }

    &__tab {
        @include button-reset;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid var(--md-sys-color-outline);
        background: transparent;
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        white-space: nowrap;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            border-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-primary);
        }

        &.is-active {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border-color: var(--md-sys-color-primary);
        }
    }

    &__tab-count {
        font-size: 11px;
        padding: 0 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
        color: var(--md-sys-color-primary);

        .is-active & {
            background: rgba(255, 255, 255, 0.22);
            color: var(--md-sys-color-on-primary);
        }
    }

    &__tab-delete {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        cursor: pointer;
        @include md-transition(background, var(--md-transition-fast));

        &:hover {
            background: rgba(255, 255, 255, 0.28);
        }
    }

    &__tab-add {
        @include button-reset;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 1.5px dashed var(--md-sys-color-outline);
        color: var(--md-sys-color-on-surface-variant);
        flex-shrink: 0;
        @include flex-center(row, 0);
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            border-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-primary);
            background: color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent);
        }
    }

    &__tab-input {
        width: 120px;
        padding: 6px 12px;
        border-radius: 20px;
        border: 1px solid var(--md-sys-color-primary);
        background: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        font-family: inherit;
        outline: none;
        flex-shrink: 0;
    }

    &__content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 24px;
        @include hide-scrollbar;
    }

    &__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
        gap: 12px;
    }

    &__item {
        @include button-reset;
        position: relative;
        aspect-ratio: 1;
        border-radius: 12px;
        border: 1px solid var(--md-sys-color-outline-variant);
        background: var(--md-sys-color-surface);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover,
        &:focus-visible {
            border-color: var(--md-sys-color-primary);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
    }

    &__item-delete {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--md-sys-color-error);
        background: var(--md-sys-color-error-container);
        opacity: 0;
        @include md-transition(opacity, var(--md-transition-fast));

        .ui-lib-panel__item:hover &,
        .ui-lib-panel__item:focus-visible & {
            opacity: 1;
        }
    }

    &__icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent);
    }

    &__item-name {
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;
        @include text-ellipsis;
        width: 100%;
    }

    &__add-row {
        @include button-reset;
        margin-top: 12px;
        width: 100%;
        padding: 12px 16px;
        border-radius: 12px;
        border: 1.5px dashed var(--md-sys-color-outline);
        color: var(--md-sys-color-on-surface-variant);
        font-size: 14px;
        font-weight: 500;
        @include flex-center(row, 8px);
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            border-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-primary);
            background: color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent);
        }
    }

    &__item-form {
        margin-top: 12px;
        padding: 14px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 25%, transparent);
        background: color-mix(in srgb, var(--md-sys-color-primary) 4%, transparent);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    &__form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    &__label {
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__select {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: 10px;
        background: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        font-size: 14px;
        font-family: inherit;
        outline: none;

        &:focus-visible {
            border-color: var(--md-sys-color-primary);
            box-shadow: 0 0 0 3px rgba(177, 74, 107, 0.08);
        }
    }

    &__form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    &__preview {
        padding: 16px 8px;
        text-align: center;
    }

    &__preview-box {
        width: 120px;
        height: 120px;
        margin: 0 auto 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--md-sys-color-surface-variant);
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: 16px;
    }

    &__preview-name {
        font-size: 16px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        margin-bottom: 8px;
    }

    &__preview-desc {
        font-size: 13px;
        color: var(--md-sys-color-on-surface-variant);
    }
}

// 深色模式适配
:global(html.dark-mode),
:global(body.dark-mode) {
    .ui-lib-panel__item {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);

        &:hover,
        &:focus-visible {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
    }

    .ui-lib-panel__tab-input {
        background: rgba(255, 255, 255, 0.06);
    }

    .ui-lib-panel__select {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);
    }

    .ui-lib-panel__add-row {
        border-color: rgba(255, 255, 255, 0.16);

        &:hover {
            border-color: var(--md-sys-color-primary);
            background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
        }
    }
}
</style>
