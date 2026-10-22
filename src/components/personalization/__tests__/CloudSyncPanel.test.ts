/**
 * CloudSyncPanel 测试
 * 覆盖：未登录态渲染（平台选择 + Token 输入）、空 Token 提示、
 * 已登录态操作按钮（「立即同步」双向合并、「强制恢复云端」兜底）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CloudSyncPanel from '@/components/personalization/CloudSyncPanel.vue';
import { enableCrossDevice } from '@/services/crossDeviceSync.service';
import { storageManager } from '@/services/storage.service';
import { browserApi } from '@/services/browserApi.service';
import { STORAGE_KEYS } from '@/types/storage';

describe('CloudSyncPanel', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
        browserApi.resetDetection();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('渲染未登录状态与连接按钮', async () => {
        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        expect(wrapper.text()).toContain('云同步');
        expect(wrapper.text()).toContain('未连接');
        expect(wrapper.text()).toContain('使用 GitHub / Gitee 代码片段（Gist）备份和同步你的站点数据');
        expect(wrapper.find('.cloud-sync-panel__guest').exists()).toBe(true);
        // 默认平台为 GitHub
        expect(wrapper.find('.cloud-sync-panel__guest .mnt-base-button').text()).toContain('连接 GitHub');
    });

    it('Token 输入框为空时点击连接给出提示', async () => {
        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        const button = wrapper.find('.cloud-sync-panel__guest .mnt-base-button');
        await button.trigger('click');
        await flushPromises();

        expect(wrapper.emitted('login')).toBeUndefined();
    });

    it('切换平台按钮后更新 Token 标签、占位提示与连接按钮文案', async () => {
        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        // 默认 GitHub
        expect(wrapper.text()).toContain('GitHub Token');
        expect(wrapper.find('.cloud-sync-panel__guest .mnt-base-button').text()).toContain('连接 GitHub');

        // 点击 Gitee 平台按钮
        const providerButtons = wrapper.findAll('.cloud-sync-provider__btn');
        expect(providerButtons).toHaveLength(2);
        await providerButtons[1].trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('Gitee Token');
        expect(wrapper.text()).toContain('gitee.com/profile/personal_access_tokens');
        expect(wrapper.find('.cloud-sync-panel__guest .mnt-base-button').text()).toContain('连接 Gitee');
        // 输入框占位符随平台变化
        expect(wrapper.find('.cloud-sync-panel__guest input').attributes('placeholder')).toBe('xxxxxxxxxxxxxxxx');
    });

    it('已登录时展示「立即同步」与「强制恢复云端」按钮', async () => {
        // 预置登录态；init 会用 provider 验证 Token（mock /user 返回成功）
        await storageManager.setMany({
            [STORAGE_KEYS.CLOUD_TOKEN]: 'ghp_test',
            [STORAGE_KEYS.CLOUD_GIST_ID]: 'gist_1',
            [STORAGE_KEYS.CLOUD_USER_INFO]: { login: 'tester', id: 1, avatar: 'https://avatar.png' }
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({ login: 'tester', id: 1, avatar_url: 'https://avatar.png' }),
            text: async () => ''
        }));

        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        const text = wrapper.text();
        expect(text).toContain('已连接');
        expect(text).toContain('立即同步');
        expect(text).toContain('强制恢复云端');
        expect(text).toContain('断开连接');

        vi.unstubAllGlobals();
    });

    /** 预置登录态（init 会用 provider 验证 Token） */
    async function prepareLoggedIn(): Promise<void> {
        await storageManager.setMany({
            [STORAGE_KEYS.CLOUD_TOKEN]: 'ghp_test',
            [STORAGE_KEYS.CLOUD_GIST_ID]: 'gist_1',
            [STORAGE_KEYS.CLOUD_USER_INFO]: { login: 'tester', id: 1, avatar: 'https://avatar.png' }
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({ login: 'tester', id: 1, avatar_url: 'https://avatar.png' }),
            text: async () => ''
        }));
    }

    it('已登录时展示「浏览器同步」区块', async () => {
        await prepareLoggedIn();

        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        expect(wrapper.text()).toContain('浏览器同步');
        expect(wrapper.text()).toContain('开启浏览器同步');
        // 默认未开启：不展示密码输入
        expect(wrapper.text()).not.toContain('同步密码只保存在本机');

        vi.unstubAllGlobals();
    });

    it('未登录时也展示「浏览器同步」区块（修复：卡片上没有这个功能）', async () => {
        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        // 未登录态仍然可以开启浏览器同步：先设密码，登录后自动补推凭据
        expect(wrapper.find('.cloud-sync-cross').exists()).toBe(true);
        expect(wrapper.text()).toContain('开启浏览器同步');
        expect(wrapper.text()).toContain('登录同一浏览器账号的其他设备');
    });

    it('勾选「开启浏览器同步」后展开密码输入，密码过短时不提交', async () => {
        await prepareLoggedIn();

        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        const toggle = wrapper.find('.cloud-sync-cross .cloud-sync-toggle input[type="checkbox"]');
        expect(toggle.exists()).toBe(true);

        await toggle.setValue(true);
        await flushPromises();

        expect(wrapper.text()).toContain('同步密码只保存在本机');
        expect(wrapper.text()).toContain('开启并加密同步');

        // 密码为空时点击启用：只提示（Toast 由外层容器渲染），不应真正开启
        const enableBtn = wrapper
            .findAll('.cloud-sync-cross .mnt-base-button')
            .find((btn) => btn.text().includes('开启并加密同步'));
        expect(enableBtn).toBeTruthy();
        await enableBtn!.trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('开启并加密同步');
        expect(wrapper.text()).not.toContain('已开启 · ');

        vi.unstubAllGlobals();
    });

    it('未登录也能开启浏览器同步：密码写入本机，开关变为已开启', async () => {
        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        const toggle = wrapper.find('.cloud-sync-cross .cloud-sync-toggle input[type="checkbox"]');
        await toggle.setValue(true);
        await flushPromises();

        await wrapper.find('.cloud-sync-cross input[type="password"]').setValue('my-sync-pass');
        const enableBtn = wrapper
            .findAll('.cloud-sync-cross .mnt-base-button')
            .find((btn) => btn.text().includes('开启并加密同步'));
        await enableBtn!.trigger('click');

        // 启用包含 PBKDF2 密钥派生（异步耗时），等待真实写入完成
        await vi.waitFor(() => {
            expect(localStorage.getItem('appNavigator_crossDevice_enabled')).toBe('true');
        });
        await flushPromises();

        // 未登录时只保存开关与密码，等登录后由 CloudSyncService 自动补推
        expect(localStorage.getItem('appNavigator_crossDevice_passphrase')).toBe('my-sync-pass');
        expect(wrapper.text()).toContain('已开启');
        expect(wrapper.text()).toContain('登录后会立即把登录状态加密同步到浏览器账号');
    });

    it('同步区已有其他设备凭据时提示「恢复登录状态」', async () => {
        // 模拟另一台设备：本机没有开关与密码，但同步区已有密文
        await enableCrossDevice('my-sync-pass', { token: 'ghp_other_device', provider: 'github' });
        localStorage.removeItem('appNavigator_crossDevice_enabled');
        localStorage.removeItem('appNavigator_crossDevice_passphrase');

        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        expect(wrapper.text()).toContain('检测到其他设备的登录状态');
        expect(wrapper.text()).toContain('恢复登录状态');
    });
});
