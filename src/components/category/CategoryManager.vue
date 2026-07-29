<script setup lang="ts">
/**
 * CategoryManager - 分类管理列表
 *
 * 展示用户自定义分类（排除“全部应用”），显示每个分类下的网站数量，
 * 支持新建、编辑与删除。删除前会弹出确认对话框，并直接通过 useDataManager 执行删除。
 */
import { computed, onMounted } from 'vue';
import type { Category } from '@/types/app';
import { useDataManager } from '@/composables/useDataManager';
import { useConfirm } from '@/composables/useConfirm';
import { useToast } from '@/composables/useToast';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface CategoryManagerProps {
    /** 是否显示模态框（支持 v-model） */
    modelValue: boolean;
}

defineProps<CategoryManagerProps>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'edit', category: Category): void;
    (e: 'add'): void;
    (e: 'close'): void;
}>();

const dataManager = useDataManager({ autoInit: true });
const confirmManager = useConfirm();
const toast = useToast();

onMounted(() => {
    if (!dataManager.initialized.value) {
        dataManager.init().catch((error) => {
            console.error('[CategoryManager] 初始化数据失败:', error);
        });
    }
});

const categories = computed(() => dataManager.userCategories.value);

const appCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const app of dataManager.apps.value) {
        counts[app.category] = (counts[app.category] || 0) + 1;
    }
    return counts;
});

/** 所有用户分类下的网站总数 */
const totalApps = computed(() =>
    categories.value.reduce((sum, category) => sum + (appCounts.value[category.id] || 0), 0)
);

function handleClose(): void {
    emit('update:modelValue', false);
    emit('close');
}

function handleAdd(): void {
    emit('add');
}

function handleEdit(category: Category): void {
    emit('edit', category);
}

async function handleDelete(category: Category): Promise<void> {
    const count = appCounts.value[category.id] || 0;
    const countText = count > 0 ? `该分类下的 ${count} 个网站也会被删除。` : '';

    const confirmed = await confirmManager.confirm(
        `确定要删除分类"${category.name}"吗？${countText}`,
        { isDanger: true, title: '删除分类' }
    );
    if (!confirmed) return;

    try {
        const deleted = await dataManager.deleteCategory(category.id);
        if (!deleted) {
            throw new Error('无法删除该分类');
        }
        toast.success('分类已删除');
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '删除失败');
    }
}

function formatCount(categoryId: string): string {
    const count = appCounts.value[categoryId] || 0;
    return `${count} 个网站`;
}
</script>

<template>
    <ModalOverlay
        :model-value="modelValue"
        title="管理分类"
        :max-width="480"
        close-on-overlay
        close-on-esc
        @update:model-value="$emit('update:modelValue', $event)"
        @close="handleClose"
    >
        <div class="mnt-category-manager">
            <div
                v-if="categories.length === 0"
                class="mnt-category-manager__empty"
                role="status"
            >
                <IconSvg name="folder" :size="48" />
                <p class="mnt-category-manager__empty-title">暂无自定义分类</p>
                <p class="mnt-category-manager__empty-hint">点击下方「新建分类」创建第一个分类</p>
            </div>

            <template v-else>
                <p class="mnt-category-manager__summary">
                    共 {{ categories.length }} 个分类 · {{ totalApps }} 个网站
                </p>

                <ul class="mnt-category-manager__list" role="list">
                    <li
                        v-for="category in categories"
                        :key="category.id"
                        class="mnt-category-manager__item"
                        role="listitem"
                    >
                        <div class="mnt-category-manager__info">
                            <div class="mnt-category-manager__icon">
                                <IconSvg
                                    :src="category.icon"
                                    :size="24"
                                    :monochrome="category.monochrome"
                                    :alt="category.name"
                                />
                            </div>
                            <div class="mnt-category-manager__text">
                                <span class="mnt-category-manager__name">{{ category.name }}</span>
                                <span class="mnt-category-manager__meta">
                                    <span class="mnt-category-manager__count">{{ formatCount(category.id) }}</span>
                                    <span v-if="category.monochrome" class="mnt-category-manager__badge">反色</span>
                                </span>
                            </div>
                        </div>

                        <div class="mnt-category-manager__actions">
                            <BaseButton
                                variant="text"
                                size="small"
                                aria-label="编辑分类"
                                @click="handleEdit(category)"
                            >
                                <template #icon>
                                    <IconSvg name="edit" :size="16" />
                                </template>
                            </BaseButton>
                            <BaseButton
                                variant="text"
                                size="small"
                                class="mnt-category-manager__delete-btn"
                                aria-label="删除分类"
                                @click="handleDelete(category)"
                            >
                                <template #icon>
                                    <IconSvg name="delete" :size="16" />
                                </template>
                            </BaseButton>
                        </div>
                    </li>
                </ul>

                <button
                    type="button"
                    class="mnt-category-manager__add-row"
                    @click="handleAdd"
                >
                    <IconSvg name="plus" :size="18" />
                    <span>新建分类</span>
                </button>
            </template>
        </div>

        <template #footer>
            <BaseButton variant="text" @click="handleClose">关闭</BaseButton>
            <BaseButton variant="primary" @click="handleAdd">
                <template #icon>
                    <IconSvg name="plus" :size="16" />
                </template>
                新建分类
            </BaseButton>
        </template>
    </ModalOverlay>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-category-manager {
    display: flex;
    flex-direction: column;

    &__summary {
        margin: 0 4px 10px;
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__empty {
        @include flex-center(column, 12px);
        padding: 32px 16px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;

        p {
            margin: 0;
            font-size: 14px;
        }
    }

    &__empty-title {
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__empty-hint {
        font-size: 12px !important;
        opacity: 0.8;
    }

    &__list {
        list-style: none;
        margin: 0;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 400px;
        overflow-y: auto;
        @include hide-scrollbar;
    }

    &__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 12px;
        background: var(--md-sys-color-surface-variant);
        border: 1px solid var(--md-sys-color-outline-variant);
        @include md-transition(all, var(--md-transition-fast));

        &:hover {
            background: var(--md-sys-color-surface);
            border-color: color-mix(in srgb, var(--md-sys-color-primary) 45%, transparent);
            transform: translateY(-1px);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
        }
    }

    &__info {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
    }

    &__icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-on-primary-container);
        border: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 25%, transparent);
        overflow: hidden;
    }

    &__text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    &__name {
        font-weight: 600;
        font-size: 15px;
        color: var(--md-sys-color-on-surface);
        line-height: 1.3;
        @include text-ellipsis;
    }

    &__meta {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    &__count {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.3;
    }

    &__badge {
        font-size: 10px;
        line-height: 1.4;
        padding: 1px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
        color: var(--md-sys-color-primary);
    }

    &__actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
    }

    &__delete-btn {
        color: var(--md-sys-color-error);

        &:hover {
            background: var(--md-sys-color-error-container);
        }
    }

    &__add-row {
        @include button-reset;
        margin-top: 10px;
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
}

// 深色模式适配
:global(html.dark-mode),
:global(body.dark-mode) {
    .mnt-category-manager__item {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);

        &:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: color-mix(in srgb, var(--md-sys-color-primary) 55%, transparent);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
        }
    }

    .mnt-category-manager__add-row {
        border-color: rgba(255, 255, 255, 0.16);

        &:hover {
            border-color: var(--md-sys-color-primary);
            background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
        }
    }
}
</style>
