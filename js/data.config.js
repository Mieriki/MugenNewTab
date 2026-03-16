// ==================== 数据配置工具 ====================
// 所有默认数据从 config/defaultData.json 加载，通过 DefaultData 全局变量访问
// DefaultData 由 configLoader.js 同步加载并填充

const DataConfigUtils = {
    // 获取应用导航默认数据
    getAppNavigatorData() {
        return DefaultData?.appNavigator || { categories: [], apps: [] };
    },

    // 获取系统 UI 库默认数据
    getSystemUiLibData() {
        return DefaultData?.systemUiLib || { categories: [], items: [] };
    },

    // 获取用户 UI 库默认空结构
    getUserUiLibTemplate() {
        return { categories: [], items: [] };
    },

    // 获取完整默认数据
    getAll() {
        return DefaultData || {};
    }
};
