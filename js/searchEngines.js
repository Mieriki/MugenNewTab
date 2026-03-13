// ==================== 搜索引擎配置 ====================
// 配置已从 config/searchEngines.json 加载，通过 searchEngines 全局变量访问

// 搜索引擎工具函数
const SearchEngineUtils = {
    // 获取所有搜索引擎
    getAll() {
        return searchEngines || [];
    },

    // 获取默认搜索引擎
    getDefault() {
        return (searchEngines && searchEngines[0]) || null;
    },

    // 根据索引获取搜索引擎
    getByIndex(index) {
        if (!searchEngines || index < 0 || index >= searchEngines.length) {
            return null;
        }
        return searchEngines[index];
    },

    // 构建搜索 URL
    buildSearchUrl(engine, query) {
        if (!engine || !engine.url) return null;
        return engine.url.replace('{q}', encodeURIComponent(query));
    },

    // 执行搜索
    search(engine, query) {
        const url = this.buildSearchUrl(engine, query);
        if (url) {
            window.open(url, '_blank');
        }
    }
};

// searchEngines 全局变量由 configLoader.js 填充
