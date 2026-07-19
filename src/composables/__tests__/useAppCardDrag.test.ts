/**
 * useAppCardDrag 单元测试
 *
 * 覆盖长按状态机、移动阈值取消、幽灵跟随与落点命中、
 * 跨网格提交载荷、Escape 取消与 justEnded 抑制窗口。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAppCardDragManager, type AppCardDragCommit } from '../useAppCardDrag';
import type { AppItem } from '@/types/app';

function createApp(id: string, category = 'cat_a'): AppItem {
    return {
        id,
        name: `应用 ${id}`,
        url: 'https://example.com',
        category,
        hidden: false,
    };
}

function createGrid(categoryId: string, cardIds: string[]): { grid: HTMLElement; cards: HTMLElement[] } {
    const grid = document.createElement('div');
    grid.className = 'app-grid';
    grid.dataset.category = categoryId;

    const cards = cardIds.map((id, index) => {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.dataset.appId = id;
        card.getBoundingClientRect = vi.fn(() => ({
            top: index * 80,
            left: 0,
            width: 300,
            height: 80,
            right: 300,
            bottom: (index + 1) * 80,
            x: 0,
            y: index * 80,
            toJSON: () => undefined,
        } as DOMRect));
        grid.appendChild(card);
        return card;
    });

    document.body.appendChild(grid);
    return { grid, cards };
}

function dispatchPointer(type: string, point: { clientX: number; clientY: number }): void {
    document.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...point }));
}

async function advanceTime(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
}

describe('useAppCardDrag', () => {
    let manager: ReturnType<typeof createAppCardDragManager>;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
        document.body.classList.remove('is-dragging-cards');
        manager = createAppCardDragManager();
    });

    afterEach(() => {
        manager.reset();
        vi.useRealTimers();
        document.body.innerHTML = '';
        document.body.classList.remove('is-dragging-cards');
        vi.restoreAllMocks();
    });

    it('长按 300ms 进入拖拽并记录快照', async () => {
        const app = createApp('a1');
        manager.press(app, 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });

        expect(manager.state.phase).toBe('pressing');
        expect(manager.state.app?.id).toBe('a1');
        expect(manager.state.ghostX).toBe(10);
        expect(manager.state.ghostY).toBe(20);
        expect(manager.state.cardWidth).toBe(300);

        await advanceTime(300);

        expect(manager.state.phase).toBe('dragging');
        expect(document.body.classList.contains('is-dragging-cards')).toBe(true);
    });

    it('按压期间移动超过阈值取消长按', async () => {
        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });

        dispatchPointer('pointermove', { clientX: 40, clientY: 20 });
        await advanceTime(300);

        expect(manager.state.phase).toBe('idle');
        expect(document.body.classList.contains('is-dragging-cards')).toBe(false);
    });

    it('按压期间抬起不触发提交', async () => {
        const onCommit = vi.fn();
        manager.onCommit(onCommit);
        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });

        dispatchPointer('pointerup', { clientX: 10, clientY: 20 });
        await advanceTime(400);

        expect(manager.state.phase).toBe('idle');
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('拖拽时幽灵跟随指针并命中目标网格计算落点', async () => {
        const { cards: cardsB } = createGrid('cat_b', ['b1', 'b2']);
        manager.registerGrid('cat_a', () => ['a2', 'a3']);
        manager.registerGrid('cat_b', () => ['b1', 'b2']);

        document.elementFromPoint = vi.fn(() => cardsB[1]);

        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });
        await advanceTime(300);

        // b2 矩形 top=80 height=80，中点 120；指针 y=130 位于下半区 → 插到 b2 之后（索引 2）
        dispatchPointer('pointermove', { clientX: 50, clientY: 130 });

        expect(manager.state.ghostX).toBe(50);
        expect(manager.state.ghostY).toBe(130);
        expect(manager.state.targetCategoryId).toBe('cat_b');
        expect(manager.state.targetIndex).toBe(2);
    });

    it('指针命中卡片上半区时插到其前', async () => {
        const { cards: cardsB } = createGrid('cat_b', ['b1', 'b2']);
        manager.registerGrid('cat_b', () => ['b1', 'b2']);

        document.elementFromPoint = vi.fn(() => cardsB[1]);

        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });
        await advanceTime(300);

        // b2 中点 120；指针 y=100 位于上半区 → 插到 b2 之前（索引 1）
        dispatchPointer('pointermove', { clientX: 50, clientY: 100 });

        expect(manager.state.targetIndex).toBe(1);
    });

    it('落下时提交目标网格最终顺序', async () => {
        const commits: AppCardDragCommit[] = [];
        manager.onCommit((payload) => commits.push(payload));

        const { cards: cardsB } = createGrid('cat_b', ['b1', 'b2']);
        // 模拟 AppGrid 行为：拖拽期间可见列表不含被拖应用
        manager.registerGrid('cat_a', () => ['a2', 'a3']);
        manager.registerGrid('cat_b', () => ['b1', 'b2']);

        document.elementFromPoint = vi.fn(() => cardsB[1]);

        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });
        await advanceTime(300);
        dispatchPointer('pointermove', { clientX: 50, clientY: 100 });
        dispatchPointer('pointerup', { clientX: 50, clientY: 100 });

        expect(commits).toHaveLength(1);
        expect(commits[0]).toEqual({
            appId: 'a1',
            sourceCategoryId: 'cat_a',
            targetCategoryId: 'cat_b',
            orderedIds: ['b1', 'a1', 'b2'],
        });

        // 提交后状态复位
        expect(manager.state.phase).toBe('idle');
        expect(manager.state.app).toBeNull();
        expect(document.body.classList.contains('is-dragging-cards')).toBe(false);

        // justEnded 窗口期后复位
        expect(manager.state.justEnded).toBe(true);
        await advanceTime(100);
        expect(manager.state.justEnded).toBe(false);
    });

    it('同网格落下按可见顺序插入被拖应用', async () => {
        const commits: AppCardDragCommit[] = [];
        manager.onCommit((payload) => commits.push(payload));

        const { cards } = createGrid('cat_a', ['a1', 'a3']);
        manager.registerGrid('cat_a', () => ['a1', 'a3']);

        document.elementFromPoint = vi.fn(() => cards[0]);

        manager.press(createApp('a2'), 'cat_a', { clientX: 10, clientY: 10 }, { width: 300, height: 80 });
        await advanceTime(300);

        // a1 中点 40；指针 y=50 位于下半区 → 插到 a1 之后（索引 1）
        dispatchPointer('pointermove', { clientX: 50, clientY: 50 });
        dispatchPointer('pointerup', { clientX: 50, clientY: 50 });

        expect(commits[0]?.orderedIds).toEqual(['a1', 'a2', 'a3']);
        expect(commits[0]?.sourceCategoryId).toBe('cat_a');
        expect(commits[0]?.targetCategoryId).toBe('cat_a');
    });

    it('Escape 取消拖拽且不提交', async () => {
        const onCommit = vi.fn();
        manager.onCommit(onCommit);

        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });
        await advanceTime(300);
        expect(manager.state.phase).toBe('dragging');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(manager.state.phase).toBe('idle');
        expect(onCommit).not.toHaveBeenCalled();
        expect(document.body.classList.contains('is-dragging-cards')).toBe(false);
    });

    it('命中网格内非卡片元素时保持上一次目标', async () => {
        createGrid('cat_unregistered', ['x1']);
        const { grid: gridB, cards: cardsB } = createGrid('cat_b', ['b1']);
        manager.registerGrid('cat_b', () => ['b1']);

        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });
        await advanceTime(300);

        document.elementFromPoint = vi.fn(() => cardsB[0]);
        dispatchPointer('pointermove', { clientX: 50, clientY: 10 });
        expect(manager.state.targetCategoryId).toBe('cat_b');

        // 命中未注册网格内的元素：目标保持 cat_b
        const outsider = document.createElement('div');
        gridB.appendChild(outsider);
        document.elementFromPoint = vi.fn(() => outsider);
        dispatchPointer('pointermove', { clientX: 60, clientY: 15 });
        expect(manager.state.targetCategoryId).toBe('cat_b');
    });

    it('指针位于占位符上方时保持当前落点', async () => {
        const { grid: gridB, cards: cardsB } = createGrid('cat_b', ['b1', 'b2']);
        // 网格中加入占位符元素（模拟拖拽中渲染的占位符）
        const placeholder = document.createElement('div');
        placeholder.className = 'app-grid__placeholder';
        gridB.insertBefore(placeholder, cardsB[1]);

        manager.registerGrid('cat_b', () => ['b1', 'b2']);

        manager.press(createApp('a1'), 'cat_a', { clientX: 10, clientY: 20 }, { width: 300, height: 80 });
        await advanceTime(300);

        // 先形成落点：命中 b2 下半区（中点 120）→ 索引 2
        document.elementFromPoint = vi.fn(() => cardsB[1]);
        dispatchPointer('pointermove', { clientX: 50, clientY: 130 });
        expect(manager.state.targetIndex).toBe(2);

        // 指针移到占位符上方：即使命中结果变化，落点也保持不变
        document.elementFromPoint = vi.fn(() => placeholder);
        dispatchPointer('pointermove', { clientX: 200, clientY: 200 });
        expect(manager.state.targetCategoryId).toBe('cat_b');
        expect(manager.state.targetIndex).toBe(2);
    });

    it('落点变更存在移动迟滞，小于阈值的位移被忽略', async () => {
        const { cards } = createGrid('cat_a', ['a1', 'a3']);
        manager.registerGrid('cat_a', () => ['a1', 'a3']);

        manager.press(createApp('a2'), 'cat_a', { clientX: 10, clientY: 10 }, { width: 300, height: 80 });
        await advanceTime(300);

        // a1 下半区（中点 40）→ 索引 1；距按下点(10,10) 位移充足，应用
        document.elementFromPoint = vi.fn(() => cards[0]);
        dispatchPointer('pointermove', { clientX: 50, clientY: 41 });
        expect(manager.state.targetIndex).toBe(1);

        // a1 上半区 → 候选索引 0；但距锚点(50,41) 仅约 4px，被迟滞拦截
        dispatchPointer('pointermove', { clientX: 53, clientY: 38 });
        expect(manager.state.targetIndex).toBe(1);

        // 位移超过阈值后应用新落点
        dispatchPointer('pointermove', { clientX: 60, clientY: 30 });
        expect(manager.state.targetIndex).toBe(0);
    });
});
