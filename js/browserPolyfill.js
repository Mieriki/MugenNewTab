/**
 * browserPolyfill.js - 统一 Chrome/Firefox/Edge 扩展 API 抽象层
 *
 * 提供以下全局对象：
 *   - window.BrowserAPI   统一的存储/标签页/运行时 API
 *   - window.isExtension   是否运行在扩展环境中
 *
 * 使用方式（替换原有的 chrome.* 调用）：
 *   chrome.storage.local.get(key)  →  BrowserAPI.storage.local.get(key)
 *   chrome.tabs.query(...)          →  BrowserAPI.tabs.query(...)
 *   chrome.runtime.lastError        →  BrowserAPI.runtime.lastError
 *   chrome.runtime.getURL(path)     →  BrowserAPI.runtime.getURL(path)
 *
 * 注意：所有方法都返回 Promise，即使底层是 Chrome 回调风格 API 也已自动包装。
 */

(function () {
    'use strict';

    // 获取浏览器 API 根对象（优先使用 Promise 风格的 browser）
    const browser = (typeof window.browser !== 'undefined' && window.browser) || null;
    const chrome = (typeof window.chrome !== 'undefined' && window.chrome) || null;
    const apiRoot = browser || chrome;

    // 检测是否运行在浏览器扩展环境中
    const isExtension = !!(apiRoot &&
        apiRoot.storage &&
        apiRoot.storage.local);

    /**
     * 将 Chrome 回调风格的 API 包装为 Promise
     * 例如: promisifyCall(chrome.storage.local, 'get', [key]) -> Promise(result)
     */
    function promisifyCall(obj, method, args) {
        return new Promise(function (resolve) {
            try {
                const fn = obj[method];
                if (typeof fn !== 'function') {
                    resolve();
                    return;
                }
                fn.apply(obj, args.concat(function (result) {
                    resolve(result);
                }));
            } catch (e) {
                console.warn('[browserPolyfill] 调用', method, '失败:', e);
                resolve();
            }
        });
    }

    /**
     * 存储 API（storage.local）
     *
     * 统一接口：
     *   BrowserAPI.storage.local.get(key) -> Promise(result)     // key 为字符串或 null
     *   BrowserAPI.storage.local.set(obj) -> Promise(undefined)
     *   BrowserAPI.storage.local.remove(key) -> Promise(undefined)
     */
    function buildStorageApi() {
        if (!isExtension) {
            // 非扩展环境：降级到 localStorage
            return {
                local: {
                    get: function (key) {
                        return new Promise(function (resolve) {
                            if (key === null || typeof key === 'undefined') {
                                // 返回整个存储
                                const all = {};
                                try {
                                    for (let i = 0; i < localStorage.length; i++) {
                                        const k = localStorage.key(i);
                                        const raw = localStorage.getItem(k);
                                        try {
                                            all[k] = JSON.parse(raw);
                                        } catch (_) {
                                            all[k] = raw;
                                        }
                                    }
                                } catch (_) { /* ignore */ }
                                resolve(all);
                            } else {
                                const result = {};
                                const raw = localStorage.getItem(key);
                                if (raw !== null) {
                                    try {
                                        result[key] = JSON.parse(raw);
                                    } catch (_) {
                                        result[key] = raw;
                                    }
                                }
                                resolve(result);
                            }
                        });
                    },
                    set: function (items) {
                        return new Promise(function (resolve) {
                            try {
                                Object.keys(items).forEach(function (k) {
                                    const val = items[k];
                                    localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
                                });
                            } catch (_) { /* ignore */ }
                            resolve();
                        });
                    },
                    remove: function (key) {
                        return new Promise(function (resolve) {
                            try {
                                localStorage.removeItem(key);
                            } catch (_) { /* ignore */ }
                            resolve();
                        });
                    }
                }
            };
        }

        const storage = apiRoot.storage;
        const hasNativePromise = browser && browser.storage && browser.storage.local;

        return {
            local: {
                get: function (key) {
                    if (hasNativePromise) {
                        // Firefox（Promise 原生）
                        return browser.storage.local.get(key);
                    }
                    // Chrome（回调风格）
                    return promisifyCall(storage.local, 'get', [key]);
                },
                set: function (items) {
                    if (hasNativePromise) {
                        return browser.storage.local.set(items);
                    }
                    return promisifyCall(storage.local, 'set', [items]);
                },
                remove: function (key) {
                    if (hasNativePromise) {
                        return browser.storage.local.remove(key);
                    }
                    return promisifyCall(storage.local, 'remove', [key]);
                }
            }
        };
    }

    /**
     * 标签页 API（tabs.query）
     *
     * BrowserAPI.tabs.query({ active: true, currentWindow: true }) -> Promise(tabs)
     */
    function buildTabsApi() {
        const tabs = apiRoot && apiRoot.tabs;
        if (!tabs) {
            return {
                query: function () {
                    return Promise.resolve([]);
                }
            };
        }

        const hasNativePromise = browser && browser.tabs;
        return {
            query: function (queryInfo) {
                if (hasNativePromise) {
                    return browser.tabs.query(queryInfo);
                }
                return promisifyCall(tabs, 'query', [queryInfo]);
            }
        };
    }

    /**
     * 运行时 API（runtime.lastError / runtime.getURL）
     */
    function buildRuntimeApi() {
        const runtime = apiRoot && apiRoot.runtime;
        return {
            get lastError() {
                return runtime ? runtime.lastError : null;
            },
            getURL: function (path) {
                if (runtime && runtime.getURL) {
                    return runtime.getURL(path);
                }
                return path;
            }
        };
    }

    // 暴露到全局
    const BrowserAPI = {
        storage: buildStorageApi(),
        tabs: buildTabsApi(),
        runtime: buildRuntimeApi()
    };

    window.BrowserAPI = BrowserAPI;
    window.isExtension = isExtension;

    // 兼容旧代码中可能直接使用的判断（可选提示，不强制）
    console.info('[browserPolyfill] 已初始化，扩展环境:', isExtension,
        isExtension ? (browser ? '(Firefox/Promise 风格)' : '(Chrome/回调 风格)') : '(网页 / localStorage)');
})();
