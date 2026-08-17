/**
 * syncMerge.util 三方合并工具测试
 * 覆盖合并规则表全部分支：仅一端修改、双改冲突（本地优先）、删除 vs 修改、
 * 新增并集、顺序保持，以及忽略键序的深比较。
 */
import { describe, it, expect } from 'vitest';
import {
    stableStringify,
    deepEqual,
    mergeById,
    mergeAppNavigatorData,
    mergeUserUiLib,
    mergeSyncData
} from '@/utils/syncMerge.util';
import { STORAGE_KEYS } from '@/types/storage';
import type { AppNavigatorData, AppItem, Category } from '@/types/app';
import type { UserUiLib } from '@/types/ui';

interface TestItem {
    id: string;
    name: string;
    extra?: number;
}

function item(id: string, name: string, extra?: number): TestItem {
    return extra === undefined ? { id, name } : { id, name, extra };
}

describe('stableStringify / deepEqual', () => {
    it('stableStringify 忽略对象键序', () => {
        const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
        const b = { c: { x: 2, y: 1 }, a: 2, b: 1 };
        expect(stableStringify(a)).toBe(stableStringify(b));
    });

    it('deepEqual 对键序不同但内容相同的对象返回 true', () => {
        expect(deepEqual({ id: 'a', name: 'A' }, { name: 'A', id: 'a' })).toBe(true);
    });

    it('deepEqual 对内容不同的对象返回 false', () => {
        expect(deepEqual({ id: 'a', name: 'A' }, { id: 'a', name: 'B' })).toBe(false);
        expect(deepEqual({ id: 'a' }, { id: 'a', name: 'A' })).toBe(false);
    });

    it('deepEqual 对数组顺序敏感', () => {
        expect(deepEqual([1, 2], [2, 1])).toBe(false);
        expect(deepEqual([1, 2], [1, 2])).toBe(true);
    });

    it('deepEqual 处理 null 与嵌套数组', () => {
        expect(deepEqual(null, null)).toBe(true);
        expect(deepEqual(null, {})).toBe(false);
        expect(deepEqual([{ a: [1, { b: 2 }] }], [{ a: [1, { b: 2 }] }])).toBe(true);
    });
});

describe('mergeById 修改分支', () => {
    const base = [item('a', 'A'), item('b', 'B')];

    it('双方都未修改时保留本地项', () => {
        const result = mergeById(base, [...base.map((i) => ({ ...i }))], [...base.map((i) => ({ ...i }))]);
        expect(result).toEqual(base);
    });

    it('仅本地修改时采用本地版本', () => {
        const local = [item('a', 'A-local'), item('b', 'B')];
        const remote = [item('a', 'A'), item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.find((i) => i.id === 'a')?.name).toBe('A-local');
    });

    it('仅远端修改时采用远端版本', () => {
        const local = [item('a', 'A'), item('b', 'B')];
        const remote = [item('a', 'A-remote'), item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.find((i) => i.id === 'a')?.name).toBe('A-remote');
    });

    it('两端都修改且内容相同时任取其一（结果一致）', () => {
        const local = [item('a', 'A-same'), item('b', 'B')];
        const remote = [{ name: 'A-same', id: 'a' } as TestItem, item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.find((i) => i.id === 'a')?.name).toBe('A-same');
    });

    it('两端都修改且内容不同（冲突）时本地优先', () => {
        const local = [item('a', 'A-local'), item('b', 'B')];
        const remote = [item('a', 'A-remote'), item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.find((i) => i.id === 'a')?.name).toBe('A-local');
    });

    it('修改判定忽略对象键序', () => {
        // remote 仅键序不同，不视为修改
        const local = [item('a', 'A-local'), item('b', 'B')];
        const remote = [{ name: 'A', id: 'a' } as TestItem, { name: 'B', id: 'b' } as TestItem];
        const result = mergeById(base, local, remote);
        expect(result.find((i) => i.id === 'a')?.name).toBe('A-local');
    });
});

describe('mergeById 删除分支', () => {
    const base = [item('a', 'A'), item('b', 'B')];

    it('本地删除、远端未改时删除该项', () => {
        const local = [item('b', 'B')];
        const remote = [item('a', 'A'), item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.map((i) => i.id)).toEqual(['b']);
    });

    it('远端删除、本地未改时删除该项', () => {
        const local = [item('a', 'A'), item('b', 'B')];
        const remote = [item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.map((i) => i.id)).toEqual(['b']);
    });

    it('两端都删除时删除该项', () => {
        const result = mergeById(base, [item('b', 'B')], [item('b', 'B')]);
        expect(result.map((i) => i.id)).toEqual(['b']);
    });

    it('本地删除、远端修改（冲突）时本地优先：删除生效', () => {
        const local = [item('b', 'B')];
        const remote = [item('a', 'A-remote'), item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.map((i) => i.id)).toEqual(['b']);
    });

    it('远端删除、本地修改（冲突）时本地优先：保留本地版本', () => {
        const local = [item('a', 'A-local'), item('b', 'B')];
        const remote = [item('b', 'B')];
        const result = mergeById(base, local, remote);
        expect(result.map((i) => i.id)).toEqual(['a', 'b']);
        expect(result.find((i) => i.id === 'a')?.name).toBe('A-local');
    });
});

describe('mergeById 新增分支', () => {
    it('仅本地新增时采用本地新增项', () => {
        const base = [item('a', 'A')];
        const local = [item('a', 'A'), item('n', 'N-local')];
        const remote = [item('a', 'A')];
        const result = mergeById(base, local, remote);
        expect(result.map((i) => i.id)).toEqual(['a', 'n']);
    });

    it('仅远端新增时采用远端新增项并追加到末尾', () => {
        const base = [item('a', 'A')];
        const local = [item('a', 'A')];
        const remote = [item('a', 'A'), item('n', 'N-remote')];
        const result = mergeById(base, local, remote);
        expect(result.map((i) => i.id)).toEqual(['a', 'n']);
        expect(result[1].name).toBe('N-remote');
    });

    it('两端同 id 新增且内容不同（冲突）时本地优先', () => {
        const base: TestItem[] = [];
        const local = [item('n', 'N-local')];
        const remote = [item('n', 'N-remote')];
        const result = mergeById(base, local, remote);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('N-local');
    });
});

describe('mergeById 顺序与 base 为空', () => {
    it('输出保留本地顺序，远端新增项追加到末尾', () => {
        const base = [item('a', 'A'), item('b', 'B'), item('c', 'C')];
        // 本地调整了顺序
        const local = [item('c', 'C'), item('a', 'A'), item('b', 'B')];
        // 远端在头部/中间插入新项
        const remote = [item('r1', 'R1'), item('a', 'A'), item('r2', 'R2'), item('b', 'B'), item('c', 'C')];
        const result = mergeById(base, local, remote);
        expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b', 'r1', 'r2']);
    });

    it('base 为 null 时按空快照处理：本地与远端做并集', () => {
        const local = [item('a', 'A'), item('b', 'B-local')];
        const remote = [item('b', 'B-remote'), item('c', 'C')];
        const result = mergeById(null, local, remote);
        // 同 id（b）视为两端新增冲突，本地优先；c 为远端新增追加末尾
        expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c']);
        expect(result.find((i) => i.id === 'b')?.name).toBe('B-local');
    });

    it('local / remote 为 null/undefined 时不报错', () => {
        expect(mergeById(null, null, null)).toEqual([]);
        expect(mergeById(null, [item('a', 'A')], undefined)).toEqual([item('a', 'A')]);
        expect(mergeById(null, undefined, [item('a', 'A')])).toEqual([item('a', 'A')]);
    });
});

describe('mergeAppNavigatorData', () => {
    const cat = (id: string, name: string): Category => ({ id, name });
    const app = (id: string, name: string): AppItem => ({ id, name, url: 'https://example.com', category: 'c1' });

    it('categories 与 apps 分别按 id 合并', () => {
        const base: AppNavigatorData = { categories: [cat('c1', '分类')], apps: [app('a1', '站点')] };
        const local: AppNavigatorData = { categories: [cat('c1', '分类-本地')], apps: [app('a1', '站点')] };
        const remote: AppNavigatorData = { categories: [cat('c1', '分类')], apps: [app('a1', '站点-远端'), app('a2', '远端新增')] };

        const result = mergeAppNavigatorData(base, local, remote);
        expect(result.categories[0].name).toBe('分类-本地');
        expect(result.apps.map((a) => a.id)).toEqual(['a1', 'a2']);
        expect(result.apps[0].name).toBe('站点-远端');
    });

    it('任一侧为 null/undefined 时按空数据处理', () => {
        const result = mergeAppNavigatorData(null, undefined, { categories: [cat('c1', '分类')], apps: [] });
        expect(result.categories).toHaveLength(1);
        expect(result.apps).toEqual([]);
    });
});

describe('mergeUserUiLib', () => {
    it('categories 与 items 分别按 id 合并', () => {
        const base: UserUiLib = {
            categories: [{ id: 'uc1', name: '图标分类' }],
            items: [{ id: 'i1', name: '图标', url: 'icon.svg', category: 'uc1' }]
        };
        const local: UserUiLib = {
            categories: [{ id: 'uc1', name: '图标分类' }],
            items: [
                { id: 'i1', name: '图标-本地', url: 'icon.svg', category: 'uc1' },
                { id: 'i2', name: '本地新增', url: 'a.svg', category: 'uc1' }
            ]
        };
        const remote: UserUiLib = {
            categories: [{ id: 'uc1', name: '图标分类-远端' }, { id: 'uc2', name: '远端新增分类' }],
            items: [{ id: 'i1', name: '图标', url: 'icon.svg', category: 'uc1' }]
        };

        const result = mergeUserUiLib(base, local, remote);
        // 分类仅远端修改 → 采用远端；远端新增分类追加
        expect(result.categories.map((c) => c.id)).toEqual(['uc1', 'uc2']);
        expect(result.categories[0].name).toBe('图标分类-远端');
        // 图标项仅本地修改 → 本地优先；本地新增保留
        expect(result.items.map((i) => i.id)).toEqual(['i1', 'i2']);
        expect(result.items[0].name).toBe('图标-本地');
    });
});

describe('mergeSyncData', () => {
    const app = (id: string, name: string): AppItem => ({ id, name, url: 'https://example.com', category: 'c1' });

    it('按同步键合并站点数据与用户图标库', () => {
        const base = {
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [app('a1', 'A')] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        };
        const local = {
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [app('a1', 'A-local')] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        };
        const remote = {
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [app('a1', 'A'), app('a2', 'A2')] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        };

        const merged = mergeSyncData(base, local, remote);
        const data = merged[STORAGE_KEYS.MAIN_DATA] as AppNavigatorData;
        expect(data.apps.map((a) => a.id)).toEqual(['a1', 'a2']);
        expect(data.apps[0].name).toBe('A-local');
        expect(merged[STORAGE_KEYS.USER_UI_LIB]).toEqual({ categories: [], items: [] });
    });

    it('base 为 null（首次同步）时本地与远端做并集，互不覆盖', () => {
        const local = {
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [app('l1', '本地站点')] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        };
        const remote = {
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [app('r1', '远端站点')] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        };

        const merged = mergeSyncData(null, local, remote);
        const data = merged[STORAGE_KEYS.MAIN_DATA] as AppNavigatorData;
        expect(data.apps.map((a) => a.id)).toEqual(['l1', 'r1']);
    });

    it('远端缺少某个同步键时按空数据处理', () => {
        const local = {
            [STORAGE_KEYS.MAIN_DATA]: { categories: [], apps: [app('a1', 'A')] },
            [STORAGE_KEYS.USER_UI_LIB]: { categories: [], items: [] }
        };
        const merged = mergeSyncData(null, local, {});
        const data = merged[STORAGE_KEYS.MAIN_DATA] as AppNavigatorData;
        expect(data.apps).toHaveLength(1);
        expect(merged[STORAGE_KEYS.USER_UI_LIB]).toEqual({ categories: [], items: [] });
    });
});
