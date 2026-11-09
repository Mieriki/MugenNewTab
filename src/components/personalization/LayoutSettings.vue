<script setup lang="ts">
/**
 * LayoutSettings - 页面布局设置
 *
 * 设置中心「页面布局」栏目，按「分组 + 行」组织：
 * 列数与分页归到「网格」，分类与图标归到「显示」，打开方式归到「链接」。
 * 状态由 layout store 管理与持久化，本组件只做呈现与调用。
 */
import { computed, onMounted } from 'vue';
import { useLayoutStore } from '@/stores/layout.store';
import type { LinkOpenMode } from '@/types/storage';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';
import BaseSegmented, { type SegmentedOption } from '@/components/common/BaseSegmented.vue';
import BaseSwitch from '@/components/common/BaseSwitch.vue';

const layoutStore = useLayoutStore();

/** 列数选项：'auto' 为按宽度自适应；值为字符串以适配 BaseSegmented */
const COLUMN_OPTIONS: SegmentedOption[] = [
    { value: 'auto', label: '自动' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '5', label: '5' },
    { value: '6', label: '6' },
];

/** 每页数量选项 */
const PAGE_SIZE_OPTIONS: SegmentedOption[] = [12, 24, 48, 96].map((size) => ({
    value: String(size),
    label: String(size),
}));

/** 链接打开方式选项 */
const OPEN_MODE_OPTIONS: Array<{ value: LinkOpenMode; label: string; hint: string }> = [
    { value: 'new-tab', label: '新标签页', hint: '保留当前新标签页，站点在右侧新标签打开' },
    { value: 'current-tab', label: '覆盖当前页', hint: '直接在当前标签页打开，新标签页被替换' },
];

const openModeSegments = computed<SegmentedOption[]>(() =>
    OPEN_MODE_OPTIONS.map(({ value, label }) => ({ value, label }))
);

const currentColumns = computed(() => String(layoutStore.columns));

const currentPageSize = computed(() => String(layoutStore.pageSize));

/** 当前打开方式对应的说明文案 */
const openModeHint = computed(
    () => OPEN_MODE_OPTIONS.find((item) => item.value === layoutStore.openMode)?.hint ?? ''
);

/** 分页说明随开关变化，避免关掉后还显示每页数量相关的提示 */
const paginateDescription = computed(() =>
    layoutStore.paginate
        ? '卡片过多时减少同屏数量，避免卡顿'
        : '开启后按固定页数分屏显示卡片，减少同屏渲染开销'
);

onMounted(() => {
    void layoutStore.init();
});

function handleColumnsChange(value: string): void {
    layoutStore.setColumns(value === 'auto' ? 'auto' : Number(value));
}

function handlePageSizeChange(value: string): void {
    layoutStore.setPageSize(Number(value));
}
</script>

<template>
    <div class="layout-settings">
        <SettingsSection
            title="网格"
            description="控制应用卡片的排列密度。"
        >
            <SettingsRow label="每行卡片数" description="「自动」按页面宽度自适应列数">
                <template #actions>
                    <BaseSegmented
                        :model-value="currentColumns"
                        :options="COLUMN_OPTIONS"
                        aria-label="每行卡片数"
                        @change="handleColumnsChange"
                    />
                </template>
            </SettingsRow>

            <SettingsRow label="分页模式" :description="paginateDescription">
                <template #actions>
                    <BaseSwitch
                        :model-value="layoutStore.paginate"
                        aria-label="分页模式"
                        @update:model-value="layoutStore.setPaginate($event)"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                v-if="layoutStore.paginate"
                label="每页卡片数"
                description="超出后出现翻页按钮"
            >
                <template #actions>
                    <BaseSegmented
                        :model-value="currentPageSize"
                        :options="PAGE_SIZE_OPTIONS"
                        aria-label="每页卡片数"
                        @change="handlePageSizeChange"
                    />
                </template>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="显示">
            <SettingsRow
                label="显示「全部应用」分类"
                description="关闭后侧栏只按分类显示"
            >
                <template #actions>
                    <BaseSwitch
                        :model-value="layoutStore.showAllCategory"
                        aria-label="显示全部应用分类"
                        @update:model-value="layoutStore.setShowAllCategory($event)"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                label="「全部应用」平铺显示"
                description="不按分类分组，所有卡片混排"
            >
                <template #actions>
                    <BaseSwitch
                        :model-value="layoutStore.allViewFlat"
                        aria-label="全部应用平铺显示"
                        @update:model-value="layoutStore.setAllViewFlat($event)"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                label="站点图标背景"
                description="关闭后图标底色透明，只留图形"
            >
                <template #actions>
                    <BaseSwitch
                        :model-value="layoutStore.showIconBackground"
                        aria-label="显示站点图标背景"
                        @update:model-value="layoutStore.setShowIconBackground($event)"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                label="极简约模式"
                description="隐藏侧边栏与顶栏，仅保留搜索框与磁贴（Alt+Shift+M）"
            >
                <template #actions>
                    <BaseSwitch
                        :model-value="layoutStore.minimalMode"
                        aria-label="极简约模式"
                        @update:model-value="layoutStore.setMinimalMode($event)"
                    />
                </template>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="链接">
            <SettingsRow label="打开方式" :description="openModeHint">
                <template #actions>
                    <BaseSegmented
                        :model-value="layoutStore.openMode"
                        :options="openModeSegments"
                        aria-label="链接打开方式"
                        @change="layoutStore.setOpenMode($event as LinkOpenMode)"
                    />
                </template>
            </SettingsRow>
        </SettingsSection>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.layout-settings {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5);
}
</style>
