// ==================== 默认数据配置 ====================
// 配置已从 config/defaultData.json 加载，通过 DefaultData 全局变量访问

// 数据配置工具
const DataConfigUtils = {
    // 获取应用导航默认数据
    getAppNavigatorData() {
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

    // 获取 UI 库默认数据
    getUiLibData() {
        return DefaultData?.uiLib || {
            categories: [{ id: 'element', name: 'Element UI' }],
            items: []
        };
    },

    // 获取完整默认数据
    getAll() {
        return DefaultData || {};
    }
};

// DefaultData 全局变量由 configLoader.js 填充
