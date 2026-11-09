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
        @include ui-description;
        margin: 0 var(--ui-space-1) var(--ui-space-2);
    }

    // ============ 空状态 ============
    &__empty {
        @include flex-center(column, var(--ui-space-3));
        padding: var(--ui-space-7) var(--ui-space-4);
        color: var(--ui-muted-soft);
        text-align: center;

        :deep(.icon-svg) {
            color: var(--ui-muted);
        }

        // 只重置外边距，字号由下面两个具体 class 决定，避免 !important
        p {
            margin: 0;
        }
    }

    &__empty-title {
        font-size: var(--ui-font-body);
        font-weight: 600;
        letter-spacing: var(--ui-track-tight);
        color: var(--ui-ink);
    }

    &__empty-hint {
        @include ui-description;
        color: var(--ui-muted-soft);
    }

    // ============ 列表 ============
    &__list {
        list-style: none;
        margin: 0;
        padding: var(--ui-space-1);
        display: flex;
        flex-direction: column;
        gap: var(--ui-space-2);
        max-height: 400px;
        overflow-y: auto;
        @include hide-scrollbar;
    }

    // 列表行：中性底 + 发丝描边，hover 只换底色与描边，不做位移
    &__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ui-space-3);
        padding: var(--ui-space-3) var(--ui-space-4);
        @include ui-surface(var(--ui-elevated), var(--ui-radius-lg));
        @include ui-interactive;

        &:hover {
            border-color: var(--ui-hairline-strong);
        }
    }

    &__info {
        display: flex;
        align-items: center;
        gap: var(--ui-space-3);
        flex: 1;
        min-width: 0;
    }

    &__icon {
        @include flex-center(row, 0);
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        overflow: hidden;
        border: 1px solid var(--ui-hairline);
        border-radius: var(--ui-radius-md);
        background: var(--ui-panel);
        color: var(--ui-ink);
    }

    &__text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    &__name {
        @include ui-label;
        font-size: var(--ui-font-body);
        line-height: 1.3;
    }

    &__meta {
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
    }

    &__count {
        font-size: var(--ui-font-caption);
        line-height: 1.3;
        color: var(--ui-muted);
    }

    // 状态徽标：主色留给「选中 / CTA」，徽标只做弱提示
    &__badge {
        padding: 1px var(--ui-space-2);
        border-radius: var(--ui-radius-pill);
        background: var(--ui-accent-soft);
        color: var(--ui-accent);
        font-size: var(--ui-font-micro);
        line-height: 1.4;
    }

    &__actions {
        display: flex;
        gap: var(--ui-space-1);
        flex-shrink: 0;
    }

    &__delete-btn {
        color: var(--ui-danger);

        &:hover {
            background: var(--md-sys-color-error-container);
            color: var(--ui-danger);
        }
    }

    // ============ 底部「新建分类」行 ============
    // 虚线描边的空位提示，hover 才点亮主色
    &__add-row {
        @include button-reset;
        @include flex-center(row, var(--ui-space-2));
        @include ui-focus-ring;
        @include ui-transition(border-color, color);
        width: 100%;
        margin-top: var(--ui-space-3);
        padding: var(--ui-space-3) var(--ui-space-4);
        border: 1px dashed var(--ui-hairline-strong);
        border-radius: var(--ui-radius-lg);
        font-size: var(--ui-font-body);
        font-weight: 500;
        color: var(--ui-muted);

        &:hover {
            border-color: var(--ui-accent);
            background: var(--ui-accent-softer);
            color: var(--ui-accent);
        }
    }
}

// 底色 / 描边 / 文字全部由 --ui-* 按当前主题派生，深色主题无需另写一套覆盖
</style>
