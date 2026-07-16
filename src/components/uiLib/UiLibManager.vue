<!--
  UiLibManager - UI 图标库管理器
  以模态框形式提供 UI 分类与图标项的 CRUD，系统数据仅可查看不可删除。
-->
<template>
    <ModalOverlay
        v-model="isOpen"
        title="管理 UI 库"
        max-width="600"
        :z-index="2200"
        @close="emit('close')"
    >
        <div class="ui-lib-manager">
            <div class="ui-lib-manager__tabs" role="tablist">
                <button
                    type="button"
                    class="ui-lib-manager__tab"
                    :class="{ 'is-active': activeTab === 'categories' }"
                    role="tab"
                    :aria-selected="activeTab === 'categories'"
                    @click="activeTab = 'categories'"
                >
                    分类管理
                </button>
                <button
                    type="button"
                    class="ui-lib-manager__tab"
                    :class="{ 'is-active': activeTab === 'items' }"
                    role="tab"
                    :aria-selected="activeTab === 'items'"
                    @click="activeTab = 'items'"
                >
                    图标管理
                </button>
            </div>

            <div v-if="activeTab === 'categories'" class="ui-lib-manager__panel" role="tabpanel">
                <div class="ui-lib-manager__form">
                    <BaseInput
                        v-model="newCategoryName"
                        label="新建 UI 分类"
                        placeholder="分类名称"
                        @enter="addCategory"
                    />
                    <BaseButton variant="primary" size="small" :loading="isAddingCategory" @click="addCategory">
                        添加
                    </BaseButton>
                </div>

                <div v-if="categories.length === 0" class="ui-lib-manager__empty">暂无分类</div>
                <div v-else class="ui-lib-manager__list" role="list">
                    <div
                        v-for="cat in categories"
                        :key="cat.id"
                        class="ui-lib-manager__list-item"
                        role="listitem"
                    >
                        <div class="ui-lib-manager__list-info">
                            <span class="ui-lib-manager__list-name">{{ cat.name }}</span>
                            <span v-if="isSystemCategory(cat.id)" class="ui-lib-manager__badge">系统</span>
                        </div>
                        <BaseButton
                            v-if="!isSystemCategory(cat.id)"
                            variant="text"
                            size="small"
                            aria-label="删除分类"
                            @click="deleteCategory(cat.id, cat.name)"
                        >
                            <template #icon>
                                <IconSvg name="delete" :size="16" />
                            </template>
                        </BaseButton>
                    </div>
                </div>
            </div>

            <div v-else class="ui-lib-manager__panel" role="tabpanel">
                <div class="ui-lib-manager__form-group">
                    <label class="ui-lib-manager__label" for="ui-lib-manager-item-category">所属分类</label>
                    <select
                        id="ui-lib-manager-item-category"
                        v-model="itemCategory"
                        class="ui-lib-manager__select"
                    >
                        <option value="">全部分类</option>
                        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                    </select>
                </div>

                <div class="ui-lib-manager__form ui-lib-manager__form--vertical">
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
                </div>

                <BaseButton
                    variant="primary"
                    size="small"
                    block
                    :loading="isAddingItem"
                    style="margin-top: 8px"
                    @click="addItem"
                >
                    添加图标
                </BaseButton>

                <div v-if="filteredItems.length === 0" class="ui-lib-manager__empty">暂无图标</div>
                <div v-else class="ui-lib-manager__list" role="list">
                    <div
                        v-for="item in filteredItems"
                        :key="item.id"
                        class="ui-lib-manager__list-item ui-lib-manager__list-item--clickable"
                        role="listitem"
                        @click="previewItem(item)"
                    >
                        <div class="ui-lib-manager__list-info">
                            <span class="ui-lib-manager__list-icon">
                                <IconSvg :src="item.url" :size="22" :alt="item.name" />
                            </span>
                            <div class="ui-lib-manager__list-text">
                                <span class="ui-lib-manager__list-name">{{ item.name }}</span>
                                <span class="ui-lib-manager__list-desc">
                                    {{ getCategoryName(item.category) }}
                                    <template v-if="item.isSystem"> · 系统</template>
                                </span>
                            </div>
                        </div>
                        <BaseButton
                            v-if="!item.isSystem"
                            variant="text"
                            size="small"
                            aria-label="删除图标"
                            @click.stop="deleteItem(item.id, item.name)"
                        >
                            <template #icon>
                                <IconSvg name="delete" :size="16" />
                            </template>
                        </BaseButton>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <BaseButton variant="text" size="small" @click="close">关闭</BaseButton>
        </template>
    </ModalOverlay>

    <ModalOverlay
        v-model="previewVisible"
        title="图标预览"
        max-width="400"
        :z-index="2300"
    >
        <div v-if="previewTarget" class="ui-lib-manager__preview">
            <div class="ui-lib-manager__preview-box">
                <IconSvg :src="previewTarget.url" :size="64" :alt="previewTarget.name" />
            </div>
            <div class="ui-lib-manager__preview-name">{{ previewTarget.name }}</div>
            <div class="ui-lib-manager__preview-desc">
                {{ getCategoryName(previewTarget.category) }}
                <template v-if="previewTarget.isSystem"> · 系统图标</template>
            </div>
        </div>
    </ModalOverlay>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
    /** 是否显示管理器（支持 v-model） */
    modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    /** 显示状态变化 */
    (e: 'update:modelValue', value: boolean): void;
    /** 管理器关闭 */
    (e: 'close'): void;
}>();

const store = useUiLibStore();
const confirm = useConfirm();
const toast = useToast();

const activeTab = ref<'categories' | 'items'>('categories');
const newCategoryName = ref('');
const itemName = ref('');
const itemUrl = ref('');
const itemCategory = ref('');
const isAddingCategory = ref(false);
const isAddingItem = ref(false);

const previewVisible = ref(false);
const previewTarget = ref<UiItem | null>(null);

const isOpen = computed({
    get: () => props.modelValue,
    set: (value: boolean) => emit('update:modelValue', value),
});

const categories = computed(() => store.categories);
const items = computed(() => store.items);

const filteredItems = computed(() => {
    if (!itemCategory.value) {
        return items.value;
    }
    return items.value.filter(item => item.category === itemCategory.value);
});

watch(
    () => props.modelValue,
    async (visible) => {
        if (visible) {
            await store.init();
        }
    },
    { immediate: true }
);

function isSystemCategory(id: string): boolean {
    return !store.userCategoryIds.has(id);
}

function getCategoryName(categoryId: string): string {
    return categories.value.find(c => c.id === categoryId)?.name ?? '未分类';
}

async function addCategory(): Promise<void> {
    const name = newCategoryName.value.trim();
    if (!name) {
        toast.error('请输入分类名称');
        return;
    }
    isAddingCategory.value = true;
    try {
        await store.addCategory({ name });
        newCategoryName.value = '';
        toast.success('UI 分类已添加');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '添加分类失败');
    } finally {
        isAddingCategory.value = false;
    }
}

async function deleteCategory(id: string, name: string): Promise<void> {
    const confirmed = await confirm.confirm(`确定要删除分类「${name}」吗？`, {
        title: '删除分类',
        isDanger: true,
    });
    if (!confirmed) {
        return;
    }
    try {
        await store.deleteCategory(id);
        toast.success('UI 分类已删除');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '删除分类失败');
    }
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
        await store.addItem({
            name,
            url,
            category: itemCategory.value,
        });
        itemName.value = '';
        itemUrl.value = '';
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

.ui-lib-manager {
    display: flex;
    flex-direction: column;

    &__tabs {
        display: flex;
        gap: 8px;
        padding: 16px 24px 0;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }

    &__tab {
        @include button-reset;
        padding: 8px 16px;
        border-radius: 8px 8px 0 0;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 14px;
        font-weight: 600;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            color: var(--md-sys-color-on-surface);
            background: var(--md-sys-color-surface-variant);
        }

        &.is-active {
            color: var(--md-sys-color-primary);
            border-bottom-color: var(--md-sys-color-primary);
        }
    }

    &__panel {
        padding: 20px 24px;
        min-height: 280px;
    }

    &__form {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: flex-end;
        margin-bottom: 16px;

        &--vertical {
            grid-template-columns: 1fr;
        }
    }

    &__form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 16px;
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
        outline: none;

        &:focus-visible {
            border-color: var(--md-sys-color-primary);
            box-shadow: 0 0 0 3px rgba(177, 74, 107, 0.08);
        }
    }

    &__empty {
        padding: 32px;
        text-align: center;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 14px;
    }

    &__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 360px;
        overflow-y: auto;
        padding: 4px;
        @include hide-scrollbar;
    }

    &__list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--md-sys-color-surface-variant);
        border: 1px solid var(--md-sys-color-outline-variant);
        @include md-transition(all, var(--md-transition-fast));

        &--clickable {
            cursor: pointer;

            &:hover {
                background: var(--md-sys-color-surface);
                border-color: var(--md-sys-color-outline);
            }
        }
    }

    &__list-info {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1;
    }

    &__list-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: var(--md-sys-color-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    &__list-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    &__list-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
        @include text-ellipsis;
    }

    &__list-desc {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--md-sys-color-surface-variant);
        color: var(--md-sys-color-on-surface-variant);
        border: 1px solid var(--md-sys-color-outline);
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
    .ui-lib-manager__select {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);
    }
}
</style>
