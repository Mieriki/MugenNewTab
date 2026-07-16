<script setup lang="ts">
/**
 * AppGrid - 应用卡片网格
 *
 * 在分类维度下渲染一组 AppCard，支持点击、编辑、删除事件透传，
 * 并可选启用同一分类内的拖拽排序。
 */
import { computed, onUnmounted, ref } from 'vue';
import type { AppItem } from '@/types/app';
import { useDragSort } from '@/composables/useDragSort';
import AppCard from './AppCard.vue';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface AppGridProps {
    /** 当前分类下的应用列表 */
    apps: AppItem[];
    /** 当前分类 ID */
    categoryId: string;
    /** 是否启用拖拽排序 */
    draggable?: boolean;
    /** 是否显示隐藏应用（已过滤传入时此属性仅影响空状态提示） */
    showHidden?: boolean;
    /** 是否显示编辑按钮 */
    editable?: boolean;
    /** 是否显示删除按钮 */
    deletable?: boolean;
}

const props = withDefaults(defineProps<AppGridProps>(), {
    draggable: false,
    showHidden: false,
    editable: true,
    deletable: true,
});

const emit = defineEmits<{
    /** 点击应用卡片 */
    (e: 'app-click', app: AppItem): void;
    /** 点击编辑按钮 */
    (e: 'edit-app', app: AppItem): void;
    /** 点击删除按钮 */
    (e: 'delete-app', app: AppItem): void;
    /** 同一分类内排序完成，返回新的应用 ID 顺序 */
    (e: 'order-change', payload: { categoryId: string; orderedIds: string[] }): void;
}>();

const gridRef = ref<HTMLElement | null>(null);
const suppressClick = ref(false);
let suppressTimer: ReturnType<typeof setTimeout> | null = null;

const displayedApps = computed(() => props.apps);

const hasApps = computed(() => displayedApps.value.length > 0);

const { isDragging, isPressing, currentId } = useDragSort({
    containerRef: gridRef,
    itemSelector: '.app-card',
    direction: 'grid',
    disabled: computed(() => !props.draggable || displayedApps.value.length < 2),
    onEnd: (event) => {
        if (!gridRef.value || event.cancelled) {
            return;
        }

        const cards = Array.from(
            gridRef.value.querySelectorAll<HTMLElement>('.app-card')
        );
        const orderedIds = cards.map((card) => card.dataset.appId).filter((id): id is string => !!id);

        emit('order-change', {
            categoryId: props.categoryId,
            orderedIds,
        });

        suppressClick.value = true;
        if (suppressTimer) {
            clearTimeout(suppressTimer);
        }
        suppressTimer = setTimeout(() => {
            suppressClick.value = false;
        }, 100);
    }
});

function handleAppClick(app: AppItem): void {
    if (suppressClick.value || isDragging.value) {
        return;
    }
    emit('app-click', app);
}

function handleEdit(app: AppItem): void {
    emit('edit-app', app);
}

function handleDelete(app: AppItem): void {
    emit('delete-app', app);
}

onUnmounted(() => {
    if (suppressTimer) {
        clearTimeout(suppressTimer);
    }
});
</script>

<template>
    <div
        ref="gridRef"
        class="app-grid"
        :class="{ 'is-dragging': isDragging }"
        :data-category="categoryId"
    >
        <AppCard
            v-for="app in displayedApps"
            :key="app.id"
            :app="app"
            :draggable="draggable"
            :dragging="isDragging && currentId === app.id"
            :pressing="isPressing && currentId === app.id"
            :editable="editable"
            :deletable="deletable"
            @click="handleAppClick"
            @edit="handleEdit"
            @delete="handleDelete"
        />

        <div v-if="!hasApps" class="app-grid__empty">
            <slot name="empty">
                <IconSvg name="folder" :size="48" />
                <p>该分类下暂无应用</p>
            </slot>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.app-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    min-height: 50px;

    &.is-dragging {
        :deep(.app-card) {
            transition: none;
        }
    }

    &__empty {
        grid-column: 1 / -1;
        text-align: center;
        padding: 40px 20px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.9rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }
}

@media (max-width: 768px) {
    .app-grid {
        grid-template-columns: 1fr;
        gap: 10px;
    }
}
</style>
