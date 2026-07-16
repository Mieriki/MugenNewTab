/**
 * useWallpaper Composable 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { BrowserAPI } from '@/services/browserApi.service';
import { useWallpaper, DEFAULT_WALLPAPER_SETTINGS } from '@/composables/useWallpaper';
import * as fileUtil from '@/utils/file.util';
import type { UseWallpaperReturn } from '@/composables/useWallpaper';

vi.mock('@/utils/file.util', async () => {
    const actual = await vi.importActual<typeof import('@/utils/file.util')>('@/utils/file.util');
    return {
        ...actual,
        fileToBase64: vi.fn(() => Promise.resolve('data:image/png;base64,mocked'))
    };
});

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function createMockFile(name: string, type: string, size: number): File {
    return new File(['x'.repeat(size)], name, { type });
}

function useSetup(options: { autoInit?: boolean } = {}) {
    let result!: UseWallpaperReturn;
    const wrapper = mount(
        defineComponent({
            setup() {
                result = useWallpaper(options);
                return {};
            },
            template: '<div></div>'
        })
    );
    return { result, wrapper };
}

describe('useWallpaper', () => {
    const wrappers: ReturnType<typeof mount>[] = [];

    beforeEach(() => {
        localStorage.clear();
        delete (window as unknown as { chrome?: unknown }).chrome;
        delete (window as unknown as { browser?: unknown }).browser;
        BrowserAPI.resetDetection();
        setActivePinia(createPinia());
        wrappers.length = 0;
    });

    afterEach(() => {
        wrappers.forEach(w => {
            if (w.exists?.()) {
                w.unmount();
            }
        });
        wrappers.length = 0;
        vi.restoreAllMocks();
    });

    it('挂载后应自动初始化并暴露响应式状态', async () => {
        const { result, wrapper } = useSetup();
        wrappers.push(wrapper);

        expect(result.initialized.value).toBe(false);

        await nextTick();
        await flushPromises();

        expect(result.initialized.value).toBe(true);
        expect(result.settings.value).toEqual(DEFAULT_WALLPAPER_SETTINGS);
        expect(result.imageData.value).toBeNull();
        expect(result.hasWallpaper.value).toBe(false);
    });

    it('autoInit: false 时不自动初始化', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await nextTick();
        await flushPromises();

        expect(result.initialized.value).toBe(false);
    });

    it('setUrl 应更新壁纸 URL 并持久化', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        await result.setUrl('https://example.com/bg.jpg');

        expect(result.effectiveUrl.value).toBe('https://example.com/bg.jpg');
        expect(result.hasWallpaper.value).toBe(true);
        expect(result.isLocalImage.value).toBe(false);
    });

    it('setLocalImage 应校验并上传图片', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        const file = createMockFile('bg.png', 'image/png', 100);

        await result.setLocalImage(file);

        expect(fileUtil.fileToBase64).toHaveBeenCalledWith(file);
        expect(result.isLocalImage.value).toBe(true);
        expect(result.effectiveUrl.value).toBe('data:image/png;base64,mocked');
    });

    it('非图片文件应被拒绝并记录错误', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        const file = createMockFile('doc.txt', 'text/plain', 100);

        await expect(result.setLocalImage(file)).rejects.toThrow('请选择图片文件');
        expect(result.error.value).toBe('请选择图片文件');
        expect(result.loading.value).toBe(false);
    });

    it('超过 5MB 的图片应被拒绝并记录错误', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        const file = createMockFile('big.png', 'image/png', 6 * 1024 * 1024);

        await expect(result.setLocalImage(file)).rejects.toThrow('不能超过');
        expect(result.error.value).toContain('不能超过');
    });

    it('setLocalImageData 应直接持久化图片数据', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        const data = {
            data: 'data:image/jpeg;base64,xyz',
            name: 'imported.jpg',
            type: 'image/jpeg',
            size: 2048,
            timestamp: 1700000000000
        };

        await result.setLocalImageData(data);

        expect(result.imageData.value).toEqual(data);
        expect(result.effectiveUrl.value).toBe(data.data);
        expect(result.isLocalImage.value).toBe(true);
    });

    it('removeWallpaper 应清空壁纸但保留视觉参数', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        await result.setUrl('https://example.com/bg.jpg');
        await result.setOpacity(0.5);
        await result.removeWallpaper();

        expect(result.hasWallpaper.value).toBe(false);
        expect(result.settings.value.url).toBe('');
        expect(result.settings.value.isLocalImage).toBe(false);
        expect(result.imageData.value).toBeNull();
        expect(result.settings.value.opacity).toBe(0.5);
    });

    it('reset 应恢复所有设置为默认值', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        await result.setUrl('https://example.com/bg.jpg');
        await result.setOpacity(0.5);
        await result.setBlur(10);

        await result.reset();

        expect(result.settings.value).toEqual(DEFAULT_WALLPAPER_SETTINGS);
        expect(result.imageData.value).toBeNull();
        expect(result.hasWallpaper.value).toBe(false);
    });

    it('视觉参数设置应分别生效', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        await result.setOpacity(0.7);
        await result.setBlur(8);
        await result.setOverlayOpacity(0.4);

        expect(result.settings.value.opacity).toBe(0.7);
        expect(result.settings.value.blur).toBe(8);
        expect(result.settings.value.overlayOpacity).toBe(0.4);
    });

    it('applySettings 应批量应用设置', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        await result.applySettings({ opacity: 0.6, blur: 3 });

        expect(result.settings.value.opacity).toBe(0.6);
        expect(result.settings.value.blur).toBe(3);
        expect(result.settings.value.url).toBe(DEFAULT_WALLPAPER_SETTINGS.url);
    });

    it('异步操作期间 loading 为 true，完成后为 false', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        const promise = result.setUrl('https://example.com/loading.jpg');
        expect(result.loading.value).toBe(true);

        await promise;
        expect(result.loading.value).toBe(false);
    });

    it('持久化失败时应设置 error 并回滚状态', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        await result.setUrl('https://example.com/original.jpg');

        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceeded');
        });

        await expect(result.setUrl('https://example.com/new.jpg')).rejects.toThrow('QuotaExceeded');
        expect(result.error.value).toContain('QuotaExceeded');
        expect(result.effectiveUrl.value).toBe('https://example.com/original.jpg');

        spy.mockRestore();
    });

    it('cleanup 应取消未完成的异步操作', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        const promise = result.setUrl('https://example.com/cancel.jpg');
        result.cleanup();

        await expect(promise).rejects.toThrow('已取消');
    });

    it('组件卸载时应自动 cleanup 并取消未完成的操作', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        const promise = result.setUrl('https://example.com/pending.jpg');
        wrapper.unmount();

        await expect(promise).rejects.toThrow('已取消');
    });

    it('wallpaperStyle 应根据当前设置生成样式对象', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();
        await result.setUrl('https://example.com/bg.jpg');
        await result.setOpacity(0.8);
        await result.setBlur(4);
        await result.setOverlayOpacity(0.2);

        expect(result.wallpaperStyle.value).toEqual({
            backgroundImage: 'url(https://example.com/bg.jpg)',
            opacity: '0.8',
            filter: 'blur(4px)',
            '--wallpaper-overlay-opacity': '0.2'
        });
    });

    it('未设置壁纸时 wallpaperStyle 背景为 none', async () => {
        const { result, wrapper } = useSetup({ autoInit: false });
        wrappers.push(wrapper);

        await result.init();

        expect(result.wallpaperStyle.value.backgroundImage).toBe('none');
        expect(result.wallpaperStyle.value.opacity).toBe('1');
    });
});
