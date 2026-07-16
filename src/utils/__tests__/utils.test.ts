import { describe, it, expect, vi } from 'vitest';
import {
    generateId,
    generateAppId,
    generateCategoryId,
    generateUiCategoryId,
    generateUiItemId
} from '../id.util';
import { escapeHtml, escapeAttr } from '../escape.util';
import { isImageIcon, createImageWithFallback, createMonochromeImage } from '../image.util';
import { adjustColor, hexToRgba } from '../color.util';
import { debounce, throttle } from '../debounce.util';
import { formatFileSize, validateFileSize } from '../file.util';

describe('id.util', () => {
    it('应生成非空唯一 ID', () => {
        const id = generateId();
        expect(id).toBeTruthy();
        expect(id).not.toBe(generateId());
    });

    it('应生成带正确前缀的 ID', () => {
        expect(generateAppId()).toMatch(/^app_/);
        expect(generateCategoryId()).toMatch(/^cat_/);
        expect(generateUiCategoryId()).toMatch(/^uicat_/);
        expect(generateUiItemId()).toMatch(/^uiitem_/);
    });
});

describe('escape.util', () => {
    it('应转义 HTML 特殊字符', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
        );
    });

    it('应处理 null 与 undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('应转义属性中的反引号', () => {
        expect(escapeAttr('`onclick`')).toContain('&#96;');
    });
});

describe('image.util', () => {
    it('应识别图片图标', () => {
        expect(isImageIcon('https://example.com/icon.png')).toBe(true);
        expect(isImageIcon('./image/icons/menu.svg')).toBe(true);
        expect(isImageIcon('data:image/svg+xml;base64,xxx')).toBe(true);
        expect(isImageIcon('rocket')).toBe(false);
    });

    it('生成带回退的图片标签不应包含 emoji', () => {
        const html = createImageWithFallback('test.png', '测试');
        expect(html).toContain('src="test.png"');
        expect(html).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    });

    it('生成单色图片标签应包含样式', () => {
        const html = createMonochromeImage('test.svg', '测试', 'filter: invert(1)');
        expect(html).toContain('filter: invert(1)');
    });
});

describe('color.util', () => {
    it('应正确调整颜色亮度', () => {
        expect(adjustColor('#000000', 100)).toBe('#ffffff');
        expect(adjustColor('#ffffff', -100)).toBe('#000000');
    });

    it('应正确转换 HEX 到 RGBA', () => {
        expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    });
});

describe('debounce.util', () => {
    it('防抖应延迟执行', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 100);
        debounced();
        debounced();
        debounced();
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('节流应在限制内只执行一次', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const throttled = throttle(fn, 100);
        throttled();
        throttled();
        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(100);
        throttled();
        expect(fn).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});

describe('file.util', () => {
    it('应格式化文件大小', () => {
        expect(formatFileSize(0)).toBe('0 B');
        expect(formatFileSize(1024)).toBe('1.00 KB');
        expect(formatFileSize(5 * 1024 * 1024)).toBe('5.00 MB');
    });

    it('应校验文件大小', () => {
        const file = new File(['a'], 'test.txt', { type: 'text/plain' });
        expect(validateFileSize(file, 10)).toBe(true);
        expect(validateFileSize(file, 0)).toBe(false);
    });
});
