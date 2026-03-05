/* apps.config.js - 应用导航配置 */
const appConfig = {
    categories: [
        {
            id: 'all',
            name: '全部应用',
            icon: './image/icons/view.svg'
        },
        {
            id: 'media',
            name: '娱乐媒体',
            icon: './image/icons/heart.svg'
        },
        {
            id: 'productivity',
            name: '效率工具',
            icon: './image/icons/star.svg'
        },
        {
            id: 'dev',
            name: '开发工具',
            icon: './image/icons/setting.svg'
        }
    ],
    apps: [
        {
            id: 'bilibili',
            name: 'Bilibili',
            description: '哔哩哔哩弹幕视频网',
            icon: 'https://favicon.im/www.bilibili.com',
            url: 'https://www.bilibili.com/',
            category: 'media'
        },
        {
            id: 'kimi',
            name: 'Kimi AI',
            description: 'Kimi 智能助手',
            icon: 'https://favicon.im/kimi.moonshot.cn',
            url: 'https://kimi.moonshot.cn/',
            category: 'productivity'
        },
        {
            id: 'github',
            name: 'GitHub',
            description: '代码托管平台',
            icon: 'https://favicon.im/github.com',
            url: 'https://github.com/',
            category: 'dev'
        }
    ]
};
