const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storageSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function createRuntime(initial = {}) {
    const backend = clone(initial);
    const local = new Map();
    const listeners = new Map();
    let failNextWrite = false;
    let queue = Promise.resolve();

    const runtime = {
        console,
        structuredClone,
        setTimeout,
        clearTimeout,
        DefaultData: {
            appNavigator: {
                categories: [
                    { id: 'all', name: '全部应用', icon: '📦' },
                    { id: 'cat_default', name: '默认', icon: '📁' }
                ],
                apps: []
            },
            systemUiLib: { categories: [], items: [] }
        },
        localStorage: {
            getItem(key) {
                return local.has(key) ? local.get(key) : null;
            },
            setItem(key, value) {
                local.set(key, String(value));
            },
            removeItem(key) {
                local.delete(key);
            }
        },
        BrowserAPI: {
            storage: {
                local: {
                    async get(key) {
                        return Object.prototype.hasOwnProperty.call(backend, key)
                            ? { [key]: clone(backend[key]) }
                            : {};
                    },
                    async set(items) {
                        if (failNextWrite) {
                            failNextWrite = false;
                            throw new Error('quota exceeded');
                        }
                        Object.assign(backend, clone(items));
                    },
                    async remove(key) {
                        delete backend[key];
                    }
                }
            }
        },
        navigator: {
            locks: {
                request(_name, _options, task) {
                    const result = queue.then(task, task);
                    queue = result.catch(() => undefined);
                    return result;
                }
            }
        },
        CustomEvent: class CustomEvent {
            constructor(type, options = {}) {
                this.type = type;
                this.detail = options.detail;
            }
        },
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        dispatchEvent(event) {
            for (const listener of listeners.get(event.type) || []) listener(event);
            return true;
        }
    };
    runtime.window = runtime;
    runtime.globalThis = runtime;
    runtime.failNextWrite = () => {
        failNextWrite = true;
    };
    runtime.backend = backend;

    vm.runInNewContext(storageSource, runtime, { filename: 'storage.js' });
    return runtime;
}

test('写操作返回前已经持久化', async () => {
    const runtime = createRuntime();
    await runtime.DataManager.init();

    const app = await runtime.DataManager.addApp({
        name: '示例',
        url: 'https://example.com',
        category: 'cat_default'
    });

    assert.equal(runtime.backend.appNavigator_data.apps.length, 1);
    assert.equal(runtime.backend.appNavigator_data.apps[0].id, app.id);
});

test('修改前重新读取最新快照，避免旧缓存覆盖外部更新', async () => {
    const runtime = createRuntime();
    await runtime.DataManager.init();

    runtime.backend.appNavigator_data.apps.push({
        id: 'app_from_popup',
        name: 'Popup 添加',
        url: 'https://popup.example',
        category: 'cat_default'
    });

    await runtime.DataManager.addApp({
        name: '主页面添加',
        url: 'https://main.example',
        category: 'cat_default'
    });

    assert.deepEqual(
        Array.from(runtime.backend.appNavigator_data.apps, app => app.name),
        ['Popup 添加', '主页面添加']
    );
});

test('存储失败会拒绝操作并回滚内存缓存', async () => {
    const runtime = createRuntime();
    await runtime.DataManager.init();
    runtime.failNextWrite();

    await assert.rejects(
        runtime.DataManager.addApp({
            name: '不会保存',
            url: 'https://failed.example',
            category: 'cat_default'
        }),
        /数据未保存/
    );

    assert.equal(runtime.backend.appNavigator_data.apps.length, 0);
    assert.equal((await runtime.DataManager.getData()).apps.length, 0);
});

test('分类局部排序不会删除未出现在排序列表中的分类', async () => {
    const runtime = createRuntime();
    await runtime.DataManager.init();
    const extra = await runtime.DataManager.addCategory({ name: '额外分类', icon: '📂' });

    await runtime.DataManager.updateCategoriesOrder(['cat_default']);

    assert.deepEqual(
        Array.from(runtime.backend.appNavigator_data.categories, category => category.id),
        ['all', 'cat_default', extra.id]
    );
});

test('旧数据缺少全部应用分类时会无损补齐', async () => {
    const runtime = createRuntime({
        appNavigator_data: {
            categories: [{ id: 'cat_legacy', name: '旧分类', icon: '📁' }],
            apps: [{
                id: 'app_legacy',
                name: '旧网站',
                url: 'https://legacy.example',
                category: 'cat_legacy'
            }]
        },
        appNavigator_user_uiLib: { categories: [], items: [] }
    });

    await runtime.DataManager.init();

    assert.deepEqual(
        Array.from(runtime.backend.appNavigator_data.categories, category => category.id),
        ['all', 'cat_legacy']
    );
    assert.equal(runtime.backend.appNavigator_data.apps[0].id, 'app_legacy');
});
