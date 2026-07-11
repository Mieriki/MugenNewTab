// MugenNewTab 统一存储与数据管理层
// 主页面、popup 和云同步必须共用本文件，避免缓存与持久化语义分叉。
(function() {
    'use strict';

    const MAIN_DATA_KEY = 'appNavigator_data';
    const USER_UI_LIB_KEY = 'appNavigator_user_uiLib';
    const DATA_UPDATED_AT_KEY = 'appNavigator_dataUpdatedAt';
    const STORAGE_EVENT = 'mugen-storage-change';
    const WRITE_LOCK = 'mugen-newtab-data-write';
    const SYNC_MIRROR_KEYS = new Set([
        'selectedTheme',
        'selectedSearchEngine',
        'searchHistory',
        'sidebarCollapsed'
    ]);

    function clone(value) {
        if (value === undefined || value === null) return value;
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function parseStoredValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch (_) {
            return value;
        }
    }

    function valuesEqual(left, right) {
        if (left === right) return true;
        try {
            return JSON.stringify(left) === JSON.stringify(right);
        } catch (_) {
            return false;
        }
    }

    const StorageManager = {
        isExtension: Boolean(window.isExtension),

        getSync(key) {
            return parseStoredValue(localStorage.getItem(key));
        },

        async get(key) {
            try {
                const result = await BrowserAPI.storage.local.get(key);
                let value = result && typeof result === 'object' ? result[key] : result;

                // 主题等首屏设置需要同步读取，因此在扩展存储中缺失时兼容旧 localStorage 数据。
                if ((value === undefined || value === null) && this.isExtension && SYNC_MIRROR_KEYS.has(key)) {
                    value = this.getSync(key);
                    if (value !== null) {
                        await BrowserAPI.storage.local.set({ [key]: value });
                    }
                }
                return value === undefined ? null : clone(value);
            } catch (error) {
                throw new Error(`读取存储项 ${key} 失败`, { cause: error });
            }
        },

        async getMany(keys) {
            const entries = await Promise.all(keys.map(async key => [key, await this.get(key)]));
            return Object.fromEntries(entries);
        },

        set(key, value) {
            return this.setMany({ [key]: value });
        },

        async setMany(items) {
            const storedItems = clone(items);
            const previousMirrors = new Map();

            // 同步镜像只用于防止首屏闪烁；真实数据仍以统一存储后端为准。
            for (const [key, value] of Object.entries(storedItems)) {
                if (SYNC_MIRROR_KEYS.has(key)) {
                    previousMirrors.set(key, localStorage.getItem(key));
                    localStorage.setItem(key, JSON.stringify(value));
                }
            }

            try {
                await BrowserAPI.storage.local.set(storedItems);
            } catch (error) {
                for (const [key, previous] of previousMirrors) {
                    if (previous === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, previous);
                }
                throw new Error('写入浏览器存储失败，数据未保存', { cause: error });
            }

            window.dispatchEvent(new CustomEvent(STORAGE_EVENT, {
                detail: Object.fromEntries(Object.entries(storedItems).map(([key, value]) => [key, {
                    newValue: clone(value)
                }]))
            }));
        },

        async remove(key) {
            try {
                await BrowserAPI.storage.local.remove(key);
                if (SYNC_MIRROR_KEYS.has(key)) localStorage.removeItem(key);
            } catch (error) {
                throw new Error(`删除存储项 ${key} 失败`, { cause: error });
            }

            window.dispatchEvent(new CustomEvent(STORAGE_EVENT, {
                detail: { [key]: { newValue: undefined } }
            }));
        },

        subscribe(listener) {
            const localHandler = event => listener(event.detail || {});
            window.addEventListener(STORAGE_EVENT, localHandler);

            const storageHandler = event => {
                if (!event.key) return;
                listener({ [event.key]: { newValue: parseStoredValue(event.newValue) } });
            };
            if (!this.isExtension) window.addEventListener('storage', storageHandler);

            const apiRoot = window.browser || window.chrome;
            const nativeHandler = (changes, areaName) => {
                if (areaName === 'local') listener(changes);
            };
            if (this.isExtension && apiRoot?.storage?.onChanged?.addListener) {
                apiRoot.storage.onChanged.addListener(nativeHandler);
            }

            return () => {
                window.removeEventListener(STORAGE_EVENT, localHandler);
                window.removeEventListener('storage', storageHandler);
                if (this.isExtension && apiRoot?.storage?.onChanged?.removeListener) {
                    apiRoot.storage.onChanged.removeListener(nativeHandler);
                }
            };
        }
    };

    const DataManager = {
        STORAGE_KEY: MAIN_DATA_KEY,
        USER_UI_LIB_KEY,
        _cache: null,
        _userUiLibCache: null,
        _initPromise: null,
        _unsubscribeStorage: null,
        _writeQueue: Promise.resolve(),

        get defaultData() {
            const config = typeof DefaultData !== 'undefined' ? DefaultData : window.DefaultData;
            return config?.appNavigator || { categories: [], apps: [] };
        },

        get systemUiLib() {
            const config = typeof DefaultData !== 'undefined' ? DefaultData : window.DefaultData;
            return config?.systemUiLib || { categories: [], items: [] };
        },

        get defaultUserUiLib() {
            return { categories: [], items: [] };
        },

        _isMainData(data) {
            return Boolean(data && Array.isArray(data.categories) && Array.isArray(data.apps));
        },

        _normalizeMainData(data) {
            const normalized = clone(data);
            if (!normalized.categories.some(category => category.id === 'all')) {
                const defaultAll = this.defaultData.categories?.find(category => category.id === 'all') || {
                    id: 'all',
                    name: '全部应用',
                    icon: './image/icons/menu.svg',
                    monochrome: true
                };
                normalized.categories.unshift(clone(defaultAll));
            }
            return normalized;
        },

        _isUserUiLib(data) {
            return Boolean(data && Array.isArray(data.categories) && Array.isArray(data.items));
        },

        _withWriteLock(task) {
            if (navigator.locks?.request) {
                return navigator.locks.request(WRITE_LOCK, { mode: 'exclusive' }, task);
            }

            const result = this._writeQueue.then(task, task);
            this._writeQueue = result.catch(() => undefined);
            return result;
        },

        _emitChange(kind, source) {
            window.dispatchEvent(new CustomEvent('appNavigator:data-changed', {
                detail: { kind, source }
            }));
        },

        _scheduleCloudSync() {
            if (window.CloudSyncManager?.scheduleAutoSync) {
                window.CloudSyncManager.scheduleAutoSync();
            }
        },

        _handleStorageChanges(changes) {
            const mainChange = changes[MAIN_DATA_KEY];
            if (mainChange && this._isMainData(mainChange.newValue)) {
                const normalized = this._normalizeMainData(mainChange.newValue);
                if (!valuesEqual(this._cache, normalized)) {
                    this._cache = normalized;
                    this._emitChange('data', 'external');
                }
            }

            const uiChange = changes[USER_UI_LIB_KEY];
            if (uiChange && this._isUserUiLib(uiChange.newValue) && !valuesEqual(this._userUiLibCache, uiChange.newValue)) {
                this._userUiLibCache = clone(uiChange.newValue);
                this._emitChange('uiLib', 'external');
            }
        },

        async init() {
            if (this._initPromise) return this._initPromise;

            this._initPromise = this._withWriteLock(async () => {
                const saved = await StorageManager.getMany([MAIN_DATA_KEY, USER_UI_LIB_KEY]);
                const writes = {};

                this._cache = this._isMainData(saved[MAIN_DATA_KEY])
                    ? this._normalizeMainData(saved[MAIN_DATA_KEY])
                    : this._normalizeMainData(this.defaultData);
                this._userUiLibCache = this._isUserUiLib(saved[USER_UI_LIB_KEY])
                    ? clone(saved[USER_UI_LIB_KEY])
                    : clone(this.defaultUserUiLib);

                if (!this._isMainData(saved[MAIN_DATA_KEY]) || !valuesEqual(saved[MAIN_DATA_KEY], this._cache)) {
                    writes[MAIN_DATA_KEY] = this._cache;
                }
                if (!this._isUserUiLib(saved[USER_UI_LIB_KEY])) writes[USER_UI_LIB_KEY] = this._userUiLibCache;
                if (Object.keys(writes).length > 0) await StorageManager.setMany(writes);

                if (!this._unsubscribeStorage) {
                    this._unsubscribeStorage = StorageManager.subscribe(changes => this._handleStorageChanges(changes));
                }
            }).catch(error => {
                this._initPromise = null;
                throw error;
            });

            return this._initPromise;
        },

        async getData() {
            await this.init();
            return clone(this._cache);
        },

        async getUiLib() {
            await this.init();
            const system = this.systemUiLib;
            const user = this._userUiLibCache;
            return clone({
                categories: [...system.categories, ...user.categories],
                items: [
                    ...system.items.map(item => ({ ...item, isSystem: true })),
                    ...user.items.map(item => ({ ...item, isSystem: false }))
                ]
            });
        },

        async getUserUiLib() {
            await this.init();
            return clone(this._userUiLibCache);
        },

        async _commitMain(data) {
            if (!this._isMainData(data)) throw new TypeError('应用数据格式无效');
            const previous = this._cache;
            this._cache = this._normalizeMainData(data);
            try {
                await StorageManager.setMany({
                    [MAIN_DATA_KEY]: this._cache,
                    [DATA_UPDATED_AT_KEY]: Date.now()
                });
            } catch (error) {
                this._cache = previous;
                throw error;
            }
            this._scheduleCloudSync();
        },

        async _commitUserUiLib(data) {
            if (!this._isUserUiLib(data)) throw new TypeError('用户图标库格式无效');
            const previous = this._userUiLibCache;
            this._userUiLibCache = clone(data);
            try {
                await StorageManager.setMany({
                    [USER_UI_LIB_KEY]: this._userUiLibCache,
                    [DATA_UPDATED_AT_KEY]: Date.now()
                });
            } catch (error) {
                this._userUiLibCache = previous;
                throw error;
            }
            this._scheduleCloudSync();
        },

        async _mutateMain(mutator) {
            await this.init();
            return this._withWriteLock(async () => {
                const persisted = await StorageManager.get(MAIN_DATA_KEY);
                const draft = this._normalizeMainData(this._isMainData(persisted) ? persisted : this._cache);
                const result = mutator(draft);
                await this._commitMain(draft);
                return clone(result);
            });
        },

        async _mutateUserUiLib(mutator) {
            await this.init();
            return this._withWriteLock(async () => {
                const persisted = await StorageManager.get(USER_UI_LIB_KEY);
                const draft = clone(this._isUserUiLib(persisted) ? persisted : this._userUiLibCache);
                const result = mutator(draft);
                await this._commitUserUiLib(draft);
                return clone(result);
            });
        },

        async saveData(data) {
            await this.init();
            return this._withWriteLock(() => this._commitMain(clone(data)));
        },

        async saveUserUiLib(data) {
            await this.init();
            return this._withWriteLock(() => this._commitUserUiLib(clone(data)));
        },

        async sync() {
            await this.init();
        },

        async syncNow() {
            await this.init();
        },

        async addApp(app) {
            return this._mutateMain(data => {
                const newApp = { ...clone(app), id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 11)}` };
                data.apps.push(newApp);
                return newApp;
            });
        },

        async updateApp(id, updates) {
            return this._mutateMain(data => {
                const index = data.apps.findIndex(app => app.id === id);
                if (index === -1) return null;
                data.apps[index] = { ...data.apps[index], ...clone(updates), id };
                return data.apps[index];
            });
        },

        async deleteApp(id) {
            return this._mutateMain(data => {
                const before = data.apps.length;
                data.apps = data.apps.filter(app => app.id !== id);
                return data.apps.length !== before;
            });
        },

        async updateAppsOrder(orderedIds) {
            return this._mutateMain(data => {
                const appsById = new Map(data.apps.map(app => [app.id, app]));
                const ordered = [];
                for (const id of orderedIds) {
                    if (appsById.has(id)) {
                        ordered.push(appsById.get(id));
                        appsById.delete(id);
                    }
                }
                data.apps = [...ordered, ...appsById.values()];
            });
        },

        async addCategory(category) {
            return this._mutateMain(data => {
                const newCategory = { ...clone(category), id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}` };
                data.categories.push(newCategory);
                return newCategory;
            });
        },

        async updateCategoriesOrder(orderedIds) {
            return this._mutateMain(data => {
                const all = data.categories.find(category => category.id === 'all');
                const categoriesById = new Map(data.categories
                    .filter(category => category.id !== 'all')
                    .map(category => [category.id, category]));
                const ordered = [];
                for (const id of orderedIds) {
                    if (categoriesById.has(id)) {
                        ordered.push(categoriesById.get(id));
                        categoriesById.delete(id);
                    }
                }
                data.categories = [...(all ? [all] : []), ...ordered, ...categoriesById.values()];
            });
        },

        async updateCategory(id, updates) {
            return this._mutateMain(data => {
                const index = data.categories.findIndex(category => category.id === id);
                if (index === -1) return null;
                data.categories[index] = { ...data.categories[index], ...clone(updates), id };
                return data.categories[index];
            });
        },

        async deleteCategory(id) {
            if (id === 'all') return false;
            return this._mutateMain(data => {
                const before = data.categories.length;
                data.categories = data.categories.filter(category => category.id !== id);
                data.apps = data.apps.filter(app => app.category !== id);
                return data.categories.length !== before;
            });
        },

        async addUiCategory(name) {
            return this._mutateUserUiLib(uiLib => {
                const category = { id: `uicat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, name };
                uiLib.categories.push(category);
                return category;
            });
        },

        async deleteUiCategory(id) {
            if (this.systemUiLib.categories.some(category => category.id === id)) return false;
            return this._mutateUserUiLib(uiLib => {
                const before = uiLib.categories.length;
                uiLib.categories = uiLib.categories.filter(category => category.id !== id);
                uiLib.items = uiLib.items.filter(item => item.category !== id);
                return uiLib.categories.length !== before;
            });
        },

        async addUiItem(item) {
            return this._mutateUserUiLib(uiLib => {
                const newItem = { ...clone(item), id: `uiitem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}` };
                uiLib.items.push(newItem);
                return newItem;
            });
        },

        async deleteUiItem(id) {
            if (this.systemUiLib.items.some(item => item.id === id)) return false;
            return this._mutateUserUiLib(uiLib => {
                const before = uiLib.items.length;
                uiLib.items = uiLib.items.filter(item => item.id !== id);
                return uiLib.items.length !== before;
            });
        },

        async export() {
            await this.init();
            return {
                data: clone(this._cache),
                userUiLib: clone(this._userUiLibCache),
                exportTime: new Date().toISOString(),
                version: '2.0'
            };
        },

        async import(jsonData) {
            await this.init();
            const importedMain = jsonData?.data || (jsonData?.categories && jsonData?.apps ? jsonData : null);
            let importedUi = jsonData?.userUiLib || null;

            if (!importedUi && jsonData?.uiLib) {
                const systemItemIds = new Set(this.systemUiLib.items.map(item => item.id));
                const systemCategoryIds = new Set(this.systemUiLib.categories.map(category => category.id));
                importedUi = {
                    categories: (jsonData.uiLib.categories || []).filter(category => !systemCategoryIds.has(category.id)),
                    items: (jsonData.uiLib.items || []).filter(item => !systemItemIds.has(item.id))
                };
            }

            if (importedMain && !this._isMainData(importedMain)) throw new TypeError('备份中的应用数据格式无效');
            if (importedUi && !this._isUserUiLib(importedUi)) throw new TypeError('备份中的图标库格式无效');
            if (!importedMain && !importedUi) throw new TypeError('未找到可导入的数据');

            return this._withWriteLock(async () => {
                const items = { [DATA_UPDATED_AT_KEY]: Date.now() };
                const previousMain = this._cache;
                const previousUi = this._userUiLibCache;
                if (importedMain) {
                    this._cache = this._normalizeMainData(importedMain);
                    items[MAIN_DATA_KEY] = this._cache;
                }
                if (importedUi) {
                    this._userUiLibCache = clone(importedUi);
                    items[USER_UI_LIB_KEY] = this._userUiLibCache;
                }
                try {
                    await StorageManager.setMany(items);
                } catch (error) {
                    this._cache = previousMain;
                    this._userUiLibCache = previousUi;
                    throw error;
                }
                this._scheduleCloudSync();
            });
        },

        async applyStorageSnapshot(snapshot) {
            await this.init();
            const nextMain = snapshot[MAIN_DATA_KEY];
            const nextUi = snapshot[USER_UI_LIB_KEY];
            const hasMain = Object.prototype.hasOwnProperty.call(snapshot, MAIN_DATA_KEY);
            const hasUi = Object.prototype.hasOwnProperty.call(snapshot, USER_UI_LIB_KEY);
            if (hasMain && !this._isMainData(nextMain)) {
                throw new TypeError('云端应用数据格式无效');
            }
            if (hasUi && !this._isUserUiLib(nextUi)) {
                throw new TypeError('云端图标库格式无效');
            }

            await this._withWriteLock(async () => {
                const previousMain = this._cache;
                const previousUi = this._userUiLibCache;
                if (hasMain) this._cache = this._normalizeMainData(nextMain);
                if (hasUi) this._userUiLibCache = clone(nextUi);
                const normalizedSnapshot = clone(snapshot);
                if (hasMain) normalizedSnapshot[MAIN_DATA_KEY] = this._cache;
                if (hasUi) normalizedSnapshot[USER_UI_LIB_KEY] = this._userUiLibCache;
                try {
                    await StorageManager.setMany(normalizedSnapshot);
                } catch (error) {
                    this._cache = previousMain;
                    this._userUiLibCache = previousUi;
                    throw error;
                }
            });
            if (hasMain) this._emitChange('data', 'cloud');
            if (hasUi) this._emitChange('uiLib', 'cloud');
        },

        async resetToDefault() {
            return this.import({
                data: clone(this.defaultData),
                userUiLib: clone(this.defaultUserUiLib)
            });
        }
    };

    window.StorageManager = StorageManager;
    window.DataManager = DataManager;
})();
