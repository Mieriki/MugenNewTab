<script setup lang="ts">
/**
 * LayoutSettings - 页面布局设置
 *
 * 提供每行卡片列数与分页模式设置，状态由 layout store 管理并持久化。
 */
import { onMounted } from 'vue';
import { useLayoutStore } from '@/stores/layout.store';
import IconSvg from '@/components/icon/IconSvg.vue';

const layoutStore = useLayoutStore();

/** 列数选项：'auto' 为按宽度自适应 */
const COLUMN_OPTIONS: Array<{ value: number | 'auto'; label: string }> = [
    { value: 'auto', label: '自动' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
    { value: 6, label: '6' },
];

/** 每页数量选项 */
const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];

onMounted(() => {
    void layoutStore.init();
});

function handlePaginateChange(event: Event): void {
    void layoutStore.setPaginate((event.target as HTMLInputElement).checked);
}
</script>

<template>
    <section class="layout-settings" aria-label="页面布局">
        <header class="layout-settings__header">
            <IconSvg name="sort" :size="18" color="var(--md-sys-color-primary)" />
            <h3 class="layout-settings__title">页面布局</h3>
        </header>

        <div class="layout-settings__group">
            <label class="layout-settings__label">每行卡片数</label>
            <div class="layout-settings__segments">
                <button
                    v-for="option in COLUMN_OPTIONS"
                    :key="String(option.value)"
                    type="button"
                    class="layout-settings__segment"
                    :class="{ active: layoutStore.columns === option.value }"
                    @click="layoutStore.setColumns(option.value)"
                >
                    {{ option.label }}
                </button>
            </div>
            <p class="layout-settings__hint">「自动」按页面宽度自适应列数</p>
        </div>

        <div class="layout-settings__group">
            <label class="layout-settings__toggle">
                <input
                    type="checkbox"
                    :checked="layoutStore.showAllCategory"
                    @change="layoutStore.setShowAllCategory(($event.target as HTMLInputElement).checked)"
                />
                <span>显示「全部应用」分类（关闭后侧栏只按分类显示）</span>
            </label>
        </div>

        <div class="layout-settings__group">
            <label class="layout-settings__toggle">
                <input
                    type="checkbox"
                    :checked="layoutStore.allViewFlat"
                    @change="layoutStore.setAllViewFlat(($event.target as HTMLInputElement).checked)"
                />
                <span>「全部应用」平铺显示（不按分类分组）</span>
            </label>
        </div>

        <div class="layout-settings__group">
            <label class="layout-settings__toggle">
                <input
                    type="checkbox"
                    :checked="layoutStore.showIconBackground"
                    @change="layoutStore.setShowIconBackground(($event.target as HTMLInputElement).checked)"
                />
                <span>显示站点图标背景（关闭后图标背景透明）</span>
            </label>
        </div>

        <div class="layout-settings__group">
            <label class="layout-settings__toggle">
                <input
                    type="checkbox"
                    :checked="layoutStore.paginate"
                    @change="handlePaginateChange"
                />
                <span>分页模式（卡片过多时减少同屏数量，避免卡顿）</span>
            </label>
        </div>

        <div v-if="layoutStore.paginate" class="layout-settings__group">
            <label class="layout-settings__label">每页卡片数</label>
            <div class="layout-settings__segments">
                <button
                    v-for="size in PAGE_SIZE_OPTIONS"
                    :key="size"
                    type="button"
                    class="layout-settings__segment"
                    :class="{ active: layoutStore.pageSize === size }"
                    @click="layoutStore.setPageSize(size)"
                >
                    {{ size }}
                </button>
            </div>
        </div>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.layout-settings {
    display: flex;
    flex-direction: column;
    gap: 14px;

    &__header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0;
    }

    &__group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    &__label {
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__hint {
        margin: 0;
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__segments {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }

    &__segment {
        @include button-reset;
        min-width: 40px;
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 13px;
        color: var(--md-sys-color-on-surface);
        background: var(--md-sys-color-surface-variant);
        border: 1px solid transparent;
        @include md-transition(all, var(--md-transition-fast));

        &:hover {
            border-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-primary);
        }

        &.active {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
        }
    }

    &__toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 13px;
        color: var(--md-sys-color-on-surface);

        input[type='checkbox'] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--md-sys-color-primary);
        }
    }
}
</style>
