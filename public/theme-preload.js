/**
 * 主题预加载脚本（防 FOUC）
 *
 * 在 Vue 应用挂载前同步执行：读取 localStorage 中的主题选择，
 * 通过同步 XHR 加载 config/themes.json 并提前应用 CSS 变量，
 * 最后移除 data-theme-loading 属性使页面可见。
 *
 * 主题 ID 规则：每个主题族都有 `<family>-light` / `<family>-dark` 两个变体。
 * 老版本存的是不带后缀的 ID（如 material-rose），themes.json 里的 legacyIds
 * 记录了它们原本属于哪一半，这里按表迁移，保证升级后配色不跳变。
 *
 * 注意：扩展环境 CSP（script-src 'self'）禁止内联脚本，
 * 因此本脚本必须以外部文件形式放在 public/ 下，由 index.html 以 <script src> 引入。
 */
(function () {
    try {
        // 存储层的镜像值是 JSON.stringify 过的，直接当字符串比较永远匹配不上，
        // 这里先按 JSON 解析，失败再退回原始字符串（兼容手写/旧版遗留值）。
        var raw = localStorage.getItem('selectedTheme');
        var selectedTheme = raw;
        if (raw) {
            try {
                var parsed = JSON.parse(raw);
                if (typeof parsed === 'string') {
                    selectedTheme = parsed;
                }
            } catch (e) {
                selectedTheme = raw;
            }
        }

        var request = new XMLHttpRequest();
        request.open('GET', 'config/themes.json', false);
        request.send(null);
        var config = JSON.parse(request.responseText || '{}');
        var themes = config.themes || [];
        var legacyIds = config.legacyIds || {};
        var prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        var wantedMode = prefersDark ? 'dark' : 'light';

        function byId(id) {
            for (var i = 0; i < themes.length; i += 1) {
                if (themes[i].id === id) return themes[i];
            }
            return null;
        }

        function familyOf(theme) {
            return theme ? (theme.family || theme.id) : null;
        }

        function variantOf(familyId, mode) {
            for (var i = 0; i < themes.length; i += 1) {
                if (familyOf(themes[i]) === familyId && themes[i].mode === mode) {
                    return themes[i];
                }
            }
            return null;
        }

        var theme = null;

        if (selectedTheme) {
            theme = byId(selectedTheme);
            if (!theme && legacyIds[selectedTheme]) {
                theme = byId(legacyIds[selectedTheme]);
            }
            if (!theme) {
                // 存的是族名（极旧版本）或该变体已被移除：按系统模式取同族变体
                theme = variantOf(selectedTheme, wantedMode);
            }
        }

        if (!theme) {
            var defaultTheme = byId(config.defaultTheme);
            theme = variantOf(familyOf(defaultTheme), wantedMode)
                || defaultTheme
                || themes[0];
        }

        if (theme && theme.colors) {
            var root = document.documentElement;
            root.setAttribute('data-theme', theme.id);
            var isDark = theme.mode ? theme.mode === 'dark' : !!theme.isDark;
            if (isDark) {
                root.classList.add('dark-mode');
            }
            for (var key in theme.colors) {
                if (Object.prototype.hasOwnProperty.call(theme.colors, key)) {
                    root.style.setProperty(key, theme.colors[key]);
                }
            }
            var metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor && theme.colors['--md-sys-color-primary']) {
                metaThemeColor.setAttribute('content', theme.colors['--md-sys-color-primary']);
            }
        }
    } catch (e) {
        // 主题预加载失败时保持默认，避免阻塞页面渲染
    } finally {
        document.documentElement.removeAttribute('data-theme-loading');
        document.documentElement.setAttribute('data-theme-loaded', 'true');
    }
})();
