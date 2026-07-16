import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useStorage } from '../useStorage';
import { storageManager, STORAGE_EVENT } from '@/services/storage.service';
import type { StorageValue } from '@/types/storage';

interface Person {
    name: string;
    age: number;
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useStorage', () => {
    it('初始化时使用默认值，并在加载完成后停止 loading', async () => {
        const { value, isLoading, error } = useStorage({
            key: 'test_default',
            defaultValue: 'hello',
        });

        expect(isLoading.value).toBe(true);
        await flushPromises();

        expect(value.value).toBe('hello');
        expect(isLoading.value).toBe(false);
        expect(error.value).toBeNull();
    });

    it('immediate=false 时不自动加载', async () => {
        localStorage.setItem('test_no_immediate', JSON.stringify('saved'));

        const { value, isLoading, refresh } = useStorage({
            key: 'test_no_immediate',
            defaultValue: 'default',
            immediate: false,
        });

        await flushPromises();
        expect(value.value).toBe('default');
        expect(isLoading.value).toBe(false);

        await refresh();
        expect(value.value).toBe('saved');
    });

    it('加载已持久化的值', async () => {
        localStorage.setItem('test_persisted', JSON.stringify('world'));

        const { value } = useStorage({
            key: 'test_persisted',
            defaultValue: 'hello',
        });
        await flushPromises();

        expect(value.value).toBe('world');
    });

    it('set 更新 ref 并持久化到 storage', async () => {
        const { value, set } = useStorage({
            key: 'test_set',
            defaultValue: 0,
        });
        await flushPromises();

        await set(42);

        expect(value.value).toBe(42);
        expect(JSON.parse(localStorage.getItem('test_set')!)).toBe(42);
    });

    it('syncGet 同步读取当前存储值；syncSet 立即更新状态', async () => {
        const { value, syncGet, syncSet } = useStorage<string>({
            key: 'test_sync',
            defaultValue: 'a',
        });
        await flushPromises();

        await syncSet('b');

        expect(value.value).toBe('b');
        expect(syncGet()).toBe('b');
    });

    it('监听到外部 Storage 变更时自动同步 ref', async () => {
        const { value } = useStorage({
            key: 'test_external',
            defaultValue: 'x',
        });
        await flushPromises();
        expect(value.value).toBe('x');

        window.dispatchEvent(
            new CustomEvent(STORAGE_EVENT, {
                detail: { test_external: { newValue: 'y' } },
            })
        );
        await flushPromises();

        expect(value.value).toBe('y');
    });

    it('remove 删除存储项并恢复默认值', async () => {
        const { value, set, remove } = useStorage({
            key: 'test_remove',
            defaultValue: 'fallback',
        });
        await flushPromises();
        await set('to-delete');

        await remove();

        expect(value.value).toBe('fallback');
        expect(localStorage.getItem('test_remove')).toBeNull();
    });

    it('cleanup 后不再响应外部变更', async () => {
        const { value, cleanup } = useStorage({
            key: 'test_cleanup',
            defaultValue: 'x',
        });
        await flushPromises();
        cleanup();

        window.dispatchEvent(
            new CustomEvent(STORAGE_EVENT, {
                detail: { test_cleanup: { newValue: 'z' } },
            })
        );
        await flushPromises();

        expect(value.value).toBe('x');
    });

    it('组件 onUnmounted 时自动清理订阅', async () => {
        const Comp = defineComponent({
            setup() {
                const storage = useStorage({
                    key: 'test_component',
                    defaultValue: 'default',
                });
                return { storage };
            },
            render() {
                return h('div');
            },
        });

        localStorage.setItem('test_component', JSON.stringify('mounted'));
        const wrapper = mount(Comp);
        await flushPromises();

        expect(wrapper.vm.storage.value.value).toBe('mounted');

        wrapper.unmount();
        window.dispatchEvent(
            new CustomEvent(STORAGE_EVENT, {
                detail: { test_component: { newValue: 'after-unmount' } },
            })
        );
        await flushPromises();

        expect(wrapper.vm.storage.value.value).toBe('mounted');
    });

    it('set 失败时回滚 ref 并暴露 error', async () => {
        const { value, set, error } = useStorage({
            key: 'test_error',
            defaultValue: 'ok',
        });
        await flushPromises();

        vi.spyOn(storageManager, 'set').mockRejectedValueOnce(
            new Error('write failed')
        );

        await expect(set('bad')).rejects.toThrow('write failed');
        expect(value.value).toBe('ok');
        expect(error.value?.message).toBe('write failed');
    });

    it('支持自定义序列化器', async () => {
        const { value, set, syncGet } = useStorage<Person>({
            key: 'test_serializer',
            defaultValue: { name: 'a', age: 1 },
            serializer: {
                read: (raw: StorageValue) =>
                    typeof raw === 'string' ? (JSON.parse(raw) as Person) : (raw as Person),
                write: (person: Person) => JSON.stringify(person),
            },
        });
        await flushPromises();

        await set({ name: 'b', age: 2 });

        expect(value.value).toEqual({ name: 'b', age: 2 });
        expect(syncGet()).toEqual({ name: 'b', age: 2 });
    });
});
