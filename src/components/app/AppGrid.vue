<script setup lang="ts">
/**
 * AppGrid - 应用卡片网格
 *
 * 在分类维度下渲染一组 AppCard，支持点击、编辑、删除事件透传。
 * 长按拖拽由 useAppCardDrag 单例统一调度（幽灵卡片跟手 + 占位符落点 + 跨分类移动）：
 * 本组件负责 pointerdown 委托、拖拽期间排除被拖卡片并渲染占位符。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { AppItem } from '@/types/app';
import { useAppCardDrag } from '@/composables/useAppCardDrag';
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
}>();

const gridRef = ref<HTMLElement | null>(null);
const cardDrag = useAppCardDrag();

/** 占位符在渲染列表中的标记 */
const PLACEHOLDER_KEY = '__drag_placeholder__';

/** 拖拽期间从列表中排除被拖卡片（其视觉由幽灵卡片承担） */
const displayedApps = computed(() =>
    cardDrag.state.phase === 'dragging'
        ? props.apps.filter((app) => app.id !== cardDrag.state.app?.id)
        : props.apps
);

/** 本网格是否为当前落点网格 */
const isDropTarget = computed(
    () => cardDrag.state.phase === 'dragging' && cardDrag.state.targetCategoryId === props.categoryId
);

type DisplayEntry = { type: 'app'; app: AppItem } | { type: 'placeholder' };

/** 渲染列表：应用卡片 + （目标网格内的）占位符 */
const displayEntries = computed<DisplayEntry[]>(() => {
    const entries: DisplayEntry[] = displayedApps.value.map((app) => ({ type: 'app', app }));
    if (isDropTarget.value) {
        const index = Math.min(Math.max(cardDrag.state.targetIndex, 0), entries.length);
        entries.splice(index, 0, { type: 'placeholder' });
    }
    return entries;
});

const hasApps = computed(() => props.apps.length > 0);

// 注册网格：commit 时提供当前可见顺序（不含被拖卡片）
onMounted(() => {
    cardDrag.registerGrid(props.categoryId, () => displayedApps.value.map((app) => app.id));
});

onUnmounted(() => {
    cardDrag.unregisterGrid(props.categoryId);
});

/**
 * pointerdown 委托：命中卡片（操作按钮除外）时启动长按拖拽检测
 */
function handlePointerDown(event: PointerEvent): void {
    if (!props.draggable) return;
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (!target || target.closest('.app-card__actions')) return;

    const card = target.closest('.app-card') as HTMLElement | null;
    if (!card) return;

    const app = props.apps.find((item) => item.id === card.dataset.appId);
    if (!app) return;

    const rect = card.getBoundingClientRect();
    cardDrag.press(
        app,
        props.categoryId,
        { clientX: event.clientX, clientY: event.clientY },
        { width: rect.width, height: rect.height }
    );
}

function handleAppClick(app: AppItem): void {
    // 拖拽中或刚结束时抑制点击，防止误打开链接
    if (cardDrag.state.phase !== 'idle' || cardDrag.state.justEnded) {
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
</script>

<template>
    <div
        ref="gridRef"
        class="app-grid"
        :data-category="categoryId"
        @pointerdown="handlePointerDown"
    >
        <template v-for="entry in displayEntries" :key="entry.type === 'app' ? entry.app.id : PLACEHOLDER_KEY">
            <div v-if="entry.type === 'placeholder'" class="app-grid__placeholder" />
            <AppCard
                v-else
                :app="entry.app"
                :draggable="draggable"
                :pressing="cardDrag.state.phase === 'pressing' && cardDrag.state.app?.id === entry.app.id"
                :editable="editable"
                :deletable="deletable"
                @click="handleAppClick"
                @edit="handleEdit"
                @delete="handleDelete"
            />
        </template>

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

    &__placeholder {
        min-height: 66px;
        border: 2px dashed var(--md-sys-color-primary);
        border-radius: 12px;
        background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
        opacity: 0.7;
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
