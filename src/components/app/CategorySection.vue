<script setup lang="ts">
/**
 * CategorySection - 分类区块
 *
 * 展示分类标题（带图标）与该分类下的应用网格，
 * 所有事件向上透传，自身不持有业务状态。
 */
import { computed } from 'vue';
import type { AppItem, Category } from '@/types/app';
import { isImageIcon } from '@/utils/image.util';
import AppGrid from './AppGrid.vue';
import IconSvg from '@/components/icon/IconSvg.vue';

export interface CategorySectionProps {
    /** 分类数据 */
    category: Category;
    /** 该分类下的应用列表 */
    apps: AppItem[];
    /** 是否显示分类标题 */
    showTitle?: boolean;
    /** 是否启用拖拽排序 */
    draggable?: boolean;
    /** 是否显示隐藏应用（已过滤传入时此属性仅影响空状态） */
    showHidden?: boolean;
    /** 是否显示编辑按钮 */
    editable?: boolean;
    /** 是否显示删除按钮 */
    deletable?: boolean;
    /** 入场动画延迟（秒） */
    animationDelay?: number;
}

const props = withDefaults(defineProps<CategorySectionProps>(), {
    showTitle: true,
    draggable: false,
    showHidden: false,
    editable: true,
    deletable: true,
    animationDelay: 0,
});

const emit = defineEmits<{
    /** 点击应用卡片 */
    (e: 'app-click', app: AppItem): void;
    /** 点击编辑按钮 */
    (e: 'edit-app', app: AppItem): void;
    /** 点击删除按钮 */
    (e: 'delete-app', app: AppItem): void;
}>();

const iconIsImage = computed(() => isImageIcon(props.category.icon?.trim() || 'folder'));

function handleAppClick(app: AppItem): void {
    emit('app-click', app);
}

function handleEdit(app: AppItem): void {
    emit('edit-app', app);
}

function handleDelete(app: AppItem): void {
    emit('delete-app', app);
}
</script>

<template>
    <section
        class="category-section"
        :style="animationDelay > 0 ? { animationDelay: `${animationDelay}s` } : undefined"
    >
        <h3 v-if="showTitle" class="category-section__title">
            <span class="category-section__icon">
                <IconSvg
                    :src="category.icon"
                    name="folder"
                    :size="18"
                    :monochrome="category.monochrome && !iconIsImage"
                    :alt="category.name"
                />
            </span>
            <span class="category-section__name">{{ category.name }}</span>
        </h3>

        <AppGrid
            :apps="apps"
            :category-id="category.id"
            :draggable="draggable"
            :show-hidden="showHidden"
            :editable="editable"
            :deletable="deletable"
            @app-click="handleAppClick"
            @edit-app="handleEdit"
            @delete-app="handleDelete"
        >
            <template v-if="$slots.empty" #empty>
                <slot name="empty" />
            </template>
        </AppGrid>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.category-section {
    margin-bottom: 32px;
    animation: fadeInUp 0.5s ease-out both;
    contain: layout;

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(16px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    &__title {
        font-size: 0.95rem;
        color: var(--md-sys-color-on-surface);
        margin: 0 0 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0.85;
    }

    &__icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    &__name {
        @include text-ellipsis;
    }
}

// 深色模式覆盖
:global(html.dark-mode),
:global(body.dark-mode) {
    .category-section__title {
        color: rgba(255, 255, 255, 0.7);
    }
}
</style>
