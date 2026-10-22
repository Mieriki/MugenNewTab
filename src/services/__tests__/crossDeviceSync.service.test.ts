/**
 * crossDeviceSync.service 单元测试
 *
 * 用内存 Map 替换本地存储与浏览器同步区，验证：
 *   - 启用时把凭据加密后推送（同步区里不能出现明文 Token）
 *   - 新设备凭口令还原登录状态
 *   - 登出 / 关闭开关时的清理行为
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { localStore, syncStore } = vi.hoisted(() => ({
    localStore: new Map<string, unknown>(),
    syncStore: new Map<string, unknown>()
}));

vi.mock('@/services/storage.service', () => ({
    storageManager: {
        get: vi.fn(async (key: string) => localStore.get(key) ?? null),
        setMany: vi.fn(async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) {
                if (value === null || value === undefined) {
                    localStore.delete(key);
                } else {
                    localStore.set(key, value);
                }
            }
        })
    }
}));

vi.mock('@/services/syncStorage.service', () => ({
    syncGet: vi.fn(async (key: string) => syncStore.get(key) ?? null),
    syncSet: vi.fn(async (key: string, value: unknown) => {
        syncStore.set(key, value);
    }),
    syncRemove: vi.fn(async (key: string) => {
        syncStore.delete(key);
    }),
    isNativeSyncStorage: vi.fn(() => false),
    getSyncAreaStatus: vi.fn(() => ({ native: false, kind: 'local' })),
    subscribeSyncAreaChanges: vi.fn(() => () => {})
}));

import {
    enableCrossDevice,
    disableCrossDevice,
    restoreCrossDeviceAuth,
    pushCrossDeviceAuth,
    pullCrossDeviceAuth,
    getCrossDeviceState,
    getCrossDeviceStatus,
    hasRemoteCrossDeviceAuth,
    clearRemoteCrossDeviceAuth
} from '../crossDeviceSync.service';

const REMOTE_AUTH_KEY = 'mugen_cross_device_auth';
const LOCAL_PASSPHRASE_KEY = 'appNavigator_crossDevice_passphrase';

const AUTH = { token: 'ghp_cross_device_token_123', provider: 'github' };
const PASSPHRASE = 'my-sync-passphrase';

describe('crossDeviceSync.service', () => {
    beforeEach(() => {
        localStore.clear();
        syncStore.clear();
    });

    it('初始状态为未启用', async () => {
        await expect(getCrossDeviceState()).resolves.toEqual({ enabled: false, hasPassphrase: false });
        await expect(hasRemoteCrossDeviceAuth()).resolves.toBe(false);
    });

    it('启用后保存开关与口令，并把密文写入同步区', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);

        await expect(getCrossDeviceState()).resolves.toEqual({ enabled: true, hasPassphrase: true });
        expect(localStore.get(LOCAL_PASSPHRASE_KEY)).toBe(PASSPHRASE);

        const remote = syncStore.get(REMOTE_AUTH_KEY) as Record<string, unknown>;
        expect(remote).toBeTruthy();
        expect(remote.alg).toBe('AES-GCM');
        // 同步区里不能出现明文 Token
        expect(JSON.stringify(remote)).not.toContain(AUTH.token);
        await expect(hasRemoteCrossDeviceAuth()).resolves.toBe(true);
    });

    it('口令过短时拒绝启用', async () => {
        await expect(enableCrossDevice('123', AUTH)).rejects.toThrow('同步密码至少');
        await expect(getCrossDeviceState()).resolves.toEqual({ enabled: false, hasPassphrase: false });
    });

    it('未登录时启用不会清掉同步区已有密文', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);
        const before = syncStore.get(REMOTE_AUTH_KEY);
        expect(before).toBeTruthy();

        // 模拟新设备：本机没有 Token，只输入了同一口令
        localStore.clear();
        await enableCrossDevice(PASSPHRASE, null);

        expect(syncStore.get(REMOTE_AUTH_KEY)).toEqual(before);
    });

    it('关闭后清除开关、口令与同步区密文', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);
        await disableCrossDevice();

        await expect(getCrossDeviceState()).resolves.toEqual({ enabled: false, hasPassphrase: false });
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(false);
        await expect(hasRemoteCrossDeviceAuth()).resolves.toBe(false);
    });

    it('新设备用正确口令可还原登录状态', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);

        // 模拟另一台设备：只有同步区的密文，没有本地口令
        localStore.clear();

        const restored = await restoreCrossDeviceAuth(PASSPHRASE);
        expect(restored).toEqual({ token: AUTH.token, provider: 'github' });
        // 还原成功后本机会记住开关与口令，便于后续自动推送
        await expect(getCrossDeviceState()).resolves.toEqual({ enabled: true, hasPassphrase: true });
    });

    it('新设备口令错误时抛出可读错误', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);
        localStore.clear();

        await expect(restoreCrossDeviceAuth('wrong-passphrase')).rejects.toThrow('同步密码不正确');
    });

    it('同步区没有密文时还原返回 null', async () => {
        await expect(restoreCrossDeviceAuth(PASSPHRASE)).resolves.toBeNull();
    });

    it('未启用时推送不写入同步区', async () => {
        await pushCrossDeviceAuth(AUTH);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(false);
    });

    it('登出（推送 null）会清掉同步区密文', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(true);

        await pushCrossDeviceAuth(null);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(false);
    });

    it('pullCrossDeviceAuth 在启用且口令可用时还原凭据', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);

        await expect(pullCrossDeviceAuth()).resolves.toEqual({ token: AUTH.token, provider: 'github' });
    });

    it('pullCrossDeviceAuth 在未启用时返回 null', async () => {
        await expect(pullCrossDeviceAuth()).resolves.toBeNull();
    });

    it('口令丢失（本地数据被清）时 pullCrossDeviceAuth 返回 null', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);
        localStore.delete(LOCAL_PASSPHRASE_KEY);

        await expect(pullCrossDeviceAuth()).resolves.toBeNull();
    });

    it('已登录时启用会立即推送，返回 pushed=true', async () => {
        const result = await enableCrossDevice(PASSPHRASE, AUTH);

        expect(result.pushed).toBe(true);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(true);
    });

    it('未登录时启用只保存开关与口令，返回 pushed=false（登录后补推）', async () => {
        const result = await enableCrossDevice(PASSPHRASE, null);

        expect(result.pushed).toBe(false);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(false);
        await expect(getCrossDeviceState()).resolves.toEqual({ enabled: true, hasPassphrase: true });
    });

    it('未登录先设密码、登录后 pushCrossDeviceAuth 能补推凭据', async () => {
        await enableCrossDevice(PASSPHRASE, null);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(false);

        // 模拟登录成功后 CloudSyncService 调用补推
        await expect(pushCrossDeviceAuth(AUTH)).resolves.toBe(true);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(true);
    });

    it('缺口令时 pushCrossDeviceAuth 返回 false 且不写同步区', async () => {
        await enableCrossDevice(PASSPHRASE, null);
        localStore.delete(LOCAL_PASSPHRASE_KEY);

        await expect(pushCrossDeviceAuth(AUTH)).resolves.toBe(false);
        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(false);
    });

    it('getCrossDeviceStatus 汇总开关、口令与远端密文状态', async () => {
        await expect(getCrossDeviceStatus()).resolves.toEqual({
            enabled: false,
            hasPassphrase: false,
            nativeSync: false,
            remoteAvailable: false,
            remoteMeta: null
        });

        await enableCrossDevice(PASSPHRASE, AUTH);
        const status = await getCrossDeviceStatus();
        expect(status.enabled).toBe(true);
        expect(status.hasPassphrase).toBe(true);
        expect(status.remoteAvailable).toBe(true);
        // 元信息用于界面显示「凭据来自哪台设备、何时推送」
        expect(status.remoteMeta?.provider).toBe('github');
        expect(typeof status.remoteMeta?.device).toBe('string');
        expect(status.remoteMeta?.updatedAt).toBeGreaterThan(0);
    });

    it('推送时写入元信息，关闭时一并清除', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);
        expect(syncStore.has('mugen_cross_device_auth_meta')).toBe(true);

        await disableCrossDevice();
        expect(syncStore.has('mugen_cross_device_auth_meta')).toBe(false);
    });

    it('clearRemoteCrossDeviceAuth 只清远端密文，保留本机开关', async () => {
        await enableCrossDevice(PASSPHRASE, AUTH);
        await clearRemoteCrossDeviceAuth();

        expect(syncStore.has(REMOTE_AUTH_KEY)).toBe(false);
        await expect(getCrossDeviceState()).resolves.toEqual({ enabled: true, hasPassphrase: true });
    });
});
