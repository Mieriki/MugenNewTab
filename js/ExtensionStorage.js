// 旧入口兼容层。新页面请直接加载 storage.js。
(function() {
    'use strict';

    if (!window.StorageManager || !window.DataManager) {
        throw new Error('ExtensionStorage.js 需要先加载 storage.js');
    }

    window.ExtensionStorage = {
        get: key => window.StorageManager.get(key),
        set: (key, value) => window.StorageManager.set(key, value),
        remove: key => window.StorageManager.remove(key),
        getMulti: keys => window.StorageManager.getMany(keys),
        setMulti: items => window.StorageManager.setMany(items)
    };

    window.AppStorage = {
        async getItem(key) {
            const value = await window.StorageManager.get(key);
            return value === null ? null : JSON.stringify(value);
        },
        async setItem(key, value) {
            await window.StorageManager.set(key, JSON.parse(value));
            return true;
        },
        async removeItem(key) {
            await window.StorageManager.remove(key);
            return true;
        }
    };
})();
