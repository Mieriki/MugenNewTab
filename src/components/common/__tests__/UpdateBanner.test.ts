/**
 * UpdateBanner 单元测试
 *
 * 组件是纯展示的：只验证渲染内容与事件冒泡，不涉及检查逻辑。
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UpdateBanner from '../UpdateBanner.vue';

describe('UpdateBanner', () => {
    it('展示最新版本与当前版本', () => {
        const wrapper = mount(UpdateBanner, {
            props: { latestVersion: '1.0.0.109', currentVersion: '1.0.0.108' },
        });

        expect(wrapper.text()).toContain('发现新版本 v1.0.0.109');
        expect(wrapper.text()).toContain('当前 v1.0.0.108');
    });

    it('没有当前版本时不显示副标题', () => {
        const wrapper = mount(UpdateBanner, {
            props: { latestVersion: '1.0.0.109' },
        });

        expect(wrapper.find('.update-banner__sub').exists()).toBe(false);
    });

    it('点击「立即更新」派发 update 事件', async () => {
        const wrapper = mount(UpdateBanner, {
            props: { latestVersion: '1.0.0.109' },
        });

        await wrapper.find('.update-banner__action').trigger('click');

        expect(wrapper.emitted('update')).toHaveLength(1);
    });

    it('点击关闭按钮派发 close 事件', async () => {
        const wrapper = mount(UpdateBanner, {
            props: { latestVersion: '1.0.0.109' },
        });

        await wrapper.find('.update-banner__close').trigger('click');

        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('使用 status 语义，便于屏幕阅读器播报', () => {
        const wrapper = mount(UpdateBanner, {
            props: { latestVersion: '1.0.0.109' },
        });

        expect(wrapper.find('.update-banner').attributes('role')).toBe('status');
    });
});
