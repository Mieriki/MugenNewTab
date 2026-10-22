/**
 * background.ts - Firefox 后台脚本
 *
 * Firefox 启动时的首个标签页不会自动触发 chrome_url_overrides.newtab，
 * 因此需要监听 runtime.onStartup / onInstalled，将 about:newtab / about:home /
 * about:welcome 等页面重定向到扩展的 index.html。
 *
 * 此外 Firefox 用 Cmd/Ctrl+N 打开新窗口时，新窗口的第一个标签页加载的是
 * 主页（about:home），也不会触发 chrome_url_overrides.newtab。
 * 通过 tabs.onCreated 监听新标签创建事件，对 about:home / about:newtab /
 * about:welcome 做即时重定向。
 *
 * 注意：about:blank 不在重定向列表里——window.open('')、iframe、链接预加载、
 * 导航中间态等都会产生 about:blank，重定向它会把正常浏览全部打断。
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
        onCreated?: { addListener(listener: (tab: Tab) => void): void };
    };
} | undefined;

const NEW_TAB_URL = 'index.html';

/**
 * 需要重定向的 about: 页面。
 *
 * 不包含 about:blank——它太常见了（window.open、iframe、预加载等），
 * 重定向会打断正常浏览。
 */
const REDIRECT_TARGETS = new Set([
    'about:newtab',
    'about:home',
    'about:welcome',
]);

function shouldRedirect(url: string | undefined): boolean {
    if (!url) return false;
    return REDIRECT_TARGETS.has(url);
}

/**
 * 获取扩展 index.html 的绝对 URL。
 * browser.runtime.getURL 在 background 上下文中可用。
 */
function getExtensionUrl(): string {
    if (typeof browser !== 'undefined' && browser.runtime?.getURL) {
        return browser.runtime.getURL(NEW_TAB_URL);
    }
    // Chrome 上下文（本脚本不在 Chrome 加载，留作兜底）
    return NEW_TAB_URL;
}

async function redirectStartupTab(): Promise<void> {
    try {
        if (typeof browser === 'undefined') {
            return;
        }

        const tabs = (await browser.tabs?.query({})) ?? [];
        const targetUrl = getExtensionUrl();

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

/**
 * 新标签创建时的即时重定向。
 *
 * Firefox 新窗口（Cmd+N）的第一个标签页 URL 是 about:home，
 * chrome_url_overrides.newtab 不覆盖它，chrome_settings_overrides.homepage
 * 也依赖用户的 Firefox 主页设置是否选了「自定义 URL」。
 * 在这里用 tabs.onCreated 拦截，确保 about:home / about:newtab / about:welcome
 * 跳到扩展页。
 *
 * 不注册 tabs.onUpdated——onUpdated 在标签页的整个生命周期都会触发，
 * 用它拦截 about: 页面会误伤正常导航（比如从扩展页点链接跳走时
 * 中间状态可能被误判），代价远大于收益。onCreated 一次足矣。
 */
function handleTabCreated(tab: Tab): void {
    if (!shouldRedirect(tab.url)) return;
    if (tab.id === undefined) return;
    const targetUrl = getExtensionUrl();
    browser?.tabs?.update(tab.id, { url: targetUrl }).catch((error: unknown) => {
        console.warn('[MugenNewTab] onCreated redirect failed:', error);
    });
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

    // 新标签创建时拦截 about:home / about:newtab / about:welcome（覆盖新窗口场景）
    browser.tabs?.onCreated?.addListener(handleTabCreated);
}

export { redirectStartupTab };
export default redirectStartupTab;
