// Firefox 启动时重定向首个标签页到扩展新标签页
// 背景：chrome_url_overrides.newtab 只在用户主动打开新标签时生效，
// Firefox 启动时的首个标签页不触发该覆盖，需要手动重定向。

// 首次安装/更新时，如果当前标签是 about:home 或 about:newtab 或 about:blank，重定向
const NEW_TAB_URL = 'index.html';

function shouldRedirect(url) {
    if (!url) return false;
    return url === 'about:newtab' ||
           url === 'about:home' ||
           url === 'about:blank' ||
           url === 'about:welcome';
}

async function redirectStartupTab() {
    try {
        const tabs = await browser.tabs.query({});
        // 只处理当前窗口的活动标签（通常是启动时的首个标签）
        for (const tab of tabs) {
            if (shouldRedirect(tab.url) && tab.active) {
                await browser.tabs.update(tab.id, {
                    url: browser.runtime.getURL(NEW_TAB_URL)
                });
                break;
            }
        }
    } catch (e) {
        console.warn('[MugenNewTab] redirect startup tab failed:', e);
    }
}

// 扩展安装/更新时触发
browser.runtime.onInstalled.addListener(() => {
    redirectStartupTab();
});

// 浏览器启动时触发（Firefox MV3 支持 onStartup）
if (browser.runtime.onStartup) {
    browser.runtime.onStartup.addListener(() => {
        redirectStartupTab();
    });
}
