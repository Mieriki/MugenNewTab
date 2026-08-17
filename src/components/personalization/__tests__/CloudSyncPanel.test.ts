/**
 * CloudSyncPanel 测试
 * 覆盖：未登录态渲染（平台选择 + Token 输入）、空 Token 提示、
 * 已登录态操作按钮（「立即同步」双向合并、「强制恢复云端」兜底）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CloudSyncPanel from '@/components/personalization/CloudSyncPanel.vue';
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
});
