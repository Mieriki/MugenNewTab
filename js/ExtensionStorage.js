// 封装 Chrome Storage API，兼容原有 localStorage 调用方式
const ExtensionStorage = {
    async get(key) {
        try {
            const result = await chrome.storage.local.get(key);
            return result[key];
        } catch (e) {
            console.error('Storage get error:', e);
            return null;
        }
    },

    async set(key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
            return true;
        } catch (e) {
            console.error('Storage set error:', e);
            return false;
        }
    },

    async remove(key) {
        try {
            await chrome.storage.local.remove(key);
            return true;
        } catch (e) {
            console.error('Storage remove error:', e);
            return false;
        }
    },

    // 批量获取（兼容对象格式）
    async getMulti(keys) {
        try {
            return await chrome.storage.local.get(keys);
        } catch (e) {
            console.error('Storage getMulti error:', e);
            return {};
        }
    },

    // 批量设置
    async setMulti(items) {
        try {
            await chrome.storage.local.set(items);
            return true;
        } catch (e) {
            console.error('Storage setMulti error:', e);
            return false;
        }
    }
};

// 检测是否在扩展环境中
const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

// 调试信息
console.log('ExtensionStorage 初始化:', { isExtension, hasChrome: typeof chrome !== 'undefined' });

// ==================== StorageManager（适配 Chrome Storage）====================
const StorageManager = {
    isExtension: isExtension,

    async get(key) {
        try {
            if (this.isExtension) {
                const result = await chrome.storage.local.get(key);
                return result[key];
            } else {
                const item = localStorage.getItem(key);
                try {
                    return item ? JSON.parse(item) : null;
                } catch (e) {
                    return item;
                }
            }
        } catch (error) {
            console.error('StorageManager.get 失败:', error);
            // 尝试从 localStorage 回退
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (e) {
                return null;
            }
        }
    },

    async set(key, value) {
        if (this.isExtension) {
            await chrome.storage.local.set({ [key]: value });
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    },

    async remove(key) {
        if (this.isExtension) {
            await chrome.storage.local.remove(key);
        } else {
            localStorage.removeItem(key);
        }
    }
};

// ==================== DataManager（数据管理器）====================
const DataManager = {
    STORAGE_KEY: 'appNavigator_data',
    _cache: null,
    _initPromise: null,

    // 默认数据
    defaultData: {
        categories: [
            { id: 'all', name: '全部应用', icon: '📱' },
            { id: 'develop', name: '开发工具', icon: '💻' },
            { id: 'design', name: '设计工具', icon: '🎨' },
            { id: 'productivity', name: '效率工具', icon: '⚡' },
            { id: 'learning', name: '学习资源', icon: '📚' },
            { id: 'entertainment', name: '娱乐休闲', icon: '🎮' }
        ],
        apps: [
            { id: 'app_1', name: 'GitHub', description: '代码托管平台', icon: 'https://github.com/favicon.ico', url: 'https://github.com', category: 'develop' },
            { id: 'app_2', name: 'Stack Overflow', description: '开发者问答社区', icon: 'https://stackoverflow.com/favicon.ico', url: 'https://stackoverflow.com', category: 'develop' },
            { id: 'app_3', name: 'MDN Web Docs', description: 'Web 技术文档', icon: 'https://developer.mozilla.org/favicon.ico', url: 'https://developer.mozilla.org', category: 'develop' }
        ]
    },

    // 初始化
    async init() {
        if (this._initPromise) return this._initPromise;
        
        this._initPromise = (async () => {
            try {
                console.log('DataManager 初始化开始...');
                const data = await StorageManager.get(this.STORAGE_KEY);
                console.log('从存储读取数据:', data);
                
                if (data && data.categories && data.apps) {
                    this._cache = data;
                    console.log('使用存储的数据');
                } else {
                    console.log('使用默认数据');
                    this._cache = JSON.parse(JSON.stringify(this.defaultData));
                    await this.sync();
                }
            } catch (error) {
                console.error('DataManager 初始化失败:', error);
                // 使用默认数据作为回退
                this._cache = JSON.parse(JSON.stringify(this.defaultData));
            }
        })();
        
        return this._initPromise;
    },

    // 获取数据
    async getData() {
        await this.init();
        return JSON.parse(JSON.stringify(this._cache));
    },

    // 同步到存储
    async sync() {
        if (this._cache) {
            await StorageManager.set(this.STORAGE_KEY, this._cache);
        }
    },

    // 添加应用
    async addApp(appData) {
        await this.init();
        const newApp = {
            id: 'app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...appData
        };
        this._cache.apps.push(newApp);
        await this.sync();
        return newApp;
    },

    // 更新应用
    async updateApp(appId, appData) {
        await this.init();
        const index = this._cache.apps.findIndex(a => a.id === appId);
        if (index !== -1) {
            this._cache.apps[index] = { ...this._cache.apps[index], ...appData };
            await this.sync();
        }
    },

    // 删除应用
    async deleteApp(appId) {
        await this.init();
        this._cache.apps = this._cache.apps.filter(a => a.id !== appId);
        await this.sync();
    },

    // 添加分类
    async addCategory(catData) {
        await this.init();
        const newCat = {
            id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...catData
        };
        this._cache.categories.push(newCat);
        await this.sync();
        return newCat;
    },

    // 更新分类
    async updateCategory(catId, catData) {
        await this.init();
        const index = this._cache.categories.findIndex(c => c.id === catId);
        if (index !== -1) {
            this._cache.categories[index] = { ...this._cache.categories[index], ...catData };
            await this.sync();
        }
    },

    // 删除分类
    async deleteCategory(catId) {
        await this.init();
        this._cache.categories = this._cache.categories.filter(c => c.id !== catId);
        this._cache.apps = this._cache.apps.filter(a => a.category !== catId);
        await this.sync();
    },

    // 导出数据
    async exportData() {
        await this.init();
        return JSON.parse(JSON.stringify(this._cache));
    },

    // 导入数据
    async importData(data) {
        if (data && data.categories && data.apps) {
            this._cache = JSON.parse(JSON.stringify(data));
            await this.sync();
        }
    },

    // 重置为默认
    async resetToDefault() {
        this._cache = JSON.parse(JSON.stringify(this.defaultData));
        await this.sync();
    }
};

// 自动初始化（使用 setTimeout 延迟执行，避免阻塞页面加载）
// 注：不使用 DOMContentLoaded，因为脚本可能在 DOM 加载完成后才加载
setTimeout(() => {
    DataManager.init().catch(err => console.error('DataManager 自动初始化失败:', err));
}, 0);

// ==================== 兼容层（旧代码使用）====================
window.AppStorage = {
    async getItem(key) {
        if (isExtension) {
            const result = await ExtensionStorage.get(key);
            return result ? JSON.stringify(result) : null;
        }
        return localStorage.getItem(key);
    },

    async setItem(key, value) {
        if (isExtension) {
            const data = JSON.parse(value);
            return await ExtensionStorage.set(key, data);
        }
        localStorage.setItem(key, value);
        return true;
    },

    async removeItem(key) {
        if (isExtension) {
            return await ExtensionStorage.remove(key);
        }
        localStorage.removeItem(key);
        return true;
    }
};

// 导出到全局
window.StorageManager = StorageManager;
window.DataManager = DataManager;
window.ExtensionStorage = ExtensionStorage;
