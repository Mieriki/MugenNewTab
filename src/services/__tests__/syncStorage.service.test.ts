/**
 * syncStorage.service 测试
 *
 * 覆盖两条路径：
 *   - 非扩展环境（jsdom）：降级为 localStorage 模拟，且能正确报告 native=false；
 *   - 扩展环境（注入 chrome.storage.sync 回调风格 API）：读写删走原生同步区，
 *     并能订阅同步区变更。
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
    syncGet,
    syncSet,
    syncRemove,
    isNativeSyncStorage,
    getSyncAreaStatus,
    subscribeSyncAreaChanges
} from '../syncStorage.service';

interface ChromeSyncMock {
    store: Record<string, unknown>;
    listeners: Array<(changes: Record<string, { newValue?: unknown }>, areaName: string) => void>;
}

function installChromeSyncMock(): ChromeSyncMock {
    const store: Record<string, unknown> = {};
    const listeners: ChromeSyncMock['listeners'] = [];

    (window as unknown as { chrome?: unknown }).chrome = {
        storage: {
            sync: {
                get: (key: string, cb: (items: Record<string, unknown>) => void) => {
                    cb(key in store ? { [key]: store[key] } : {});
                },
                set: (items: Record<string, unknown>, cb: () => void) => {
                    Object.assign(store, items);
                    cb();
                },
                remove: (key: string, cb: () => void) => {
                    delete store[key];
                    cb();
                }
            },
            onChanged: {
                addListener: (listener: ChromeSyncMock['listeners'][number]) => {
                    listeners.push(listener);
                },
                removeListener: (listener: ChromeSyncMock['listeners'][number]) => {
                    const index = listeners.indexOf(listener);
                    if (index >= 0) listeners.splice(index, 1);
                }
            }
        },
        runtime: {}
    };

    return { store, listeners };
}

describe('syncStorage.service', () => {
    afterEach(() => {
        delete (window as unknown as { chrome?: unknown }).chrome;
        localStorage.clear();
    });

    it('非扩展环境降级到 localStorage，并报告 native=false', async () => {
        expect(isNativeSyncStorage()).toBe(false);
        expect(getSyncAreaStatus()).toEqual({ native: false, kind: 'local' });

        await syncSet('demo', { hello: 'world' });
        await expect(syncGet('demo')).resolves.toEqual({ hello: 'world' });
        // 落在带前缀的 localStorage 键上，避免污染正式数据
        expect(localStorage.getItem('__mnt_sync__:demo')).toBe('{"hello":"world"}');

        await syncRemove('demo');
        await expect(syncGet('demo')).resolves.toBeNull();
    });

    it('扩展环境走原生 storage.sync 回调 API', async () => {
        const mock = installChromeSyncMock();

        expect(isNativeSyncStorage()).toBe(true);
        expect(getSyncAreaStatus()).toEqual({ native: true, kind: 'native' });

        await syncSet('token', { cipher: 'abc' });
        expect(mock.store.token).toEqual({ cipher: 'abc' });
        await expect(syncGet('token')).resolves.toEqual({ cipher: 'abc' });
        // 原生路径不写 localStorage 降级键
        expect(localStorage.getItem('__mnt_sync__:token')).toBeNull();

        await syncRemove('token');
        expect('token' in mock.store).toBe(false);
    });

    it('订阅同步区变更：只响应 sync 区域的指定键', async () => {
        const mock = installChromeSyncMock();
        const received: boolean[] = [];

        const unsubscribe = subscribeSyncAreaChanges((changes) => {
            received.push('mugen_cross_device_auth' in changes);
        });

        // local 区域的变更不应触发
        for (const listener of mock.listeners) {
            listener({ mugen_cross_device_auth: { newValue: 1 } }, 'local');
        }
        expect(received).toHaveLength(0);

        for (const listener of mock.listeners) {
            listener({ mugen_cross_device_auth: { newValue: { v: 1 } } }, 'sync');
        }
        expect(received).toEqual([true]);

        unsubscribe();
        expect(mock.listeners).toHaveLength(0);
    });

    it('非扩展环境下订阅是空操作', () => {
        const unsubscribe = subscribeSyncAreaChanges(() => {});
        expect(typeof unsubscribe).toBe('function');
        expect(() => unsubscribe()).not.toThrow();
    });
});
