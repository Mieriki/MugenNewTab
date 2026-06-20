// ==================== 配置加载器 ====================
// 从 JSON 文件同步加载所有配置

const ConfigLoader = {
    _cache: {},

    // 基础路径（在扩展环境中使用绝对路径）
    getBasePath() {
        // 检测是否在扩展环境中（支持 Chrome 和 Firefox）
        const inExtension = typeof window.isExtension !== 'undefined'
            ? window.isExtension
            : (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ||
              (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id);
        if (inExtension && typeof BrowserAPI !== 'undefined' && BrowserAPI.runtime) {
            return BrowserAPI.runtime.getURL('config/');
        }
        if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL) {
            return browser.runtime.getURL('config/');
        }
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            return chrome.runtime.getURL('config/');
        }
        // 普通网页环境使用相对路径
        return 'config/';
    },

    // 同步加载 JSON 配置
    loadSync(configName) {
        if (this._cache[configName]) {
            return this._cache[configName];
        }

        try {
            const basePath = this.getBasePath();
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `${basePath}${configName}.json`, false); // 同步请求
            xhr.send();

            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                this._cache[configName] = data;
                return data;
            } else {
                console.warn(`ConfigLoader: 无法加载 ${configName}.json，状态码: ${xhr.status}`);
                return null;
            }
        } catch (error) {
            console.error(`ConfigLoader: 加载 ${configName}.json 失败`, error);
            return null;
        }
    },

    // 异步加载（用于动态刷新）
    async load(configName) {
        if (this._cache[configName]) {
            return this._cache[configName];
        }

        try {
            const basePath = this.getBasePath();
            const response = await fetch(`${basePath}${configName}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${configName}.json`);
            }
            const data = await response.json();
            this._cache[configName] = data;
            return data;
        } catch (error) {
            console.error(`ConfigLoader: 异步加载 ${configName}.json 失败`, error);
            return null;
        }
    }
};

// 全局配置对象
let themeConfig = null;
let searchEngines = null;
let DefaultData = null;

// 初始化配置（同步执行，确保后续脚本可用）
(function initConfigs() {
    // 加载主题配置
    const themes = ConfigLoader.loadSync('themes');
    if (themes) {
        themeConfig = themes;
    } else {
        themeConfig = { themes: [] };
    }

    // 加载搜索引擎配置
    const engines = ConfigLoader.loadSync('searchEngines');
    if (engines) {
        searchEngines = engines;
    } else {
        searchEngines = [];
    }

    // 加载默认数据配置
    const data = ConfigLoader.loadSync('defaultData');
    if (data) {
        DefaultData = data;
    } else {
        DefaultData = {
            appNavigator: { categories: [], apps: [] },
            systemUiLib: { categories: [], items: [] },
            userUiLib: { categories: [], items: [] }
        };
    }

    console.log('ConfigLoader: 配置加载完成');
})();
