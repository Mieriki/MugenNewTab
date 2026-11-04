/**
 * cardStyle.store 单元测试
 *
 * 覆盖默认值、同步镜像优先、非法值忽略、持久化与 :root CSS 变量的下发。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCardStyleStore } from '@/stores/cardStyle.store';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';

/** 读取 :root 上的某个变量 */
function readVar(name: string): string {
    return document.documentElement.style.getPropertyValue(name);
}

describe('cardStyle.store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
        document.documentElement.removeAttribute('style');
        vi.spyOn(storageManager, 'get').mockResolvedValue(null);
        vi.spyOn(storageManager, 'set').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.documentElement.removeAttribute('style');
    });

    it('默认值与默认 CSS 变量一致', () => {
        const store = useCardStyleStore();

        expect(store.opacity).toBeCloseTo(0.78);
        expect(store.blur).toBe(0);
        expect(store.radius).toBe(12);
        expect(store.shadow).toBe(1);
        expect(store.bordered).toBe(true);

        expect(readVar('--card-surface-opacity')).toBe('0.78');
        expect(readVar('--card-radius')).toBe('12px');
        expect(readVar('--card-shadow-alpha')).toBe('1');
        expect(readVar('--card-border-color')).toBe('var(--md-sys-color-outline-variant)');
        expect(readVar('--card-backdrop')).toBe('none');
    });

    it('首帧同步读取镜像，不必等 init 就生效', () => {
        localStorage.setItem(
            STORAGE_KEYS.CARD_STYLE,
            JSON.stringify({ opacity: 0.4, radius: 20, blur: 8, shadow: 0.5, bordered: false })
        );

        const store = useCardStyleStore();

        expect(store.initialized).toBe(false);
        expect(store.opacity).toBeCloseTo(0.4);
        expect(store.radius).toBe(20);
        expect(store.blur).toBe(8);
        expect(store.shadow).toBeCloseTo(0.5);
        expect(store.bordered).toBe(false);

        expect(readVar('--card-surface-opacity')).toBe('0.4');
        expect(readVar('--card-radius')).toBe('20px');
        expect(readVar('--card-backdrop')).toBe('blur(8px)');
        expect(readVar('--card-border-color')).toBe('transparent');
    });

    it('init 读取真实存储并回填同步镜像', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ radius: 4, blur: 16 });
        const writeMirror = vi.spyOn(storageManager, 'writeSyncMirror');

        const store = useCardStyleStore();
        await store.init();

        expect(store.radius).toBe(4);
        expect(store.blur).toBe(16);
        expect(store.initialized).toBe(true);
        expect(readVar('--card-radius')).toBe('4px');
        expect(readVar('--card-backdrop')).toBe('blur(16px)');
        expect(writeMirror).toHaveBeenCalledWith(
            STORAGE_KEYS.CARD_STYLE,
            expect.objectContaining({ radius: 4, blur: 16 })
        );
    });

    it('非法值被忽略，保留默认值', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({
            opacity: 5,
            radius: -1,
            blur: 999,
            shadow: -0.2,
            bordered: 'yes',
        });

        const store = useCardStyleStore();
        await store.init();

        expect(store.opacity).toBeCloseTo(0.78);
        expect(store.radius).toBe(12);
        expect(store.blur).toBe(0);
        expect(store.shadow).toBe(1);
        expect(store.bordered).toBe(true);
    });

    it('setter 会持久化并立即更新 CSS 变量', async () => {
        const store = useCardStyleStore();

        await store.setOpacity(0.5);
        await store.setRadius(18);
        await store.setShadow(0.25);
        await store.setBlur(6);
        await store.setBordered(false);

        expect(storageManager.set).toHaveBeenCalledWith(
            STORAGE_KEYS.CARD_STYLE,
            expect.objectContaining({ opacity: 0.5, radius: 18, shadow: 0.25, blur: 6, bordered: false })
        );
        expect(readVar('--card-surface-opacity')).toBe('0.5');
        expect(readVar('--card-radius')).toBe('18px');
        expect(readVar('--card-shadow-alpha')).toBe('0.25');
        expect(readVar('--card-backdrop')).toBe('blur(6px)');
        expect(readVar('--card-border-color')).toBe('transparent');
    });

    it('磨砂归零时输出 none，不再产生模糊合成层', async () => {
        const store = useCardStyleStore();

        await store.setBlur(10);
        expect(readVar('--card-backdrop')).toBe('blur(10px)');

        await store.setBlur(0);
        expect(readVar('--card-backdrop')).toBe('none');
    });

    it('setter 拒绝越界值', async () => {
        const store = useCardStyleStore();

        await store.setRadius(99);
        await store.setBlur(-3);
        await store.setOpacity(2);

        expect(store.radius).toBe(12);
        expect(store.blur).toBe(0);
        expect(store.opacity).toBeCloseTo(0.78);
    });

    it('reset 恢复全部默认值', async () => {
        vi.mocked(storageManager.get).mockResolvedValue({ opacity: 0.2, radius: 0, blur: 12, shadow: 0, bordered: false });
        const store = useCardStyleStore();
        await store.init();

        await store.reset();

        expect(store.opacity).toBeCloseTo(0.78);
        expect(store.blur).toBe(0);
        expect(store.radius).toBe(12);
        expect(store.shadow).toBe(1);
        expect(store.bordered).toBe(true);
        expect(readVar('--card-radius')).toBe('12px');
        expect(readVar('--card-backdrop')).toBe('none');
    });
});
