/**
 * useDragSort 单元测试
 *
 * 覆盖长按检测、拖拽移动、结束回调、禁用状态、自定义 ID 与清理逻辑。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import {
    useDragSort,
    type UseDragSortOptions,
    type UseDragSortReturn,
} from '../useDragSort';

interface TestContext {
    result: UseDragSortReturn;
    onStart: ReturnType<typeof vi.fn>;
    onMove: ReturnType<typeof vi.fn>;
    onEnd: ReturnType<typeof vi.fn>;
    container: HTMLElement;
    items: HTMLElement[];
    wrapper: ReturnType<typeof mount>;
}

function createContainer(itemCount = 3): { container: HTMLElement; items: HTMLElement[] } {
    const container = document.createElement('div');
    container.className = 'sortable-container';
    container.style.position = 'relative';
    container.style.width = '300px';
    container.style.height = '300px';

    const items: HTMLElement[] = [];
    for (let i = 0; i < itemCount; i++) {
        const item = document.createElement('div');
        item.className = 'sortable-item';
        item.dataset.id = `item-${i}`;
        item.textContent = `Item ${i}`;
        container.appendChild(item);
        items.push(item);
    }

    document.body.appendChild(container);
    return { container, items };
}

function mockLayout(container: HTMLElement, direction: 'vertical' | 'grid' = 'vertical'): void {
    const rectForIndex = (index: number): DOMRect => {
        if (direction === 'vertical') {
            return {
                top: index * 50,
                left: 0,
                width: 300,
                height: 50,
                right: 300,
                bottom: (index + 1) * 50,
                x: 0,
                y: index * 50,
                toJSON: () => undefined,
            } as DOMRect;
        }
        const row = Math.floor(index / 2);
        const col = index % 2;
        return {
            top: row * 50,
            left: col * 150,
            width: 150,
            height: 50,
            right: (col + 1) * 150,
            bottom: (row + 1) * 50,
            x: col * 150,
            y: row * 50,
            toJSON: () => undefined,
        } as DOMRect;
    };

    // getBoundingClientRect 基于元素当前 DOM 位置动态计算，
    // 模拟拖拽实时重排后的真实布局变化
    container.querySelectorAll<HTMLElement>('.sortable-item').forEach((item) => {
        item.getBoundingClientRect = vi.fn(() => {
            const liveItems = Array.from(container.querySelectorAll<HTMLElement>('.sortable-item'));
            return rectForIndex(liveItems.indexOf(item));
        });
    });

    document.elementFromPoint = vi.fn((x: number, y: number): Element | null => {
        const liveItems = Array.from(container.querySelectorAll<HTMLElement>('.sortable-item'));
        for (const item of liveItems) {
            const rect = item.getBoundingClientRect();
            if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
                return item;
            }
        }
        return null;
    });
}

function dispatchMouseEvent(
    type: 'mousedown' | 'mousemove' | 'mouseup' | 'mouseleave',
    target: HTMLElement,
    point: { clientX: number; clientY: number }
): void {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.clientX,
        clientY: point.clientY,
    });
    target.dispatchEvent(event);
}

async function advanceTime(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await nextTick();
    await Promise.resolve();
}

function mountDragSort(
    container: HTMLElement,
    options: Partial<UseDragSortOptions> = {}
): TestContext {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();

    const wrapper = mount(
        defineComponent({
            setup() {
                const containerRef = ref<HTMLElement | null>(container);
                const result = useDragSort({
                    containerRef,
                    itemSelector: '.sortable-item',
                    longPressDuration: 300,
                    moveThreshold: 10,
                    onStart,
                    onMove,
                    onEnd,
                    ...options,
                });
                return { result, onStart, onMove, onEnd };
            },
            render() {
                return h('div');
            },
        })
    );

    return {
        result: wrapper.vm.result as UseDragSortReturn,
        onStart: wrapper.vm.onStart,
        onMove: wrapper.vm.onMove,
        onEnd: wrapper.vm.onEnd,
        container,
        items: Array.from(container.querySelectorAll('.sortable-item')),
        wrapper,
    };
}

describe('useDragSort', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('长按应触发拖拽开始并更新状态', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onStart, onMove } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await nextTick();

        expect(result.isPressing.value).toBe(true);
        expect(result.isDragging.value).toBe(false);
        expect(onStart).not.toHaveBeenCalled();
        expect(onMove).not.toHaveBeenCalled();

        await advanceTime(300);

        expect(result.isDragging.value).toBe(true);
        expect(result.isPressing.value).toBe(false);
        expect(result.currentId.value).toBe('item-0');
        expect(result.fromIndex.value).toBe(0);
        expect(result.currentIndex.value).toBe(0);
        expect(result.position.value).not.toBeNull();
        expect(onStart).toHaveBeenCalledOnce();
    });

    it('短按抬起不应触发拖拽', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onStart, onEnd } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        dispatchMouseEvent('mouseup', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);

        expect(result.isDragging.value).toBe(false);
        expect(result.isPressing.value).toBe(false);
        expect(onStart).not.toHaveBeenCalled();
        expect(onEnd).not.toHaveBeenCalled();
    });

    it('移动超过阈值应取消长按', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onStart } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        dispatchMouseEvent('mousemove', container, { clientX: 50, clientY: 25 });
        await advanceTime(300);

        expect(result.isDragging.value).toBe(false);
        expect(result.isPressing.value).toBe(false);
        expect(onStart).not.toHaveBeenCalled();
    });

    it('拖拽移动应更新当前索引并触发 move 回调', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onMove } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        dispatchMouseEvent('mousemove', container, { clientX: 25, clientY: 75 });
        await nextTick();

        expect(result.currentIndex.value).toBe(1);
        expect(result.position.value?.overIndex).toBe(1);
        expect(result.position.value?.overElement).toBe(items[1]);
        expect(onMove).toHaveBeenCalled();
    });

    it('拖拽结束应触发 end 回调并携带起止索引', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result: _result, onEnd } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        dispatchMouseEvent('mousemove', container, { clientX: 25, clientY: 75 });
        dispatchMouseEvent('mouseup', container, { clientX: 25, clientY: 75 });
        await nextTick();

        expect(_result.isDragging.value).toBe(false);
        expect(onEnd).toHaveBeenCalledOnce();

        const endEvent = onEnd.mock.calls[0][0];
        expect(endEvent.fromIndex).toBe(0);
        expect(endEvent.toIndex).toBe(1);
        expect(endEvent.id).toBe('item-0');
        expect(endEvent.cancelled).toBe(false);
        expect(endEvent.position.overIndex).toBe(1);
    });

    it('canDrag 返回 false 时应阻止对应元素拖拽', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onStart } = mountDragSort(container, {
            canDrag: (el) => el.dataset.id !== 'item-0',
        });
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);

        expect(result.isDragging.value).toBe(false);
        expect(onStart).not.toHaveBeenCalled();

        dispatchMouseEvent('mousedown', items[1], { clientX: 25, clientY: 75 });
        await advanceTime(300);

        expect(result.isDragging.value).toBe(true);
        expect(result.currentId.value).toBe('item-1');
        expect(onStart).toHaveBeenCalledOnce();
    });

    it('自定义 getId 应读取指定属性作为 ID', async () => {
        const { container, items } = createContainer();
        items.forEach((item, i) => {
            delete item.dataset.id;
            item.dataset.customId = `custom-${i}`;
        });
        mockLayout(container);
        const { result, onStart } = mountDragSort(container, {
            getId: (el) => el.dataset.customId || null,
        });
        await nextTick();

        dispatchMouseEvent('mousedown', items[2], { clientX: 25, clientY: 125 });
        await advanceTime(300);

        expect(result.currentId.value).toBe('custom-2');
        expect(onStart).toHaveBeenCalledOnce();
        expect(onStart.mock.calls[0][0].id).toBe('custom-2');
    });

    it('onStart 返回 false 时应取消拖拽', async () => {
        const startSpy = vi.fn(() => false);
        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onEnd } = mountDragSort(container, {
            onStart: startSpy,
        });
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);

        expect(result.isDragging.value).toBe(false);
        expect(startSpy).toHaveBeenCalledOnce();
        expect(onEnd).not.toHaveBeenCalled();
    });

    it('disabled 为 true 时不应响应按下事件', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onStart } = mountDragSort(container, {
            disabled: true,
        });
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);

        expect(result.isDragging.value).toBe(false);
        expect(result.isPressing.value).toBe(false);
        expect(onStart).not.toHaveBeenCalled();
    });

    it('切换为 disabled 时应重置当前状态', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const disabled = ref(false);
        const { result } = mountDragSort(container, { disabled });
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        expect(result.isDragging.value).toBe(true);

        disabled.value = true;
        await nextTick();

        expect(result.isDragging.value).toBe(false);
        expect(result.currentId.value).toBeNull();
    });

    it('reset 应清空所有拖拽状态', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        expect(result.isDragging.value).toBe(true);

        result.reset();
        await nextTick();

        expect(result.isDragging.value).toBe(false);
        expect(result.isPressing.value).toBe(false);
        expect(result.currentId.value).toBeNull();
        expect(result.currentIndex.value).toBeNull();
        expect(result.fromIndex.value).toBeNull();
        expect(result.position.value).toBeNull();
    });

    it('mouseleave 应在拖拽时标记取消，并在抬起时以取消状态结束', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { onEnd } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        dispatchMouseEvent('mousemove', container, { clientX: 25, clientY: 75 });
        dispatchMouseEvent('mouseleave', container, { clientX: 25, clientY: 75 });
        dispatchMouseEvent('mouseup', container, { clientX: 25, clientY: 75 });
        await nextTick();

        expect(onEnd).toHaveBeenCalledOnce();
        expect(onEnd.mock.calls[0][0].cancelled).toBe(true);
        expect(onEnd.mock.calls[0][0].toIndex).toBe(0);
    });

    it('grid 方向应正确计算跨列索引', async () => {
        const { container, items } = createContainer(4);
        mockLayout(container, 'grid');
        const { result, onMove } = mountDragSort(container, { direction: 'grid' });
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 75, clientY: 25 });
        await advanceTime(300);
        dispatchMouseEvent('mousemove', container, { clientX: 225, clientY: 25 });
        await nextTick();

        expect(result.currentIndex.value).toBe(1);
        expect(onMove).toHaveBeenCalled();
    });

    it('容器引用变化时应重新绑定事件', async () => {
        const { container: containerA, items: itemsA } = createContainer();
        const { container: containerB, items: itemsB } = createContainer();
        mockLayout(containerA);
        mockLayout(containerB);

        const containerRef = ref<HTMLElement | null>(containerA);
        const onStart = vi.fn();

        mount(
            defineComponent({
                setup() {
                    useDragSort({
                        containerRef,
                        itemSelector: '.sortable-item',
                        longPressDuration: 300,
                        moveThreshold: 10,
                        onStart,
                    });
                    return {};
                },
                render() {
                    return h('div');
                },
            })
        );
        await nextTick();

        dispatchMouseEvent('mousedown', itemsA[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        expect(onStart).toHaveBeenCalledOnce();

        containerRef.value = containerB;
        await nextTick();

        dispatchMouseEvent('mousedown', itemsB[1], { clientX: 25, clientY: 75 });
        await advanceTime(300);
        expect(onStart).toHaveBeenCalledTimes(2);

        containerRef.value = null;
        await nextTick();

        dispatchMouseEvent('mousedown', itemsA[1], { clientX: 25, clientY: 75 });
        await advanceTime(300);
        expect(onStart).toHaveBeenCalledTimes(2);
    });

    it('不支持 PointerEvent 时应回退到 mouse 事件', async () => {
        const originalPointerEvent = window.PointerEvent;
        // @ts-expect-error 模拟不支持 PointerEvent 的环境
        window.PointerEvent = undefined;

        const { container, items } = createContainer();
        mockLayout(container);
        const { result, onStart } = mountDragSort(container);
        await nextTick();

        const event = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 25,
            clientY: 25,
        });
        items[0].dispatchEvent(event);
        await advanceTime(300);

        expect(result.isDragging.value).toBe(true);
        expect(onStart).toHaveBeenCalledOnce();

        window.PointerEvent = originalPointerEvent;
    });

    it('按压时即设置 currentId 以支持按压态样式', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { result } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[1], { clientX: 25, clientY: 75 });
        await nextTick();

        expect(result.isPressing.value).toBe(true);
        expect(result.currentId.value).toBe('item-1');
        expect(result.isDragging.value).toBe(false);
    });

    it('拖拽移动时应实时重排 DOM 顺序', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        dispatchMouseEvent('mousemove', container, { clientX: 25, clientY: 125 });
        await nextTick();

        const order = Array.from(container.querySelectorAll<HTMLElement>('.sortable-item')).map(
            (el) => el.dataset.id
        );
        expect(order).toEqual(['item-1', 'item-2', 'item-0']);
    });

    it('取消拖拽时应恢复原始 DOM 顺序', async () => {
        const { container, items } = createContainer();
        mockLayout(container);
        const { onEnd } = mountDragSort(container);
        await nextTick();

        dispatchMouseEvent('mousedown', items[0], { clientX: 25, clientY: 25 });
        await advanceTime(300);
        dispatchMouseEvent('mousemove', container, { clientX: 25, clientY: 125 });
        await nextTick();

        // 拖拽中 DOM 已被重排
        expect(
            Array.from(container.querySelectorAll<HTMLElement>('.sortable-item')).map((el) => el.dataset.id)
        ).toEqual(['item-1', 'item-2', 'item-0']);

        dispatchMouseEvent('mouseleave', container, { clientX: 25, clientY: 125 });
        dispatchMouseEvent('mouseup', container, { clientX: 25, clientY: 125 });
        await nextTick();

        expect(onEnd.mock.calls[0][0].cancelled).toBe(true);
        expect(
            Array.from(container.querySelectorAll<HTMLElement>('.sortable-item')).map((el) => el.dataset.id)
        ).toEqual(['item-0', 'item-1', 'item-2']);
    });
});
