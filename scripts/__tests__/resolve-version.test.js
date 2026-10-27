/**
 * resolve-version.js 单元测试
 *
 * 重点覆盖曾经导致 1.0.0.110 → 1.0.0.1 降级事故的路径：
 * 显式版本不得低于已发布版本、自动递增保持前缀、跨段比较正确。
 */
import { describe, it, expect } from 'vitest';
import {
    parse,
    compare,
    valid,
    nextAfter,
    latestVersion,
    resolve,
    FIRST_VERSION
} from '../resolve-version';

describe('resolve-version 纯函数', () => {
    it('parse 按数字段拆分', () => {
        expect(parse('1.0.0.110')).toEqual([1, 0, 0, 110]);
        expect(parse('1.0.1.0')).toEqual([1, 0, 1, 0]);
    });

    it('compare 逐段比较，缺段按 0 处理', () => {
        expect(compare('1.0.1.0', '1.0.0.110')).toBeGreaterThan(0);
        expect(compare('1.0.0.110', '1.0.1.0')).toBeLessThan(0);
        expect(compare('1.0.0', '1.0.0.0')).toBe(0);
        expect(compare('1.0.0.109', '1.0.0.110')).toBeLessThan(0);
        expect(compare('2.0.0', '1.99.99')).toBeGreaterThan(0);
    });

    it('valid 校验段数、取值范围与前导零', () => {
        expect(valid('1.0.0.1')).toBe(true);
        expect(valid('1.0.1.0')).toBe(true);
        expect(valid('65535')).toBe(true);
        // 超过 4 段
        expect(valid('1.0.0.0.1')).toBe(false);
        // 前导零
        expect(valid('1.0.0.01')).toBe(false);
        // 超出 Chrome 上限
        expect(valid('1.0.0.65536')).toBe(false);
        // 非数字 / 空串
        expect(valid('1.0.x')).toBe(false);
        expect(valid('')).toBe(false);
    });

    it('nextAfter 末段 +1 并保持前缀', () => {
        expect(nextAfter('1.0.0.110')).toBe('1.0.0.111');
        expect(nextAfter('1.0.1.0')).toBe('1.0.1.1');
        expect(nextAfter('1.0')).toBe('1.1');
    });

    it('nextAfter 末段达到 65535 时抛错', () => {
        expect(() => nextAfter('1.0.0.65535')).toThrow(/65535/);
    });
});

describe('resolve-version 仓库集成', () => {
    it('latestVersion 取本地 tag 与 manifest 中的最大版本', () => {
        // 仓库当前 tag 含 v1.0.1.0（高于 manifest 里的 1.0.0.1）
        expect(latestVersion()).toBe('1.0.1.0');
    });

    it('自动解析在最新版本上末段 +1（1.0.1.0 → 1.0.1.1）', () => {
        expect(resolve(null)).toBe('1.0.1.1');
        expect(FIRST_VERSION).toBe('1.0.0.100');
    });

    it('显式版本大于最新版本时通过', () => {
        expect(resolve('1.0.2.0')).toBe('1.0.2.0');
        expect(resolve('1.0.1.1')).toBe('1.0.1.1');
    });

    it('显式版本等于最新版本时拒绝', () => {
        expect(() => resolve('1.0.1.0')).toThrow(/必须大于/);
    });

    it('显式版本低于最新版本（降级事故路径）时拒绝', () => {
        // 这正是 1.0.0.110 之后误发 1.0.0.1 的场景
        expect(() => resolve('1.0.0.1')).toThrow(/必须大于/);
        expect(() => resolve('1.0.0.110')).toThrow(/必须大于/);
    });

    it('显式版本格式非法时拒绝', () => {
        expect(() => resolve('1.0.0.01')).toThrow(/格式非法/);
    });
});
