import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CloudSyncPanel from '@/components/personalization/CloudSyncPanel.vue';

describe('CloudSyncPanel', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('渲染未登录状态与连接按钮', async () => {
        const wrapper = mount(CloudSyncPanel);
        await flushPromises();

        expect(wrapper.text()).toContain('云同步');
        expect(wrapper.text()).toContain('未连接');
        expect(wrapper.text()).toContain('使用 GitHub Gist 备份和同步你的数据');
        expect(wrapper.find('.cloud-sync-panel__guest').exists()).toBe(true);
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
});
