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
    USER_UI_LIB_KEY: 'appNavigator_user_uiLib',
    _cache: null,
    _userUiLibCache: null,
    _initPromise: null,

    // 从统一配置文件获取默认数据
    get defaultData() {
        return DefaultData?.appNavigator || {
            categories: [
                { id: 'all', name: '全部应用', icon: './image/icons/view.svg' },
                { id: 'media', name: '娱乐媒体', icon: './image/icons/heart.svg' },
                { id: 'productivity', name: '效率工具', icon: './image/icons/star.svg' },
                { id: 'dev', name: '开发工具', icon: './image/icons/setting.svg' }
            ],
            apps: [
                { id: '1', name: 'Bilibili', description: '哔哩哔哩弹幕视频网', icon: 'https://favicon.im/www.bilibili.com', url: 'https://www.bilibili.com/', category: 'media' },
                { id: '2', name: 'Kimi AI', description: 'Kimi 智能助手', icon: 'https://favicon.im/kimi.moonshot.cn', url: 'https://kimi.moonshot.cn/', category: 'productivity' },
                { id: '3', name: 'GitHub', description: '代码托管平台', icon: 'https://favicon.im/github.com', url: 'https://github.com/', category: 'dev' }
            ]
        };
    },

    // 系统 UI 库（从配置读取，不保存到 storage）
    get systemUiLib() {
        return DefaultData?.systemUiLib || {
            categories: [{ id: 'element', name: 'Element UI' }],
            items: []
        };
    },

    // 用户 UI 默认空
    get defaultUserUiLib() {
        return {
            categories: [],
            items: []
        };
    },

    // 初始化
    async init() {
        if (this._initPromise) return this._initPromise;
        
        this._initPromise = (async () => {
            try {
                console.log('DataManager 初始化开始...');
                
                // 加载主数据
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
                
                // 只加载用户 UI，系统 UI 从配置实时读取
                const userUiLib = await StorageManager.get(this.USER_UI_LIB_KEY);
                if (userUiLib && userUiLib.categories) {
                    this._userUiLibCache = userUiLib;
                } else {
                    this._userUiLibCache = JSON.parse(JSON.stringify(this.defaultUserUiLib));
                    await this.syncUserUiLib();
                }
            } catch (error) {
                console.error('DataManager 初始化失败:', error);
                // 使用默认数据作为回退
                this._cache = JSON.parse(JSON.stringify(this.defaultData));
                this._userUiLibCache = JSON.parse(JSON.stringify(this.defaultUserUiLib));
            }
        })();
        
        return this._initPromise;
    },

    // 获取数据
    async getData() {
        await this.init();
        return JSON.parse(JSON.stringify(this._cache));
    },

    // 获取完整的 UI 库（系统 + 用户）
    async getUiLib() {
        await this.init();
        const system = this.systemUiLib;
        const user = this._userUiLibCache;
        
        // 合并系统 UI 和用户 UI
        const merged = {
            categories: [
                ...system.categories,
                ...user.categories
            ],
            items: [
                ...system.items.map(item => ({ ...item, isSystem: true })),
                ...user.items.map(item => ({ ...item, isSystem: false }))
            ]
        };
        
        return JSON.parse(JSON.stringify(merged));
    },

    // 只获取用户 UI（用于导出）
    async getUserUiLib() {
        await this.init();
        return JSON.parse(JSON.stringify(this._userUiLibCache));
    },

    // 同步主数据到存储
    async sync() {
        if (this._cache) {
            await StorageManager.set(this.STORAGE_KEY, this._cache);
        }
    },

    // 强制立即同步（兼容接口）
    async syncNow() {
        await this.sync();
        await this.syncUserUiLib();
    },

    // 同步用户 UI 到存储
    async syncUserUiLib() {
        if (this._userUiLibCache) {
            await StorageManager.set(this.USER_UI_LIB_KEY, this._userUiLibCache);
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

    // 导出数据（只导出用户数据）
    async exportData() {
        await this.init();
        return {
            data: JSON.parse(JSON.stringify(this._cache)),
            userUiLib: JSON.parse(JSON.stringify(this._userUiLibCache)),
            exportTime: new Date().toISOString(),
            version: '1.0'
        };
    },

    // 别名，与 app.js 保持一致
    async export() {
        return this.exportData();
    },

    // 导入数据（只导入用户 UI）
    async importData(data) {
        // 导入应用数据
        if (data.data && data.data.categories && data.data.apps) {
            this._cache = JSON.parse(JSON.stringify(data.data));
            await this.sync();
        } 
        // 支持简化格式
        else if (data.categories && data.apps) {
            this._cache = JSON.parse(JSON.stringify(data));
            await this.sync();
        }
        
        // 只导入用户 UI
        if (data.userUiLib) {
            this._userUiLibCache = data.userUiLib;
            await this.syncUserUiLib();
        } else if (data.uiLib) {
            // 兼容旧格式：过滤掉与系统 UI id 冲突的项目
            const systemIds = this.systemUiLib.items.map(i => i.id);
            const userItems = data.uiLib.items.filter(i => !systemIds.includes(i.id));
            const systemCatIds = this.systemUiLib.categories.map(c => c.id);
            const userCategories = data.uiLib.categories.filter(c => !systemCatIds.includes(c.id));
            
            this._userUiLibCache = {
                categories: userCategories,
                items: userItems
            };
            await this.syncUserUiLib();
        }
    },

    // 重置为默认
    async resetToDefault() {
        this._cache = JSON.parse(JSON.stringify(this.defaultData));
        this._userUiLibCache = JSON.parse(JSON.stringify(this.defaultUserUiLib));
        await this.sync();
        await this.syncUserUiLib();
    },

    // ==================== UI 图标库管理（只操作用户 UI）====================
    async addUiCategory(name) {
        await this.init();
        const category = { 
            id: 'uicat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name 
        };
        this._userUiLibCache.categories.push(category);
        await this.syncUserUiLib();
        return category;
    },

    async deleteUiCategory(id) {
        await this.init();
        // 检查是否是系统分类
        const systemCategory = this.systemUiLib.categories.find(c => c.id === id);
        if (systemCategory) {
            console.warn('不能删除系统分类');
            return;
        }
        this._userUiLibCache.categories = this._userUiLibCache.categories.filter(c => c.id !== id);
        this._userUiLibCache.items = this._userUiLibCache.items.filter(i => i.category !== id);
        await this.syncUserUiLib();
    },

    async addUiItem(item) {
        await this.init();
        const newItem = {
            id: 'uiitem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...item
        };
        this._userUiLibCache.items.push(newItem);
        await this.syncUserUiLib();
        return newItem;
    },

    async deleteUiItem(id) {
        await this.init();
        // 检查是否是系统图标
        const systemItem = this.systemUiLib.items.find(i => i.id === id);
        if (systemItem) {
            console.warn('不能删除系统图标');
            return;
        }
        this._userUiLibCache.items = this._userUiLibCache.items.filter(i => i.id !== id);
        await this.syncUserUiLib();
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
