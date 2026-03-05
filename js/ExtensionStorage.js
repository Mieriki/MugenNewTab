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
    UI_LIB_KEY: 'appNavigator_uiLib',
    _cache: null,
    _uiLibCache: null,
    _initPromise: null,

    // 默认数据 - 与 app.js 保持一致
    defaultData: {
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
    },

    // 默认 UI 图标库 - 与 app.js 保持一致
    defaultUiLib: {
        categories: [
            { id: 'element', name: 'Element UI' }
        ],
        items: [
            // Element UI 图标（本地 SVG，无网络也可用）
            { id: 'el-user', name: '用户', url: './image/icons/user.svg', category: 'element' },
            { id: 'el-setting', name: '设置', url: './image/icons/setting.svg', category: 'element' },
            { id: 'el-home', name: '首页', url: './image/icons/home.svg', category: 'element' },
            { id: 'el-search', name: '搜索', url: './image/icons/search.svg', category: 'element' },
            { id: 'el-message', name: '消息', url: './image/icons/message.svg', category: 'element' },
            { id: 'el-menu', name: '菜单', url: './image/icons/menu.svg', category: 'element' },
            { id: 'el-close', name: '关闭', url: './image/icons/close.svg', category: 'element' },
            { id: 'el-plus', name: '添加', url: './image/icons/plus.svg', category: 'element' },
            { id: 'el-delete', name: '删除', url: './image/icons/delete.svg', category: 'element' },
            { id: 'el-edit', name: '编辑', url: './image/icons/edit.svg', category: 'element' },
            { id: 'el-view', name: '查看', url: './image/icons/view.svg', category: 'element' },
            { id: 'el-upload', name: '上传', url: './image/icons/upload.svg', category: 'element' },
            { id: 'el-download', name: '下载', url: './image/icons/download.svg', category: 'element' },
            { id: 'el-star', name: '收藏', url: './image/icons/star.svg', category: 'element' },
            { id: 'el-heart', name: '喜欢', url: './image/icons/heart.svg', category: 'element' },
            { id: 'el-folder', name: '文件夹', url: './image/icons/folder.svg', category: 'element' },
            { id: 'el-file', name: '文件', url: './image/icons/file.svg', category: 'element' },
            { id: 'el-link', name: '链接', url: './image/icons/link.svg', category: 'element' },
            { id: 'el-picture', name: '图片', url: './image/icons/picture.svg', category: 'element' },
            { id: 'el-calendar', name: '日历', url: './image/icons/calendar.svg', category: 'element' },
            { id: 'el-clock', name: '时钟', url: './image/icons/clock.svg', category: 'element' },
            { id: 'el-location', name: '位置', url: './image/icons/location.svg', category: 'element' },
            { id: 'el-phone', name: '电话', url: './image/icons/phone.svg', category: 'element' },
            { id: 'el-mail', name: '邮件', url: './image/icons/mail.svg', category: 'element' },
            { id: 'el-check', name: '确认', url: './image/icons/check.svg', category: 'element' },
            { id: 'el-warning', name: '警告', url: './image/icons/warning.svg', category: 'element' },
            { id: 'el-info', name: '信息', url: './image/icons/info.svg', category: 'element' },
            { id: 'el-question', name: '帮助', url: './image/icons/question.svg', category: 'element' },
            { id: 'el-lock', name: '锁定', url: './image/icons/lock.svg', category: 'element' },
            { id: 'el-unlock', name: '解锁', url: './image/icons/unlock.svg', category: 'element' },
            { id: 'el-share', name: '分享', url: './image/icons/share.svg', category: 'element' },
            { id: 'el-copy', name: '复制', url: './image/icons/copy.svg', category: 'element' },
            { id: 'el-bell', name: '通知', url: './image/icons/bell.svg', category: 'element' },
            { id: 'el-code', name: '代码', url: './image/icons/code.svg', category: 'element' },
            { id: 'el-terminal', name: '终端', url: './image/icons/terminal.svg', category: 'element' },
            { id: 'el-refresh', name: '刷新', url: './image/icons/refresh.svg', category: 'element' },
            { id: 'el-more', name: '更多', url: './image/icons/more.svg', category: 'element' },
            { id: 'el-sort', name: '排序', url: './image/icons/sort.svg', category: 'element' },
            { id: 'el-filter', name: '筛选', url: './image/icons/filter.svg', category: 'element' },
            { id: 'el-logout', name: '退出', url: './image/icons/logout.svg', category: 'element' }
        ]
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
                
                // 加载 UI 图标库数据
                const uiLib = await StorageManager.get(this.UI_LIB_KEY);
                if (uiLib && uiLib.categories && uiLib.items) {
                    this._uiLibCache = uiLib;
                } else {
                    this._uiLibCache = JSON.parse(JSON.stringify(this.defaultUiLib));
                    await this.syncUiLib();
                }
            } catch (error) {
                console.error('DataManager 初始化失败:', error);
                // 使用默认数据作为回退
                this._cache = JSON.parse(JSON.stringify(this.defaultData));
                this._uiLibCache = JSON.parse(JSON.stringify(this.defaultUiLib));
            }
        })();
        
        return this._initPromise;
    },

    // 获取数据
    async getData() {
        await this.init();
        return JSON.parse(JSON.stringify(this._cache));
    },

    // 获取 UI 图标库
    async getUiLib() {
        await this.init();
        return JSON.parse(JSON.stringify(this._uiLibCache));
    },

    // 同步主数据到存储
    async sync() {
        if (this._cache) {
            await StorageManager.set(this.STORAGE_KEY, this._cache);
        }
    },

    // 同步 UI 图标库到存储
    async syncUiLib() {
        if (this._uiLibCache) {
            await StorageManager.set(this.UI_LIB_KEY, this._uiLibCache);
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
        return {
            data: JSON.parse(JSON.stringify(this._cache)),
            uiLib: JSON.parse(JSON.stringify(this._uiLibCache)),
            exportTime: new Date().toISOString(),
            version: '1.0'
        };
    },

    // 别名，与 app.js 保持一致
    async export() {
        return this.exportData();
    },

    // 导入数据（支持两种格式：纯数据对象或包含 data/uiLib 的导出格式）
    async importData(data) {
        // 支持导出时的完整格式 { data: {...}, uiLib: {...} }
        if (data.data && data.data.categories && data.data.apps) {
            this._cache = JSON.parse(JSON.stringify(data.data));
            await this.sync();
            if (data.uiLib && data.uiLib.items) {
                this._uiLibCache = JSON.parse(JSON.stringify(data.uiLib));
                await this.syncUiLib();
            }
        } 
        // 支持简化格式 { categories: [...], apps: [...] }
        else if (data.categories && data.apps) {
            this._cache = JSON.parse(JSON.stringify(data));
            await this.sync();
        }
    },

    // 重置为默认
    async resetToDefault() {
        this._cache = JSON.parse(JSON.stringify(this.defaultData));
        await this.sync();
    },

    // ==================== UI 图标库管理 ====================
    async addUiCategory(name) {
        await this.init();
        const category = { 
            id: 'uicat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name 
        };
        this._uiLibCache.categories.push(category);
        await this.syncUiLib();
        return category;
    },

    async deleteUiCategory(id) {
        await this.init();
        this._uiLibCache.categories = this._uiLibCache.categories.filter(c => c.id !== id);
        this._uiLibCache.items = this._uiLibCache.items.filter(i => i.category !== id);
        await this.syncUiLib();
    },

    async addUiItem(item) {
        await this.init();
        const newItem = {
            id: 'uiitem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...item
        };
        this._uiLibCache.items.push(newItem);
        await this.syncUiLib();
        return newItem;
    },

    async deleteUiItem(id) {
        await this.init();
        this._uiLibCache.items = this._uiLibCache.items.filter(i => i.id !== id);
        await this.syncUiLib();
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
