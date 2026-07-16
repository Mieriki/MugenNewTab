import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserAPI } from '@/services/browserApi.service';
import {
    StorageManager,
    storageManager,
    STORAGE_KEYS,
    STORAGE_EVENT,
    SYNC_MIRROR_KEYS,
} from '@/services/storage.service';

describe('StorageManager', () => {
    beforeEach(() => {
        localStorage.clear();
        // 模拟非扩展环境：确保 window.chrome/browser 不存在
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
    });

    it('应能写入并读取单个值', async () => {
        const manager = new StorageManager();
        await manager.set('foo', { bar: 1 });
        const value = await manager.get('foo');
        expect(value).toEqual({ bar: 1 });
    });

    it('应能批量写入并读取', async () => {
        const manager = new StorageManager();
        await manager.setMany({ a: 1, b: 'text' });
        const values = await manager.getMany(['a', 'b', 'c']);
        expect(values).toEqual({ a: 1, b: 'text', c: null });
    });

    it('应能删除存储项', async () => {
        const manager = new StorageManager();
        await manager.set('toDelete', 'value');
        await manager.remove('toDelete');
        const value = await manager.get('toDelete');
        expect(value).toBeNull();
    });

    it('读取不存在的键应返回 null', async () => {
        const manager = new StorageManager();
        const value = await manager.get('nonexistent');
        expect(value).toBeNull();
    });

    it('返回值应为深拷贝，修改不影响存储', async () => {
        const manager = new StorageManager();
        const original = { list: [1, 2] };
        await manager.set('original', original);
        const fetched = (await manager.get('original')) as { list: number[] };
        fetched.list.push(3);
        const again = (await manager.get('original')) as { list: number[] };
        expect(again.list).toEqual([1, 2]);
    });

    it('同步镜像键应写入 localStorage', async () => {
        const manager = new StorageManager();
        await manager.set('selectedTheme', 'material-rose');
        // browserApi.service.ts 的 localStorage 后端对字符串原样存储，不额外加引号
        expect(localStorage.getItem('selectedTheme')).toBe('material-rose');
        expect(SYNC_MIRROR_KEYS).toContain('selectedTheme');
    });

    it('同步镜像键写入失败时应回滚 localStorage', async () => {
        const manager = new StorageManager();
        localStorage.setItem('selectedTheme', '"old-theme"');

        // 模拟写入失败：第二次及以后的 setItem 调用抛出异常
        const originalSetItem = localStorage.setItem.bind(localStorage);
        let callCount = 0;
        const setItemSpy = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(function (this: Storage, key: string, value: string) {
                callCount++;
                // 第二次调用为后端持久化，模拟失败；其余调用放行
                if (callCount === 2) {
                    throw new Error('QuotaExceededError');
                }
                return originalSetItem.call(this, key, value);
            });

        try {
            await expect(manager.set('selectedTheme', 'new-theme')).rejects.toThrow();
            expect(localStorage.getItem('selectedTheme')).toBe('"old-theme"');
        } finally {
            setItemSpy.mockRestore();
        }
    });

    it('订阅应能监听到本地存储事件', async () => {
        const manager = new StorageManager();
        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);

        await manager.set('eventKey', 'eventValue');

        expect(listener).toHaveBeenCalled();
        const changes = listener.mock.calls[0][0] as Record<string, { newValue: unknown }>;
        expect(changes.eventKey?.newValue).toBe('eventValue');

        unsubscribe();
    });

    it('取消订阅后不应再收到事件', async () => {
        const manager = new StorageManager();
        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);
        unsubscribe();

        await manager.set('afterUnsub', 123);

        expect(listener).not.toHaveBeenCalled();
    });

    it('手动触发的 storage 事件也应被订阅接收', () => {
        const manager = new StorageManager();
        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);

        window.dispatchEvent(
            new StorageEvent('storage', {
                key: 'manualKey',
                newValue: '"manualValue"',
                oldValue: null,
            })
        );

        expect(listener).toHaveBeenCalled();
        const changes = listener.mock.calls[0][0] as Record<string, { newValue: unknown }>;
        expect(changes.manualKey?.newValue).toBe('manualValue');

        unsubscribe();
    });

    it('导出常量应符合原项目键名', () => {
        expect(STORAGE_KEYS.MAIN_DATA).toBe('appNavigator_data');
        expect(STORAGE_KEYS.USER_UI_LIB).toBe('appNavigator_user_uiLib');
        expect(STORAGE_KEYS.DATA_UPDATED_AT).toBe('appNavigator_dataUpdatedAt');
        expect(STORAGE_EVENT).toBe('mugen-storage-change');
    });

    it('单例应可正常使用', async () => {
        await storageManager.set('singletonKey', 'singletonValue');
        const value = await storageManager.get('singletonKey');
        expect(value).toBe('singletonValue');
    });
});
