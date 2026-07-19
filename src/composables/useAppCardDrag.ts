/**
 * useAppCardDrag
 * 应用卡片长按拖拽（幽灵卡片跟手 + 占位符指示落点 + 跨分类移动）
 *
 * 与原项目 js/app.js initDragAndDrop 行为一致：
 * 长按 300ms 进入拖拽，幽灵卡片跟随指针，占位符在命中的网格内实时移动，
 * 落下时提交目标分类与可见顺序（跨分类时由调用方先更新应用分类）。
 *
 * 模块级单例（风格同 useConfirm）：拖拽状态需跨多个 AppGrid 共享，
 * AppGrid 负责 pointerdown 委托与占位符渲染，App.vue 通过 onCommit 统一落库。
 */

import { reactive } from 'vue';
import type { AppItem } from '@/types/app';

/** 拖拽阶段：idle 空闲 / pressing 长按按压中 / dragging 拖拽中 */
export type AppCardDragPhase = 'idle' | 'pressing' | 'dragging';

/** 拖拽提交载荷 */
export interface AppCardDragCommit {
    appId: string;
    sourceCategoryId: string;
    targetCategoryId: string;
    /** 目标网格最终可见顺序（含被拖应用插入后的完整 id 列表） */
    orderedIds: string[];
}

/** 共享拖拽状态 */
export interface AppCardDragState {
    phase: AppCardDragPhase;
    /** 被拖拽应用快照（幽灵卡片渲染用） */
    app: AppItem | null;
    sourceCategoryId: string | null;
    /** 占位符当前所在分类 */
    targetCategoryId: string | null;
    /** 占位符在目标网格可见列表中的插入索引 */
    targetIndex: number;
    /** 指针视口坐标（幽灵卡片定位用） */
    ghostX: number;
    ghostY: number;
    /** 拖拽起始卡片尺寸（幽灵卡片大小） */
    cardWidth: number;
    cardHeight: number;
    /** 拖拽刚结束的短暂窗口期（抑制误触点击） */
    justEnded: boolean;
}

export interface AppCardDragManager {
    state: AppCardDragState;
    /** AppGrid pointerdown 入口：启动长按检测 */
    press: (app: AppItem, categoryId: string, point: DragPoint, cardSize: { width: number; height: number }) => void;
    /** 注册网格（commit 时读取其可见 id 顺序） */
    registerGrid: (categoryId: string, getOrderedIds: () => string[]) => void;
    /** 注销网格 */
    unregisterGrid: (categoryId: string) => void;
    /** 注册提交回调，返回取消函数 */
    onCommit: (callback: (payload: AppCardDragCommit) => void) => () => void;
    /** 重置拖拽状态（取消拖拽） */
    reset: () => void;
}

interface DragPoint {
    clientX: number;
    clientY: number;
}

const LONG_PRESS_DURATION = 300;
const MOVE_THRESHOLD = 15;
const JUST_ENDED_DURATION = 100;
/**
 * 落点变更的最小指针位移（迟滞阈值）：
 * 布局重排后浏览器会以相同坐标补发 pointermove，
 * 小于该位移的落点变更视为布局反馈抖动，直接忽略
 */
const DROP_TARGET_HYSTERESIS = 8;

/**
 * 从指针事件中提取坐标
 */
function getEventPoint(event: Event): DragPoint | null {
    if ('clientX' in event) {
        return { clientX: (event as MouseEvent).clientX, clientY: (event as MouseEvent).clientY };
    }
    return null;
}

/**
 * 创建卡片拖拽管理器
 */
export function createAppCardDragManager(): AppCardDragManager {
    const state = reactive<AppCardDragState>({
        phase: 'idle',
        app: null,
        sourceCategoryId: null,
        targetCategoryId: null,
        targetIndex: 0,
        ghostX: 0,
        ghostY: 0,
        cardWidth: 0,
        cardHeight: 0,
        justEnded: false,
    });

    /** 网格注册表：分类 ID → 可见 id 顺序读取器 */
    const grids = new Map<string, () => string[]>();
    const commitCallbacks = new Set<(payload: AppCardDragCommit) => void>();

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let justEndedTimer: ReturnType<typeof setTimeout> | null = null;
    let startPoint: DragPoint | null = null;
    /** 上一次实际应用落点变更时的指针坐标（迟滞锚点） */
    let lastAppliedPoint: DragPoint | null = null;
    let listenersController: AbortController | null = null;

    /**
     * 重置拖拽状态（取消或完成拖拽后调用）
     */
    function reset(): void {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        unbindDocumentListeners();
        startPoint = null;
        lastAppliedPoint = null;
        state.phase = 'idle';
        state.app = null;
        state.sourceCategoryId = null;
        state.targetCategoryId = null;
        state.targetIndex = 0;
        if (typeof document !== 'undefined') {
            document.body.classList.remove('is-dragging-cards');
        }
    }

    /**
     * 计算插入索引：指针命中卡片时按垂直中点前/后；未命中取最近中心卡片
     */
    function computeInsertIndex(grid: HTMLElement, point: DragPoint): number {
        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.app-card'));
        if (cards.length === 0) return 0;

        const hit = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null;
        const hitCard = hit?.closest('.app-card') as HTMLElement | null;
        if (hitCard && grid.contains(hitCard)) {
            const rect = hitCard.getBoundingClientRect();
            const index = cards.indexOf(hitCard);
            return point.clientY < rect.top + rect.height / 2 ? index : index + 1;
        }

        // 指针落在卡片间隙：找中心最近的卡片按中点前/后
        let closestIndex = 0;
        let closestRect: DOMRect | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;
        cards.forEach((card, index) => {
            const rect = card.getBoundingClientRect();
            const distance = Math.hypot(
                point.clientX - (rect.left + rect.width / 2),
                point.clientY - (rect.top + rect.height / 2)
            );
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
                closestRect = rect;
            }
        });
        if (!closestRect) return 0;
        const rect: DOMRect = closestRect;
        return point.clientY < rect.top + rect.height / 2 ? closestIndex : closestIndex + 1;
    }

    /**
     * 命中测试并更新落点（未命中任何网格时保持上一次目标）
     *
     * 防抖说明：占位符实时参与布局，插入后网格重排会使指针下方的元素变化，
     * 若据此重算落点会形成「移动 → 重排 → 再移动」的反馈循环（占位符来回闪）。
     * 通过占位符命中守卫 + 移动迟滞两层防护消除。
     */
    function updateDropTarget(point: DragPoint): void {
        if (typeof document === 'undefined' || !('elementFromPoint' in document)) return;
        const hit = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null;

        // 指针位于占位符上方：保持当前落点，不用其邻居反推索引
        if (hit?.closest('.app-grid__placeholder')) return;

        const grid = hit?.closest('.app-grid') as HTMLElement | null;
        if (!grid) return;
        const categoryId = grid.dataset.category;
        if (!categoryId || !grids.has(categoryId)) return;

        const index = computeInsertIndex(grid, point);

        // 落点未变化时无需处理
        if (categoryId === state.targetCategoryId && index === state.targetIndex) {
            return;
        }

        // 移动迟滞：距上次应用变更的位移过小（如布局重排后的同坐标补发事件），忽略
        if (
            lastAppliedPoint &&
            Math.hypot(point.clientX - lastAppliedPoint.clientX, point.clientY - lastAppliedPoint.clientY) <
                DROP_TARGET_HYSTERESIS
        ) {
            return;
        }

        state.targetCategoryId = categoryId;
        state.targetIndex = index;
        lastAppliedPoint = point;
    }

    /**
     * 落下提交：组装目标网格最终顺序并触发回调
     */
    function commit(): void {
        const { app, sourceCategoryId, targetCategoryId, targetIndex } = state;
        if (!app || !sourceCategoryId || !targetCategoryId) return;
        const getOrderedIds = grids.get(targetCategoryId);
        if (!getOrderedIds) return;

        const base = getOrderedIds().filter((id) => id !== app.id);
        const index = Math.min(Math.max(targetIndex, 0), base.length);
        const orderedIds = [...base.slice(0, index), app.id, ...base.slice(index)];

        markJustEnded();
        const payload: AppCardDragCommit = {
            appId: app.id,
            sourceCategoryId,
            targetCategoryId,
            orderedIds,
        };
        commitCallbacks.forEach((callback) => callback(payload));
    }

    /**
     * 标记拖拽刚结束，短暂抑制卡片点击
     */
    function markJustEnded(): void {
        if (justEndedTimer) {
            clearTimeout(justEndedTimer);
        }
        state.justEnded = true;
        justEndedTimer = setTimeout(() => {
            justEndedTimer = null;
            state.justEnded = false;
        }, JUST_ENDED_DURATION);
    }

    function handlePointerMove(event: Event): void {
        const point = getEventPoint(event);
        if (!point) return;

        if (state.phase === 'pressing') {
            // 按压期间移动超过阈值则取消长按
            if (startPoint && Math.hypot(point.clientX - startPoint.clientX, point.clientY - startPoint.clientY) > MOVE_THRESHOLD) {
                reset();
            }
            return;
        }

        if (state.phase !== 'dragging') return;
        state.ghostX = point.clientX;
        state.ghostY = point.clientY;
        updateDropTarget(point);
    }

    function handlePointerUp(): void {
        if (state.phase === 'dragging') {
            commit();
        }
        reset();
    }

    function handleCancel(): void {
        reset();
    }

    function handleKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            reset();
        }
    }

    function bindDocumentListeners(): void {
        unbindDocumentListeners();
        listenersController = new AbortController();
        const { signal } = listenersController;
        document.addEventListener('pointermove', handlePointerMove, { signal });
        document.addEventListener('pointerup', handlePointerUp, { signal });
        document.addEventListener('pointercancel', handleCancel, { signal });
        document.addEventListener('keydown', handleKeydown, { signal });
        window.addEventListener('blur', handleCancel, { signal });
    }

    function unbindDocumentListeners(): void {
        if (listenersController) {
            listenersController.abort();
            listenersController = null;
        }
    }

    /**
     * AppGrid pointerdown 入口：记录快照并启动长按检测
     */
    function press(
        app: AppItem,
        categoryId: string,
        point: DragPoint,
        cardSize: { width: number; height: number }
    ): void {
        reset();

        state.phase = 'pressing';
        state.app = app;
        state.sourceCategoryId = categoryId;
        state.targetCategoryId = categoryId;
        state.targetIndex = 0;
        state.ghostX = point.clientX;
        state.ghostY = point.clientY;
        state.cardWidth = cardSize.width;
        state.cardHeight = cardSize.height;
        startPoint = point;
        lastAppliedPoint = point;

        bindDocumentListeners();

        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            state.phase = 'dragging';
            document.body.classList.add('is-dragging-cards');
        }, LONG_PRESS_DURATION);
    }

    function registerGrid(categoryId: string, getOrderedIds: () => string[]): void {
        grids.set(categoryId, getOrderedIds);
    }

    function unregisterGrid(categoryId: string): void {
        grids.delete(categoryId);
    }

    function onCommit(callback: (payload: AppCardDragCommit) => void): () => void {
        commitCallbacks.add(callback);
        return () => {
            commitCallbacks.delete(callback);
        };
    }

    return {
        state,
        press,
        registerGrid,
        unregisterGrid,
        onCommit,
        reset,
    };
}

/** 全局单例 */
const globalManager = createAppCardDragManager();

/**
 * 获取共享的卡片拖拽管理器
 */
export function useAppCardDrag(): AppCardDragManager {
    return globalManager;
}

export default useAppCardDrag;
