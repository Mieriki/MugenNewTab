/**
 * 云同步三方合并工具
 * 以「上次同步成功的快照」为 base，比对 base / local / remote 三方，
 * 按 id 增量合并站点数据与用户图标库，冲突时本地优先。
 */

import type { AppNavigatorData, AppItem, Category } from '@/types/app';
import type { UiCategory, UserUiLib } from '@/types/ui';
import { STORAGE_KEYS } from '@/types/storage';

/** 同步快照数据（键为存储键名） */
export type SyncSnapshot = Record<string, unknown>;

/**
 * 稳定序列化：对象键排序后 JSON.stringify，用于深比较（避免键序差异误判）
 */
export function stableStringify(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort()) {
            sorted[key] = sortKeys(source[key]);
        }
        return sorted;
    }
    return value;
}

/** 深比较两个值是否相等（忽略对象键序） */
export function deepEqual(a: unknown, b: unknown): boolean {
    return stableStringify(a) === stableStringify(b);
}

function toMap<T extends { id: string }>(items: T[] | null | undefined): Map<string, T> {
    const map = new Map<string, T>();
    for (const item of items ?? []) {
        map.set(item.id, item);
    }
    return map;
}

/**
 * 以 id 为键的三方合并
 *
 * 规则（冲突一律本地优先）：
 * - 仅一端修改 → 采用修改端
 * - 两端都修改：内容相同任取其一，不同取本地
 * - 一端删除、另一端未改 → 删除
 * - 一端删除、另一端修改 → 本地优先（本地删则删，本地改则保留本地版本）
 * - 仅一端新增 → 采用新增端；两端同 id 新增取本地
 *
 * 顺序：保留本地数组顺序，远端新增项追加到末尾。
 */
export function mergeById<T extends { id: string }>(
    base: T[] | null | undefined,
    local: T[] | null | undefined,
    remote: T[] | null | undefined
): T[] {
    const baseMap = toMap(base);
    const remoteMap = toMap(remote);
    const result: T[] = [];
    const handled = new Set<string>();

    for (const item of local ?? []) {
        const id = item.id;
        handled.add(id);
        const baseItem = baseMap.get(id);
        const remoteItem = remoteMap.get(id);

        if (!baseItem) {
            // 本地新增（或两端同 id 新增，本地优先）
            result.push(item);
            continue;
        }

        const localChanged = !deepEqual(baseItem, item);
        if (!remoteItem) {
            // 远端删除：本地未改则删除，本地已改则本地优先保留
            if (localChanged) {
                result.push(item);
            }
            continue;
        }

        const remoteChanged = !deepEqual(baseItem, remoteItem);
        if (!localChanged && remoteChanged) {
            result.push(remoteItem);
        } else {
            // 仅本地改 / 都没改 / 双改冲突（本地优先）
            result.push(item);
        }
    }

    for (const item of remote ?? []) {
        if (handled.has(item.id)) continue;
        if (!baseMap.has(item.id)) {
            // 远端新增
            result.push(item);
        }
        // 在 base 中但本地没有 → 本地删除，本地优先（删除生效）
    }

    return result;
}

/** 合并站点主数据（分类 + 站点） */
export function mergeAppNavigatorData(
    base: AppNavigatorData | null | undefined,
    local: AppNavigatorData | null | undefined,
    remote: AppNavigatorData | null | undefined
): AppNavigatorData {
    return {
        categories: mergeById<Category>(base?.categories, local?.categories, remote?.categories),
        apps: mergeById<AppItem>(base?.apps, local?.apps, remote?.apps)
    };
}

/** 合并用户图标库（分类 + 图标项） */
export function mergeUserUiLib(
    base: UserUiLib | null | undefined,
    local: UserUiLib | null | undefined,
    remote: UserUiLib | null | undefined
): UserUiLib {
    return {
        categories: mergeById<UiCategory>(base?.categories, local?.categories, remote?.categories),
        items: mergeById<UserUiLib['items'][number]>(base?.items, local?.items, remote?.items)
    };
}

/**
 * 合并整个同步快照（站点数据 + 用户图标库）
 * base/local/remote 均为以存储键名为键的快照；base 为空（null）时视为空快照，做并集合并。
 */
export function mergeSyncData(
    base: SyncSnapshot | null,
    local: SyncSnapshot,
    remote: SyncSnapshot
): SyncSnapshot {
    return {
        [STORAGE_KEYS.MAIN_DATA]: mergeAppNavigatorData(
            base?.[STORAGE_KEYS.MAIN_DATA] as AppNavigatorData | null | undefined,
            local[STORAGE_KEYS.MAIN_DATA] as AppNavigatorData | null | undefined,
            remote[STORAGE_KEYS.MAIN_DATA] as AppNavigatorData | null | undefined
        ),
        [STORAGE_KEYS.USER_UI_LIB]: mergeUserUiLib(
            base?.[STORAGE_KEYS.USER_UI_LIB] as UserUiLib | null | undefined,
            local[STORAGE_KEYS.USER_UI_LIB] as UserUiLib | null | undefined,
            remote[STORAGE_KEYS.USER_UI_LIB] as UserUiLib | null | undefined
        )
    };
}
