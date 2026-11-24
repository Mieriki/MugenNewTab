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
import type { AppCardContextMenuPayload } from './AppCard.vue';
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
    /** 入场动画延迟（秒） */
    animationDelay?: number;
}

const props = withDefaults(defineProps<CategorySectionProps>(), {
    showTitle: true,
    draggable: false,
    showHidden: false,
    animationDelay: 0,
});

const emit = defineEmits<{
    /** 点击应用卡片 */
    (e: 'app-click', app: AppItem): void;
    /** 右键或键盘菜单键请求打开操作菜单 */
    (e: 'contextmenu-app', payload: AppCardContextMenuPayload): void;
    /** 点击「更多」按钮请求打开操作菜单 */
    (e: 'open-menu-app', payload: AppCardContextMenuPayload): void;
}>();

const iconIsImage = computed(() => isImageIcon(props.category.icon?.trim() || 'folder'));

function handleAppClick(app: AppItem): void {
    emit('app-click', app);
}

function handleContextMenu(payload: AppCardContextMenuPayload): void {
    emit('contextmenu-app', payload);
}

function handleOpenMenu(payload: AppCardContextMenuPayload): void {
    emit('open-menu-app', payload);
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
            @app-click="handleAppClick"
            @contextmenu-app="handleContextMenu"
            @open-menu-app="handleOpenMenu"
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
    margin-bottom: var(--ui-space-6);
    animation: fadeInUp 0.4s var(--ui-ease) both;
    contain: layout;

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(8px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    &__title {
        @include ui-caption;
        margin: 0 0 var(--ui-space-3);
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
    }

    &__icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    &__name {
        @include text-ellipsis;
    }
}
</style>
