class ThemeManager {
        constructor(options = {}) {
            this.currentTheme = localStorage.getItem('selectedTheme') || 'material-rose';
            // options.skipApply: 如果主题已由 theme-loader.js 应用，跳过重复应用
            this.skipApply = options.skipApply || false;
            this.init();
        }

        init() {
            try {
                this.renderThemeSelector();
                // 只有当主题尚未被应用时才应用（避免 FOUC 后重复应用）
                if (!this.skipApply) {
                    this.applyTheme(this.currentTheme);
                } else {
                    // 仅更新派生变量和显示
                    this.applyDerivedVariables(this.currentTheme);
                }
                this.bindEvents();
            } catch (error) {
                console.error('主题管理器初始化失败:', error);
            }
        }
        
        // 仅应用派生变量（当主题颜色已由 theme-loader.js 应用时使用）
        applyDerivedVariables(themeId) {
            try {
                const theme = themeConfig.themes.find(t => t.id === themeId);
                if (!theme) return;
                
                const root = document.documentElement;
                const primary = theme.colors['--md-sys-color-primary'];
                const surface = theme.colors['--md-sys-color-surface'];
                
                root.style.setProperty('--md-primary', primary);
                root.style.setProperty('--md-primary-dark', this.adjustColor(primary, -15));
                root.style.setProperty('--md-primary-light', this.adjustColor(primary, 15));
                root.style.setProperty('--md-primary-container', theme.colors['--md-sys-color-primary-container']);
                root.style.setProperty('--md-secondary', theme.colors['--md-sys-color-secondary']);
                root.style.setProperty('--md-secondary-container', theme.colors['--md-sys-color-secondary-container']);
                root.style.setProperty('--md-background', surface);
                root.style.setProperty('--md-surface', this.hexToRgba(surface, 0.85));
                root.style.setProperty('--md-surface-variant', theme.colors['--md-sys-color-surface-variant']);
                root.style.setProperty('--md-surface-2', this.hexToRgba(surface, 0.7));
                root.style.setProperty('--md-on-primary', theme.colors['--md-sys-color-on-primary']);
                root.style.setProperty('--md-on-background', theme.colors['--md-sys-color-on-surface']);
                root.style.setProperty('--md-on-surface', theme.colors['--md-sys-color-on-surface-variant']);
                root.style.setProperty('--md-outline', theme.colors['--md-sys-color-surface-variant']);
                root.style.setProperty('--md-shadow', this.hexToRgba(primary, 0.15));
                
                // 更新显示
                const themeNameEl = document.getElementById('currentThemeName');
                if (themeNameEl) themeNameEl.textContent = theme.name;
                
                this.currentTheme = themeId;
                localStorage.setItem('selectedTheme', themeId);
            } catch (error) {
                console.error('应用派生变量失败:', error);
            }
        }

        renderThemeSelector() {
            const selector = document.getElementById('themeSelect');
            if (!selector) return;

            selector.innerHTML = '';
            themeConfig.themes.forEach(theme => {
                const option = document.createElement('option');
                option.value = theme.id;
                option.textContent = theme.name;
                if (theme.id === this.currentTheme) option.selected = true;
                selector.appendChild(option);
            });
        }

        applyTheme(themeId) {
            try {
                const theme = themeConfig.themes.find(t => t.id === themeId);
                if (!theme) {
                    console.error('找不到主题:', themeId);
                    return;
                }

                const root = document.documentElement;

                // 应用基础颜色变量
                Object.entries(theme.colors).forEach(([key, value]) => {
                    root.style.setProperty(key, value);
                });

                // 计算并设置衍生变量（用于组件样式）
                const primary = theme.colors['--md-sys-color-primary'];
                const surface = theme.colors['--md-sys-color-surface'];

                root.style.setProperty('--md-primary', primary);
                root.style.setProperty('--md-primary-dark', this.adjustColor(primary, -15));
                root.style.setProperty('--md-primary-light', this.adjustColor(primary, 15));
                root.style.setProperty('--md-primary-container', theme.colors['--md-sys-color-primary-container']);
                root.style.setProperty('--md-secondary', theme.colors['--md-sys-color-secondary']);
                root.style.setProperty('--md-secondary-container', theme.colors['--md-sys-color-secondary-container']);
                root.style.setProperty('--md-background', surface);
                root.style.setProperty('--md-surface', this.hexToRgba(surface, 0.85));
                root.style.setProperty('--md-surface-variant', theme.colors['--md-sys-color-surface-variant']);
                root.style.setProperty('--md-surface-2', this.hexToRgba(surface, 0.7));
                root.style.setProperty('--md-on-primary', theme.colors['--md-sys-color-on-primary']);
                root.style.setProperty('--md-on-background', theme.colors['--md-sys-color-on-surface']);
                root.style.setProperty('--md-on-surface', theme.colors['--md-sys-color-on-surface-variant']);
                root.style.setProperty('--md-outline', theme.colors['--md-sys-color-surface-variant']);
                root.style.setProperty('--md-shadow', this.hexToRgba(primary, 0.15));

                // 更新显示
                const themeNameEl = document.getElementById('currentThemeName');
                if (themeNameEl) themeNameEl.textContent = theme.name;

                this.currentTheme = themeId;
                localStorage.setItem('selectedTheme', themeId);
            } catch (error) {
                console.error('应用主题失败:', error);
            }
        }

        bindEvents() {
            const selector = document.getElementById('themeSelect');
            if (selector) {
                selector.addEventListener('change', (e) => this.applyTheme(e.target.value));
            }
        }

        getCurrentTheme() {
            const themeId = localStorage.getItem('selectedTheme') || 'material-rose';
            return themeConfig.themes.find(t => t.id === themeId);
        }

        /**
         * 调整颜色亮度（正数为变亮，负数为变暗）
         */
        adjustColor(color, percent) {
            const num = parseInt(color.replace("#", ""), 16);
            const amt = Math.round(2.55 * Math.abs(percent));
            const R = percent > 0
                ? Math.min(255, (num >> 16) + amt)
                : Math.max(0, (num >> 16) - amt);
            const G = percent > 0
                ? Math.min(255, (num >> 8 & 0x00FF) + amt)
                : Math.max(0, (num >> 8 & 0x00FF) - amt);
            const B = percent > 0
                ? Math.min(255, (num & 0x0000FF) + amt)
                : Math.max(0, (num & 0x0000FF) - amt);
            return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
        }

        /**
         * HEX 转 RGBA
         */
        hexToRgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    }