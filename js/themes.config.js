// ==================== 主题配置 ====================
// 配置已从 config/themes.json 加载，通过 themeConfig 全局变量访问

// 主题管理器类
class ThemeManager {
    constructor() {
        // 确保配置已加载
        if (!themeConfig) {
            console.warn('ThemeManager: themeConfig 尚未加载，使用默认配置');
            themeConfig = {
                defaultTheme: 'material-rose',
                themes: []
            };
        }
    }

    getCurrentTheme() {
        const savedTheme = localStorage.getItem('selectedTheme');
        const themeId = savedTheme || themeConfig.defaultTheme || 'material-rose';
        return this.getThemeById(themeId);
    }

    getThemeById(themeId) {
        return themeConfig.themes.find(t => t.id === themeId) || themeConfig.themes[0];
    }

    applyTheme(themeId, save = true) {
        const theme = this.getThemeById(themeId);
        if (!theme || !theme.colors) return false;

        const root = document.documentElement;
        Object.entries(theme.colors).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });

        // 设置 RGB 变量（用于透明度混合）
        Object.entries(theme.colors).forEach(([key, value]) => {
            if (value.startsWith('#') && value.length === 7) {
                const r = parseInt(value.slice(1, 3), 16);
                const g = parseInt(value.slice(3, 5), 16);
                const b = parseInt(value.slice(5, 7), 16);
                root.style.setProperty(`${key}-rgb`, `${r}, ${g}, ${b}`);
            }
        });

        if (save) {
            localStorage.setItem('selectedTheme', themeId);
        }

        // 触发主题变更事件
        document.dispatchEvent(new CustomEvent('themeChanged', { detail: { themeId, theme } }));

        return true;
    }

    getAllThemes() {
        return themeConfig.themes || [];
    }
}

// 为了兼容性，保留全局 themeConfig 访问
// themeConfig 由 configLoader.js 填充
