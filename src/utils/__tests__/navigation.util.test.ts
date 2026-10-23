/**
 * navigation.util 单元测试
 *
 * 覆盖两种跳转方式的分发、默认值、空地址保护与类型守卫。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openUrl, isLinkOpenMode, DEFAULT_OPEN_MODE } from '@/utils/navigation.util';

describe('navigation.util', () => {
    /** jsdom 的 location.assign 会真的尝试导航并抛错，这里整体替换掉 */
    const assignSpy = vi.fn();

    beforeEach(() => {
        vi.spyOn(window, 'open').mockImplementation(() => null);
        vi.stubGlobal('location', { ...window.location, assign: assignSpy });
        assignSpy.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('默认按新标签页打开', () => {
        openUrl('https://github.com');

        expect(window.open).toHaveBeenCalledWith('https://github.com', '_blank');
        expect(assignSpy).not.toHaveBeenCalled();
    });

    it('current-tab 时覆盖当前标签页，不再新开', () => {
        openUrl('https://github.com', 'current-tab');

        expect(assignSpy).toHaveBeenCalledWith('https://github.com');
        expect(window.open).not.toHaveBeenCalled();
    });

    it('空地址不触发任何跳转', () => {
        openUrl('', 'current-tab');
        openUrl('   ', 'new-tab');

        expect(window.open).not.toHaveBeenCalled();
        expect(assignSpy).not.toHaveBeenCalled();
    });

    it('地址首尾空白被裁剪', () => {
        openUrl('  https://a.com  ');

        expect(window.open).toHaveBeenCalledWith('https://a.com', '_blank');
    });

    it('isLinkOpenMode 只接受两种合法取值', () => {
        expect(isLinkOpenMode('new-tab')).toBe(true);
        expect(isLinkOpenMode('current-tab')).toBe(true);
        expect(isLinkOpenMode('same-window')).toBe(false);
        expect(isLinkOpenMode(undefined)).toBe(false);
        expect(isLinkOpenMode(null)).toBe(false);
    });

    it('默认值为 new-tab', () => {
        expect(DEFAULT_OPEN_MODE).toBe('new-tab');
    });
});
