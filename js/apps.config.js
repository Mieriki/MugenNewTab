/* apps.config.js - 应用导航配置 */
const appConfig = {
    categories: [
        {
            id: 'all',
            name: '全部应用',
            icon: './image/黑猫.svg'
        },
        {
            id: 'productivity',
            name: '图片处理',
            icon: './image/白猫.svg'
        },
        {
            id: 'link',
            name: '外部链接',
            icon: './image/波斯猫.svg'  
        }
    ],
    apps: [
        {
            id: 'MugenImageBaseRY',
            name: '图片转换base64',
            description: '图片转换base64',
            icon: './image/图片.svg',
            url: './view/image-base64.html',
            category: 'productivity'
        },
        {
            id: 'MugenJson',
            name: 'Json格式化',
            description: 'Json格式化',
            icon: './image/json.svg',
            url: './view/json.html',
            category: 'productivity'
        },
		{
            id: 'MugenCron',
            name: 'Cron生成',
            description: 'Cron生成',
            icon: './image/json.svg',
            url: './view/cron.html',
            category: 'productivity'
        },
		{
            id: 'JsonCn',
            name: 'Json格式化',
            description: 'Json格式化',
            icon: './image/json.svg',
            url: 'https://www.json.cn/',
            category: 'link'
        }
    ]
};