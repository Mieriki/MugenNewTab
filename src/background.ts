/**
 * background.ts - Firefox 后台脚本
 *
 * Firefox 启动时的首个标签页不会自动触发 chrome_url_overrides.newtab，
 * 因此需要监听 runtime.onStartup / onInstalled，将 about:newtab / about:home /
 * about:blank / about:welcome 等页面重定向到扩展的 index.html。
 */

import type { Tab } from '@/types/browserApi.types';

/**
 * 声明 Firefox 扩展全局 browser 对象。
 * 仅在 background 脚本中由扩展运行时注入。
 */
declare const browser: {
    runtime?: {
        onInstalled?: { addListener(listener: () => void): void };
        onStartup?: { addListener(listener: () => void): void };
        getURL(path: string): string;
    };
    tabs?: {
        query(queryInfo: Record<string, unknown>): Promise<Tab[]>;
        update(id: number, data: { url: string }): Promise<Tab>;
    };
} | undefined;

const NEW_TAB_URL = 'index.html';

const REDIRECT_TARGETS = new Set([
    'about:newtab',
    'about:home',
    'about:blank',
    'about:welcome',
]);

function shouldRedirect(url: string | undefined): boolean {
    if (!url) return false;
    return REDIRECT_TARGETS.has(url);
}

async function redirectStartupTab(): Promise<void> {
    try {
        if (typeof browser === 'undefined') {
            return;
        }

        const tabs = (await browser.tabs?.query({})) ?? [];
        const targetUrl = browser.runtime?.getURL(NEW_TAB_URL) ?? NEW_TAB_URL;

        for (const tab of tabs) {
            if (shouldRedirect(tab.url) && tab.active && tab.id !== undefined) {
                await browser.tabs?.update(tab.id, { url: targetUrl });
                break;
            }
        }
    } catch (error) {
        console.warn('[MugenNewTab] redirect startup tab failed:', error);
    }
}

if (typeof browser !== 'undefined') {
    // 扩展安装/更新时触发
    browser.runtime?.onInstalled?.addListener(() => {
        void redirectStartupTab();
    });

    // 浏览器启动时触发（Firefox MV3 支持 onStartup）
    browser.runtime?.onStartup?.addListener(() => {
        void redirectStartupTab();
    });
}

export { redirectStartupTab };
export default redirectStartupTab;
