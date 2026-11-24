<script setup lang="ts">
/**
 * CategoryManager - 设置中心的「分类管理」栏目
 *
 * 展示用户自定义分类（排除“全部应用”），显示每个分类下的网站数量，
 * 支持新建、编辑与删除。删除前会弹出确认对话框，并直接通过 useDataManager 执行删除。
 *
 * 自身不再承载弹窗外壳：由 SettingsCenter 作为栏目内容渲染，
 * 新建 / 编辑通过事件抛给 App.vue，由它关掉设置中心再打开 CategoryEditModal。
 */
import { computed, onMounted } from 'vue';
import type { Category } from '@/types/app';
import { useDataManager } from '@/composables/useDataManager';
import { useConfirm } from '@/composables/useConfirm';
import { useToast } from '@/composables/useToast';
import BaseButton from '@/components/common/BaseButton.vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';

const emit = defineEmits<{
    (e: 'edit', category: Category): void;
    (e: 'add'): void;
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
    <div class="mnt-category-manager">
        <div
            v-if="categories.length === 0"
            class="mnt-category-manager__empty"
            role="status"
        >
            <IconSvg name="folder" :size="40" />
            <p class="mnt-category-manager__empty-title">暂无自定义分类</p>
            <p class="mnt-category-manager__empty-hint">点击下方「新建分类」创建第一个分类</p>
        </div>

        <template v-else>
            <SettingsSection
                title="分类"
                :description="`共 ${categories.length} 个分类 · ${totalApps} 个网站`"
            >
                <div
                    v-for="category in categories"
                    :key="category.id"
                    class="mnt-category-manager__item"
                    role="listitem"
                >
                    <div class="mnt-category-manager__info">
                        <div class="mnt-category-manager__icon">
                            <IconSvg
                                :src="category.icon"
                                :size="20"
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
                </div>

                <button
                    type="button"
                    class="mnt-category-manager__add-row"
                    @click="handleAdd"
                >
                    <IconSvg name="plus" :size="16" />
                    <span>新建分类</span>
                </button>
            </SettingsSection>
        </template>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.mnt-category-manager {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5);

    // ============ 空状态 ============
    &__empty {
        @include flex-center(column, var(--ui-space-3));
        padding: var(--ui-space-8) var(--ui-space-4);
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

    // ============ 列表行 ============
    // 行与行之间的发丝分隔由 SettingsSection 的 :not(:first-child) 负责，
    // 这里只管行自身的两栏布局
    &__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ui-space-4);
        min-height: 56px;
        padding: var(--ui-space-3) 0;
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
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        overflow: hidden;
        border: 1px solid var(--ui-hairline);
        border-radius: var(--ui-radius-md);
        background: var(--ui-sunken);
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
        color: var(--ui-muted);

        &:hover {
            background: var(--ui-danger-soft);
            color: var(--ui-danger);
        }
    }

    // ============ 「新建分类」行 ============
    // 组内最后一行：虚线描边表示「可新增」，hover 才点亮主色
    &__add-row {
        @include button-reset;
        @include flex-center(row, var(--ui-space-2));
        @include ui-focus-ring;
        @include ui-transition(border-color, color, background-color);
        width: 100%;
        margin: var(--ui-space-3) 0;
        padding: var(--ui-space-3) var(--ui-space-4);
        border: 1px dashed var(--ui-hairline-strong);
        border-radius: var(--ui-radius-md);
        font-size: var(--ui-font-small);
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
