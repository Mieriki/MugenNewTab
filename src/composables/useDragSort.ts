/**
 * useDragSort
 * 长按拖拽排序逻辑（分类导航 / 应用卡片）
 *
 * 通过监听 pointer / mouse / touch 事件实现长按检测；
 * 拖拽过程中实时 insertBefore 重排 DOM（与原项目 js/app.js 行为一致），
 * 取消时还原到原始位置；落下后由调用组件按 DOM 顺序提交数据。
 */

import {
    ref,
    watch,
    onMounted,
    onUnmounted,
    toValue,
    type Ref,
    type MaybeRefOrGetter
} from 'vue';

/** 拖拽方向：vertical 用于分类导航，grid 用于应用卡片网格 */
export type DragSortDirection = 'vertical' | 'grid';

/** 当前拖拽位置信息 */
export interface DragSortPosition {
    /** 相对于视口的 X 坐标 */
    x: number;
    /** 相对于视口的 Y 坐标 */
    y: number;
    /** 原始 clientX */
    clientX: number;
    /** 原始 clientY */
    clientY: number;
    /** 当前指针下方的可排序元素 */
    overElement: HTMLElement | null;
    /** 当前指针下方的元素在列表中的索引，未命中时为 null */
    overIndex: number | null;
}

/** 拖拽开始事件 */
export interface DragSortStartEvent {
    element: HTMLElement;
    id: string;
    index: number;
    x: number;
    y: number;
}

/** 拖拽移动事件 */
export interface DragSortMoveEvent {
    element: HTMLElement;
    id: string;
    fromIndex: number;
    position: DragSortPosition;
}

/** 拖拽结束事件 */
export interface DragSortEndEvent {
    element: HTMLElement;
    id: string;
    fromIndex: number;
    toIndex: number;
    position: DragSortPosition;
    /** 是否因超出容器或未命中目标而取消排序 */
    cancelled: boolean;
}

/** useDragSort 配置项 */
export interface UseDragSortOptions {
    /** 容器元素引用 */
    containerRef: Ref<HTMLElement | null>;
    /** 可拖拽子元素选择器，如 '.nav-item' 或 '.app-card' */
    itemSelector: string;
    /** 拖拽方向，默认 'vertical' */
    direction?: DragSortDirection;
    /** 长按触发时长（毫秒），默认 500 */
    longPressDuration?: number;
    /** 移动取消阈值（像素），默认 10 */
    moveThreshold?: number;
    /** 是否禁用拖拽 */
    disabled?: MaybeRefOrGetter<boolean>;
    /** 自定义是否允许拖拽某元素，返回 false 则跳过 */
    canDrag?: (element: HTMLElement, event: Event) => boolean;
    /** 自定义从元素读取唯一标识，默认读取 data-id / data-app-id / data-category-id */
    getId?: (element: HTMLElement) => string | null;
    /** 拖拽开始回调，返回 false 可取消 */
    onStart?: (event: DragSortStartEvent) => void | boolean;
    /** 拖拽移动回调 */
    onMove?: (event: DragSortMoveEvent) => void;
    /** 拖拽结束回调 */
    onEnd?: (event: DragSortEndEvent) => void;
}

/** useDragSort 返回值 */
export interface UseDragSortReturn {
    /** 是否正在拖拽中 */
    isDragging: Ref<boolean>;
    /** 是否处于长按按压状态 */
    isPressing: Ref<boolean>;
    /** 当前拖拽项 ID */
    currentId: Ref<string | null>;
    /** 当前指针下方项的索引 */
    currentIndex: Ref<number | null>;
    /** 拖拽起始索引 */
    fromIndex: Ref<number | null>;
    /** 当前拖拽位置 */
    position: Ref<DragSortPosition | null>;
    /** 重置所有拖拽状态 */
    reset: () => void;
}

interface PointerPoint {
    clientX: number;
    clientY: number;
}

const DEFAULT_LONG_PRESS_DURATION = 500;
const DEFAULT_MOVE_THRESHOLD = 10;

/**
 * 从元素读取拖拽 ID
 */
function defaultGetId(element: HTMLElement): string | null {
    return (
        element.dataset.id ||
        element.dataset.appId ||
        element.dataset.categoryId ||
        null
    );
}

/**
 * 从 mouse / touch 事件中提取指针坐标
 */
function getPointerPoint(event: Event): PointerPoint | null {
    if ('touches' in event && (event as TouchEvent).touches.length > 0) {
        const touch = (event as TouchEvent).touches[0];
        return { clientX: touch.clientX, clientY: touch.clientY };
    }
    if ('changedTouches' in event && (event as TouchEvent).changedTouches.length > 0) {
        const touch = (event as TouchEvent).changedTouches[0];
        return { clientX: touch.clientX, clientY: touch.clientY };
    }
    if ('clientX' in event) {
        return {
            clientX: (event as MouseEvent).clientX,
            clientY: (event as MouseEvent).clientY
        };
    }
    return null;
}

/**
 * 计算两点距离
 */
function getDistance(a: PointerPoint, b: PointerPoint): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * 获取容器内所有可排序元素
 */
function getSortableItems(container: HTMLElement, itemSelector: string): HTMLElement[] {
    return Array.from(container.querySelectorAll(itemSelector));
}

/**
 * 根据指针坐标计算当前命中的元素与索引
 */
function resolveOverIndex(
    container: HTMLElement,
    itemSelector: string,
    point: PointerPoint,
    draggingElement: HTMLElement | null,
    direction: DragSortDirection
): { overElement: HTMLElement | null; overIndex: number | null } {
    const items = getSortableItems(container, itemSelector);
    if (items.length === 0) {
        return { overElement: null, overIndex: null };
    }

    // 优先通过 elementFromPoint 命中
    if (typeof document !== 'undefined' && 'elementFromPoint' in document) {
        const target = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null;
        if (target) {
            const overItem = target.closest(itemSelector) as HTMLElement | null;
            if (overItem) {
                const index = items.indexOf(overItem);
                if (index !== -1) {
                    return { overElement: overItem, overIndex: index };
                }
            }
        }
    }

    // 回退：找距离中心最近的元素
    let closest: { element: HTMLElement | null; distance: number } = {
        element: null,
        distance: Number.POSITIVE_INFINITY
    };
    for (const item of items) {
        if (item === draggingElement) continue;
        const rect = item.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance =
            direction === 'vertical'
                ? Math.abs(point.clientY - centerY)
                : Math.hypot(point.clientX - centerX, point.clientY - centerY);
        if (distance < closest.distance) {
            closest = { element: item, distance };
        }
    }

    const overElement = closest.element;
    const overIndex = overElement ? items.indexOf(overElement) : null;
    return { overElement, overIndex };
}

/**
 * 创建拖拽排序组合式函数
 */
export function useDragSort(options: UseDragSortOptions): UseDragSortReturn {
    const {
        containerRef,
        itemSelector,
        direction = 'vertical',
        longPressDuration = DEFAULT_LONG_PRESS_DURATION,
        moveThreshold = DEFAULT_MOVE_THRESHOLD,
        disabled = false,
        canDrag,
        getId = defaultGetId,
        onStart,
        onMove,
        onEnd
    } = options;

    const isDragging = ref(false);
    const isPressing = ref(false);
    const currentId = ref<string | null>(null);
    const currentIndex = ref<number | null>(null);
    const fromIndex = ref<number | null>(null);
    const position = ref<DragSortPosition | null>(null);

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let startPoint: PointerPoint | null = null;
    let currentElement: HTMLElement | null = null;
    /** 拖拽开始时元素原位的下一个兄弟节点，用于取消拖拽时还原 DOM 位置 */
    let originalNextSibling: Node | null = null;
    /** 跟随指针的拖拽幽灵（克隆节点） */
    let ghostElement: HTMLElement | null = null;
    /** 按下时指针在元素内的相对位置（幽灵跟随偏移） */
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    let abortedByLeave = false;
    let controller: AbortController | null = null;

    /**
     * 创建跟随指针的幽灵克隆
     */
    function createGhost(element: HTMLElement, point: PointerPoint): void {
        removeGhost();
        if (typeof document === 'undefined') return;

        const rect = element.getBoundingClientRect();
        grabOffsetX = point.clientX - rect.left;
        grabOffsetY = point.clientY - rect.top;

        const ghost = element.cloneNode(true) as HTMLElement;
        ghost.classList.add('drag-ghost');
        Object.assign(ghost.style, {
            position: 'fixed',
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            margin: '0',
            pointerEvents: 'none',
            zIndex: '10000',
            opacity: '0.9',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
            // 覆盖克隆节点继承的 transition/animation，保证幽灵实时跟手
            transition: 'none',
            animation: 'none',
        });
        document.body.appendChild(ghost);
        ghostElement = ghost;
    }

    /**
     * 按抓取偏移移动幽灵
     */
    function moveGhost(point: PointerPoint): void {
        if (!ghostElement) return;
        ghostElement.style.left = `${point.clientX - grabOffsetX}px`;
        ghostElement.style.top = `${point.clientY - grabOffsetY}px`;
    }

    /**
     * 移除幽灵
     */
    function removeGhost(): void {
        ghostElement?.remove();
        ghostElement = null;
    }

    /**
     * 重置所有内部状态
     */
    function reset(): void {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        isDragging.value = false;
        isPressing.value = false;
        currentId.value = null;
        currentIndex.value = null;
        fromIndex.value = null;
        position.value = null;
        startPoint = null;
        currentElement = null;
        originalNextSibling = null;
        removeGhost();
        abortedByLeave = false;
    }

    /**
     * 开始拖拽
     */
    function startDrag(point: PointerPoint): void {
        if (!currentElement) return;

        const container = containerRef.value;
        if (!container) return;

        const items = getSortableItems(container, itemSelector);
        const index = items.indexOf(currentElement);
        if (index === -1) return;

        const id = getId(currentElement);
        if (!id) return;

        const startEvent: DragSortStartEvent = {
            element: currentElement,
            id,
            index,
            x: point.clientX,
            y: point.clientY
        };

        if (onStart) {
            const result = onStart(startEvent);
            if (result === false) {
                reset();
                return;
            }
        }

        // 记录原始位置，拖拽取消时还原
        originalNextSibling = currentElement.nextSibling;

        // 创建跟随指针的幽灵克隆
        createGhost(currentElement, point);

        isDragging.value = true;
        isPressing.value = false;
        currentId.value = id;
        fromIndex.value = index;
        currentIndex.value = index;

        updatePosition(point);
    }

    /**
     * 更新当前位置并触发 move 回调
     *
     * 拖拽过程中按指针位置实时 insertBefore 重排 DOM，
     * 落下时调用组件直接读取 DOM 顺序提交。
     */
    function updatePosition(point: PointerPoint): void {
        const container = containerRef.value;
        if (!container || !currentElement) return;

        const { overElement, overIndex } = resolveOverIndex(
            container,
            itemSelector,
            point,
            currentElement,
            direction
        );

        // 实时重排：指针越过目标中点时，将拖拽元素移到目标前/后
        if (overElement && overElement !== currentElement && overElement.parentNode === container) {
            const rect = overElement.getBoundingClientRect();
            const after =
                direction === 'vertical'
                    ? point.clientY >= rect.top + rect.height / 2
                    : point.clientX >= rect.left + rect.width / 2;
            const reference = after ? overElement.nextSibling : overElement;
            if (reference !== currentElement) {
                container.insertBefore(currentElement, reference);
            }
        }

        // 幽灵跟随指针
        moveGhost(point);

        const pos: DragSortPosition = {
            x: point.clientX,
            y: point.clientY,
            clientX: point.clientX,
            clientY: point.clientY,
            overElement,
            overIndex
        };

        position.value = pos;
        currentIndex.value = overIndex ?? currentIndex.value;

        if (fromIndex.value !== null && onMove) {
            onMove({
                element: currentElement,
                id: currentId.value!,
                fromIndex: fromIndex.value,
                position: pos
            });
        }
    }

    /**
     * 结束拖拽
     */
    function endDrag(point: PointerPoint | null, cancelled: boolean): void {
        if (!currentElement || fromIndex.value === null) {
            reset();
            return;
        }

        const container = containerRef.value;
        let finalPosition: DragSortPosition | null = position.value;

        if (cancelled && container) {
            // 取消拖拽：还原到原始位置
            if (originalNextSibling && originalNextSibling.parentNode === container) {
                container.insertBefore(currentElement, originalNextSibling);
            } else if (!originalNextSibling) {
                container.appendChild(currentElement);
            }
        }

        // toIndex 取拖拽元素在当前 DOM 中的实际位置
        const items = container ? getSortableItems(container, itemSelector) : [];
        let toIndex = items.indexOf(currentElement);
        if (toIndex === -1) {
            toIndex = fromIndex.value;
        }

        if (point && container) {
            const { overElement, overIndex } = resolveOverIndex(
                container,
                itemSelector,
                point,
                currentElement,
                direction
            );
            finalPosition = {
                x: point.clientX,
                y: point.clientY,
                clientX: point.clientX,
                clientY: point.clientY,
                overElement,
                overIndex
            };
            position.value = finalPosition;
        }

        if (cancelled) {
            toIndex = fromIndex.value;
        }

        if (onEnd && finalPosition) {
            onEnd({
                element: currentElement,
                id: currentId.value!,
                fromIndex: fromIndex.value,
                toIndex,
                position: finalPosition,
                cancelled
            });
        }

        reset();
    }

    /**
     * pointerdown / mousedown / touchstart 处理
     */
    function handleStart(event: Event): void {
        if (toValue(disabled)) return;

        const container = containerRef.value;
        if (!container) return;

        const target = event.target as HTMLElement | null;
        if (!target) return;

        const item = target.closest(itemSelector) as HTMLElement | null;
        if (!item || !container.contains(item)) return;

        if (canDrag && !canDrag(item, event)) return;

        const point = getPointerPoint(event);
        if (!point) return;

        // 只响应主键（鼠标左键为 0）
        if ('button' in event && (event as MouseEvent).button !== 0) return;

        reset();

        currentElement = item;
        startPoint = point;
        // 按压即记录当前项 ID，供 pressing 按压态样式使用
        currentId.value = getId(item);
        isPressing.value = true;
        abortedByLeave = false;

        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            startDrag(point);
        }, longPressDuration);
    }

    /**
     * pointermove / mousemove / touchmove 处理
     */
    function handleMove(event: Event): void {
        const point = getPointerPoint(event);
        if (!point) return;

        if (isDragging.value) {
            // 触摸拖拽时阻止页面滚动
            if (event.type === 'touchmove') {
                event.preventDefault();
            }
            updatePosition(point);
            return;
        }

        if (!currentElement || !startPoint) return;

        const distance = getDistance(point, startPoint);
        if (distance > moveThreshold) {
            reset();
        }
    }

    /**
     * pointerup / mouseup / touchend 处理
     */
    function handleEnd(event: Event): void {
        const point = getPointerPoint(event);

        if (isDragging.value) {
            endDrag(point, abortedByLeave || point === null);
            return;
        }

        reset();
    }

    /**
     * pointerleave / mouseleave / touchcancel 处理
     */
    function handleCancel(): void {
        if (isDragging.value) {
            abortedByLeave = true;
            return;
        }
        reset();
    }

    /**
     * 绑定事件监听
     *
     * 优先使用 PointerEvent；不支持时回退到 mouse + touch 组合，
     * 避免同时绑定两套事件导致重复触发。
     */
    function bindEvents(container: HTMLElement): void {
        unbindEvents();

        controller = new AbortController();
        const { signal } = controller;
        const supportsPointer = typeof window !== 'undefined' && typeof window.PointerEvent === 'function';

        if (supportsPointer) {
            container.addEventListener('pointerdown', handleStart, { signal });
            container.addEventListener('pointermove', handleMove, { signal });
            container.addEventListener('pointerup', handleEnd, { signal });
            container.addEventListener('pointercancel', handleCancel, { signal });
            container.addEventListener('pointerleave', handleCancel, { signal });
        } else {
            // Mouse events
            container.addEventListener('mousedown', handleStart, { signal });
            container.addEventListener('mousemove', handleMove, { signal });
            container.addEventListener('mouseup', handleEnd, { signal });
            container.addEventListener('mouseleave', handleCancel, { signal });

            // Touch events
            container.addEventListener('touchstart', handleStart, { passive: true, signal });
            container.addEventListener(
                'touchmove',
                (event) => {
                    handleMove(event);
                },
                { passive: false, signal }
            );
            container.addEventListener('touchend', handleEnd, { signal });
            container.addEventListener('touchcancel', handleCancel, { signal });
        }
    }

    /**
     * 解绑事件监听
     */
    function unbindEvents(): void {
        if (controller) {
            controller.abort();
            controller = null;
        }
        reset();
    }

    /**
     * 当容器引用变化时重新绑定
     */
    function setup(): void {
        const container = containerRef.value;
        if (container) {
            bindEvents(container);
        } else {
            unbindEvents();
        }
    }

    onMounted(setup);

    onUnmounted(() => {
        unbindEvents();
    });

    watch(containerRef, setup);

    // 禁用状态变化时重置
    watch(
        () => toValue(disabled),
        (isDisabled) => {
            if (isDisabled) {
                reset();
            }
        }
    );

    return {
        isDragging,
        isPressing,
        currentId,
        currentIndex,
        fromIndex,
        position,
        reset
    };
}
