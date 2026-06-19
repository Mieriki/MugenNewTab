// =====================================================
// Theme Loader - 在页面渲染前立即应用主题，防止 FOUC 闪烁
// 注：此脚本必须在 <head> 中同步加载，且在 ThemeManager 之后
// =====================================================

(function() {
    'use strict';
    
    // 标记主题正在加载
    document.documentElement.setAttribute('data-theme-loading', 'true');
    
    // 尝试从 localStorage 读取保存的主题
    const savedThemeId = localStorage.getItem('selectedTheme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // 确定要应用的主题
    let themeId = savedThemeId || 'material-rose';
    
    // 如果没有保存的主题且系统偏好深色模式，尝试使用深色主题
    if (!savedThemeId && prefersDark) {
        // 检查是否有默认的深色主题可用
        const darkThemes = ['midnight-rose', 'silent-library', 'midnight-ocean', 'neon-cyber'];
        if (typeof themeConfig !== 'undefined' && themeConfig.themes) {
            const availableDarkTheme = darkThemes.find(id => 
                themeConfig.themes.some(t => t.id === id)
            );
            if (availableDarkTheme) {
                themeId = availableDarkTheme;
            }
        }
    }
    
    // 尝试应用主题颜色
    function applyThemeColors(themeId) {
        // 检查 themeConfig 是否已加载
        if (typeof themeConfig === 'undefined' || !themeConfig.themes) {
            return false;
        }
        
        const theme = themeConfig.themes.find(t => t.id === themeId);
        if (!theme || !theme.colors) {
            return false;
        }
        
        const root = document.documentElement;
        
        // 应用主题颜色变量
        Object.entries(theme.colors).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
        
        // 如果是深色主题，添加 dark-mode 类（延迟到 DOM 就绪）
        if (theme.isDark) {
            if (document.body) {
                document.body.classList.add('dark-mode');
            } else {
                // DOM 尚未就绪，等待 DOMContentLoaded
                document.addEventListener('DOMContentLoaded', function() {
                    document.body.classList.add('dark-mode');
                });
            }
        } else {
            if (document.body) {
                document.body.classList.remove('dark-mode');
            } else {
                document.addEventListener('DOMContentLoaded', function() {
                    document.body.classList.remove('dark-mode');
                });
            }
        }
        
        // 更新 theme-color meta 标签
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor && theme.colors['--md-sys-color-primary']) {
            metaThemeColor.setAttribute('content', theme.colors['--md-sys-color-primary']);
        }
        
        return true;
    }
    
    // 立即尝试应用主题
    const applied = applyThemeColors(themeId);
    
    // 如果立即应用失败（themeConfig 还未加载），使用 MutationObserver 监听
    if (!applied) {
        let attempts = 0;
        const maxAttempts = 50; // 最多尝试 5 秒
        
        const tryApplyTheme = function() {
            attempts++;
            if (applyThemeColors(themeId)) {
                // 成功应用主题，移除加载状态
                document.documentElement.removeAttribute('data-theme-loading');
                document.documentElement.setAttribute('data-theme-loaded', 'true');
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(tryApplyTheme, 100);
            } else {
                // 超时，仍然移除加载状态避免页面一直隐藏
                console.warn('ThemeLoader: 主题加载超时，使用默认主题');
                document.documentElement.removeAttribute('data-theme-loading');
                document.documentElement.setAttribute('data-theme-loaded', 'true');
            }
        };
        
        // 延迟尝试，等待 themeConfig 加载
        setTimeout(tryApplyTheme, 50);
    } else {
        // 立即应用成功，在 DOM 就绪后移除加载状态
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                document.documentElement.removeAttribute('data-theme-loading');
                document.documentElement.setAttribute('data-theme-loaded', 'true');
            });
        } else {
            document.documentElement.removeAttribute('data-theme-loading');
            document.documentElement.setAttribute('data-theme-loaded', 'true');
        }
    }
    
    // 暴露到全局，供其他脚本使用
    window.ThemeLoader = {
        applyTheme: applyThemeColors,
        getSavedTheme: function() {
            return localStorage.getItem('selectedTheme') || 'material-rose';
        }
    };
})();
