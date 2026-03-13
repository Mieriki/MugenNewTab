// ==================== 配置加载器 ====================
// 从 JSON 文件同步加载所有配置

const ConfigLoader = {
    _cache: {},

    // 同步加载 JSON 配置
    loadSync(configName) {
        if (this._cache[configName]) {
            return this._cache[configName];
        }

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `config/${configName}.json`, false); // 同步请求
            xhr.send();

            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                this._cache[configName] = data;
                return data;
            } else {
                console.warn(`ConfigLoader: 无法加载 ${configName}.json，状态码: ${xhr.status}`);
                return null;
            }
        } catch (error) {
            console.error(`ConfigLoader: 加载 ${configName}.json 失败`, error);
            return null;
        }
    },

    // 异步加载（用于动态刷新）
    async load(configName) {
        if (this._cache[configName]) {
            return this._cache[configName];
        }

        try {
            const response = await fetch(`config/${configName}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${configName}.json`);
            }
            const data = await response.json();
            this._cache[configName] = data;
            return data;
        } catch (error) {
            console.error(`ConfigLoader: 异步加载 ${configName}.json 失败`, error);
            return null;
        }
    }
};

// 全局配置对象
let themeConfig = null;
let searchEngines = null;
let DefaultData = null;

// 初始化配置（同步执行，确保后续脚本可用）
(function initConfigs() {
    // 加载主题配置
    const themes = ConfigLoader.loadSync('themes');
    if (themes) {
        themeConfig = themes;
    } else {
        // 默认主题配置
        themeConfig = {
            defaultTheme: 'material-rose',
            themes: [{
                id: 'material-rose',
                name: 'Mugen娘经典配色',
                logo: 'image/白猫.svg',
                colors: {
                    '--md-sys-color-primary': '#B14A6B',
                    '--md-sys-color-on-primary': '#FFFFFF',
                    '--md-sys-color-primary-container': '#FFD8E1',
                    '--md-sys-color-on-primary-container': '#3D001F',
                    '--md-sys-color-secondary': '#7D5F65',
                    '--md-sys-color-on-secondary': '#FFFFFF',
                    '--md-sys-color-secondary-container': '#FFD8E1',
                    '--md-sys-color-on-secondary-container': '#2A1519',
                    '--md-sys-color-tertiary': '#8B6E3D',
                    '--md-sys-color-on-tertiary': '#FFFFFF',
                    '--md-sys-color-tertiary-container': '#FFDEA7',
                    '--md-sys-color-on-tertiary-container': '#2A1800',
                    '--md-sys-color-surface': '#FFF8F9',
                    '--md-sys-color-surface-variant': '#F3DDE2',
                    '--md-sys-color-on-surface': '#201A1A',
                    '--md-sys-color-on-surface-variant': '#534345',
                    '--md-sys-color-background': '#FFF8F9',
                    '--md-sys-color-on-background': '#201A1A',
                    '--md-sys-color-outline': '#847376',
                    '--md-sys-color-error': '#BA1A1A',
                    '--md-sys-color-success': '#376B2F',
                    '--md-sys-color-inverse-surface': '#201A1A',
                    '--md-sys-color-inverse-on-surface': '#F3DDE2'
                }
            }]
        };
    }

    // 加载搜索引擎配置
    const engines = ConfigLoader.loadSync('searchEngines');
    if (engines) {
        searchEngines = engines;
    } else {
        // 默认搜索引擎
        searchEngines = [
            { name: 'Google', url: 'https://www.google.com/search?q={q}', icon: 'https://www.google.com/favicon.ico' },
            { name: 'Bing', url: 'https://www.bing.com/search?q={q}', icon: 'https://www.bing.com/favicon.ico' },
            { name: '百度', url: 'https://www.baidu.com/s?wd={q}', icon: 'https://www.baidu.com/favicon.ico' },
            { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}', icon: 'https://duckduckgo.com/favicon.ico' },
            { name: 'GitHub', url: 'https://github.com/search?q={q}', icon: 'https://github.com/favicon.ico' },
            { name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q={q}', icon: 'https://stackoverflow.com/favicon.ico' }
        ];
    }

    // 加载默认数据配置
    const data = ConfigLoader.loadSync('defaultData');
    if (data) {
        DefaultData = data;
    } else {
        // 默认数据
        DefaultData = {
            appNavigator: {
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
            systemUiLib: {
                categories: [{ id: 'element', name: 'Element UI' }],
                items: [
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
            userUiLib: {
                categories: [],
                items: []
            }
        };
    }

    console.log('ConfigLoader: 配置加载完成');
})();
