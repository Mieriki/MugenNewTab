import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import {
    ConfirmInjectionKey,
    createConfirmManager,
    MntConfirmHost,
    provideConfirm,
    useConfirm,
    type PromptRequest,
} from '../useConfirm';

describe('useConfirm', () => {
    beforeEach(() => {
        // 清理全局单例中的挂起请求，避免测试互相影响
        useConfirm().closeAll();
    });

    describe('createConfirmManager', () => {
        it('confirm 应创建 confirm 请求并支持 resolve true', async () => {
            const manager = createConfirmManager();
            const promise = manager.confirm('确定删除吗？', { title: '删除确认' });

            expect(manager.requests.value).toHaveLength(1);
            const request = manager.requests.value[0];
            expect(request.type).toBe('confirm');
            expect(request.message).toBe('确定删除吗？');
            expect(request.title).toBe('删除确认');
            expect(request.okText).toBe('确定');
            expect(request.cancelText).toBe('取消');
            expect(request.isDanger).toBe(false);

            manager.resolve(request.id, true);
            expect(await promise).toBe(true);
            expect(manager.requests.value).toHaveLength(0);
        });

        it('confirm 取消应返回 false', async () => {
            const manager = createConfirmManager();
            const promise = manager.confirm('是否继续？');
            const request = manager.requests.value[0];
            manager.cancel(request.id);
            expect(await promise).toBe(false);
        });

        it('prompt 应支持默认值、placeholder、inputType 并返回输入值', async () => {
            const manager = createConfirmManager();
            const promise = manager.prompt('请输入分类名称', {
                title: '新建分类',
                defaultValue: '工具',
                inputPlaceholder: '分类名称',
                inputType: 'text',
            });

            const request = manager.requests.value[0] as PromptRequest;
            expect(request.type).toBe('prompt');
            expect(request.title).toBe('新建分类');
            expect(request.defaultValue).toBe('工具');
            expect(request.value).toBe('工具');
            expect(request.placeholder).toBe('分类名称');
            expect(request.inputType).toBe('text');

            manager.updateValue(request.id, '开发工具');
            expect(request.value).toBe('开发工具');

            manager.resolve(request.id, request.value);
            expect(await promise).toBe('开发工具');
        });

        it('prompt 取消应返回 null', async () => {
            const manager = createConfirmManager();
            const promise = manager.prompt('请输入名称');
            const request = manager.requests.value[0];
            manager.cancel(request.id);
            expect(await promise).toBe(null);
        });

        it('closeAll 应清空队列并结算所有 Promise', async () => {
            const manager = createConfirmManager();
            const p1 = manager.confirm('确认覆盖？');
            const p2 = manager.prompt('输入备注');

            manager.closeAll();

            expect(manager.requests.value).toHaveLength(0);
            expect(await p1).toBe(false);
            expect(await p2).toBe(null);
        });

        it('多次调用应按顺序入队', () => {
            const manager = createConfirmManager();
            manager.confirm('第一条');
            manager.prompt('第二条');
            manager.confirm('第三条', { isDanger: true });

            expect(manager.requests.value).toHaveLength(3);
            expect(manager.requests.value.map((r) => r.message)).toEqual(['第一条', '第二条', '第三条']);
            expect(manager.requests.value[2].isDanger).toBe(true);
        });

        it('resolve 不存在的 id 不应抛出异常', () => {
            const manager = createConfirmManager();
            expect(() => manager.resolve('not-exist', true)).not.toThrow();
        });
    });

    describe('provide / inject', () => {
        it('provideConfirm 应让子组件 useConfirm 拿到同一实例', () => {
            const localManager = createConfirmManager();

            const Child = defineComponent({
                setup() {
                    const injected = useConfirm();
                    return { same: injected === localManager };
                },
                render() {
                    return h('div');
                },
            });

            const Parent = defineComponent({
                setup() {
                    provideConfirm(localManager);
                    return {};
                },
                render() {
                    return h(Child);
                },
            });

            const wrapper = mount(Parent);
            expect((wrapper.findComponent(Child).vm as unknown as { same: boolean }).same).toBe(true);
        });

        it('未提供 Manager 时 useConfirm 应回退到全局单例', () => {
            const Child = defineComponent({
                setup() {
                    const injected = useConfirm();
                    return { isGlobal: injected === useConfirm() };
                },
                render() {
                    return h('div');
                },
            });

            const wrapper = mount(Child);
            expect((wrapper.vm as unknown as { isGlobal: boolean }).isGlobal).toBe(true);
        });
    });

    describe('MntConfirmHost', () => {
        it('无请求时不渲染任何 DOM', () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });
            expect(wrapper.find('.mnt-confirm-overlay').exists()).toBe(false);
        });

        it('应渲染 confirm 对话框，点击确定 resolve true', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const promise = manager.confirm('确定要删除该网站吗？', {
                title: '删除网站',
                okText: '删除',
                cancelText: '再想想',
                isDanger: true,
            });
            await nextTick();

            expect(wrapper.find('.mnt-confirm-title').text()).toBe('删除网站');
            expect(wrapper.find('.mnt-confirm-message').text()).toBe('确定要删除该网站吗？');
            expect(wrapper.find('.mnt-confirm-btn--danger').exists()).toBe(true);

            await wrapper.find('.mnt-confirm-btn--danger').trigger('click');
            expect(await promise).toBe(true);
        });

        it('点击取消按钮应 resolve false', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const promise = manager.confirm('是否继续？');
            await nextTick();

            await wrapper.find('.mnt-confirm-btn--secondary').trigger('click');
            expect(await promise).toBe(false);
        });

        it('点击遮罩层应 resolve false', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const promise = manager.confirm('是否继续？');
            await nextTick();

            await wrapper.find('.mnt-confirm-overlay').trigger('click');
            expect(await promise).toBe(false);
        });

        it('按下 Escape 应 resolve false', async () => {
            const manager = createConfirmManager();
            mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const promise = manager.confirm('是否继续？');
            await nextTick();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await nextTick();

            expect(await promise).toBe(false);
        });

        it('应渲染 prompt 对话框并返回输入值', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const promise = manager.prompt('请输入分类名称', { defaultValue: '工具' });
            await nextTick();

            const input = wrapper.find('input');
            expect(input.exists()).toBe(true);
            expect((input.element as HTMLInputElement).value).toBe('工具');

            await input.setValue('开发工具');
            await wrapper.find('.mnt-confirm-btn--primary').trigger('click');

            expect(await promise).toBe('开发工具');
        });

        it('prompt 按 Enter 应直接提交当前输入值', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const promise = manager.prompt('请输入备注');
            await nextTick();

            const input = wrapper.find('input');
            await input.setValue(' hello ');
            await input.trigger('keydown', { key: 'Enter' });

            expect(await promise).toBe(' hello ');
        });

        it('组件卸载时应清理副作用并取消挂起的请求', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const promise = manager.confirm('是否继续？');
            await nextTick();

            wrapper.unmount();
            expect(await promise).toBe(false);
            expect(manager.requests.value).toHaveLength(0);
        });

        it('队列中的请求应逐个展示，resolve 后自动显示下一个', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            const p1 = manager.confirm('第一条');
            const p2 = manager.confirm('第二条');
            await nextTick();

            expect(wrapper.find('.mnt-confirm-message').text()).toBe('第一条');
            manager.resolve(manager.requests.value[0].id, true);
            await nextTick();

            expect(wrapper.find('.mnt-confirm-message').text()).toBe('第二条');
            manager.resolve(manager.requests.value[0].id, true);

            expect(await p1).toBe(true);
            expect(await p2).toBe(true);
        });
    });

    describe('安全与内容', () => {
        it('图标与按钮文本中不应包含 emoji', async () => {
            const manager = createConfirmManager();
            const wrapper = mount(MntConfirmHost, {
                global: { provide: { [ConfirmInjectionKey]: manager } },
            });

            manager.confirm('确认？', { okText: '确定', cancelText: '取消', title: '提示' });
            await nextTick();

            const html = wrapper.html();
            const emojiRange = /[\u{1F300}-\u{1F9FF}]/u;
            expect(html).not.toMatch(emojiRange);
            expect(html).toContain('<svg');
        });
    });
});
