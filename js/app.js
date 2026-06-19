    // ==================== 工具函数 ====================
    const Utils = {
        // 防抖函数
        debounce(fn, delay) {
            let timer = null;
            return function(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        },

        // 节流函数
        throttle(fn, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    fn.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        // DOM 缓存
        domCache: new Map(),
        get(id) {
            if (!this.domCache.has(id)) {
                const el = document.getElementById(id);
                if (el) this.domCache.set(id, el);
                return el;
            }
            return this.domCache.get(id);
        },

        // 清理缓存
        clearCache() {
            this.domCache.clear();
        },

        // 生成唯一ID
        generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        },

        // 转义HTML（防XSS）
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        // 格式化时间
        formatTime(timestamp) {
            const now = Date.now();
            const diff = now - timestamp;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (minutes < 1) return '刚刚';
            if (minutes < 60) return `${minutes}分钟前`;
            if (hours < 24) return `${hours}小时前`;
            if (days < 30) return `${days}天前`;
            return new Date(timestamp).toLocaleDateString();
        },

        // 图片加载错误处理
        createImageWithFallback(src, alt, fallback = '🌐') {
            return `<img src="${src}"
                    alt="${this.escapeHtml(alt)}"
                    loading="lazy"
                    decoding="async"
                    onerror="this.onerror=null; this.style.display='none'; this.parentElement.textContent='${fallback}';"
                >`;
        },

        // 创建支持黑白模式的图片
        createMonochromeImage(src, alt, style, fallback = '🌐') {
            const styleAttr = style ? `style="${style}"` : '';
            return `<img src="${src}"
                    alt="${this.escapeHtml(alt)}"
                    loading="lazy"
                    decoding="async"
                    ${styleAttr}
                    onerror="this.onerror=null; this.style.display='none'; this.parentElement.textContent='${fallback}';"
                >`;
        }
    };

    // ==================== 存储管理器（适配 Chrome Storage）====================
    const StorageManager = {
        isExtension: typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local,

        async get(key) {
            if (this.isExtension) {
                const result = await chrome.storage.local.get(key);
                return result[key];
            } else {
                const item = localStorage.getItem(key);
                try {
                    return item ? JSON.parse(item) : null;
                } catch (e) {
                    return item;
                }
            }
        },

        async set(key, value) {
            if (this.isExtension) {
                await chrome.storage.local.set({ [key]: value });
            } else {
                localStorage.setItem(key, JSON.stringify(value));
            }
        },

        async remove(key) {
            if (this.isExtension) {
                await chrome.storage.local.remove(key);
            } else {
                localStorage.removeItem(key);
            }
        }
    };

    // ==================== 数据管理（带内存缓存）====================
    const DataManager = {
        _cache: null,
        _userUiLibCache: null,  // 只保存用户自定义 UI
        _dirty: false,
        _syncTimer: null,

        // 从配置文件获取默认数据（config/defaultData.json）
        get defaultData() {
            return DefaultData?.appNavigator || { categories: [], apps: [] };
        },

        // 系统 UI 库（从配置读取，不保存到 storage）
        get systemUiLib() {
            return DefaultData?.systemUiLib || { categories: [], items: [] };
        },

        // 用户 UI 默认空结构
        get defaultUserUiLib() {
            return { categories: [], items: [] };
        },

        async init() {
            // 一次性加载到内存
            const savedData = await StorageManager.get('appNavigator_data');
            // 检查是否有有效数据（非空数组）
            const hasValidData = savedData && 
                Array.isArray(savedData.categories) && savedData.categories.length > 0 &&
                Array.isArray(savedData.apps);
            
            if (hasValidData) {
                this._cache = savedData;
            } else {
                // 使用默认数据初始化
                this._cache = JSON.parse(JSON.stringify(this.defaultData));
                // 立即同步到存储
                await this.sync();
            }
            
            // 只加载用户 UI，系统 UI 从配置实时读取
            const savedUserUiLib = await StorageManager.get('appNavigator_user_uiLib');
            if (savedUserUiLib && Array.isArray(savedUserUiLib.categories)) {
                this._userUiLibCache = savedUserUiLib;
            } else {
                this._userUiLibCache = JSON.parse(JSON.stringify(this.defaultUserUiLib));
                this._dirty = true;
                await this.sync();
            }

            // 页面卸载时同步
            window.addEventListener('beforeunload', () => this.sync());

            // 定期同步（每30秒）
            setInterval(() => this.sync(), 30000);
        },

        async getData() {
            // 返回深拷贝防止直接修改
            return JSON.parse(JSON.stringify(this._cache));
        },

        // 获取完整的 UI 库（系统 + 用户）
        async getUiLib() {
            const system = this.systemUiLib;
            const user = this._userUiLibCache;
            
            // 合并系统 UI 和用户 UI
            const merged = {
                categories: [
                    ...system.categories,
                    ...user.categories
                ],
                items: [
                    ...system.items.map(item => ({ ...item, isSystem: true })),
                    ...user.items.map(item => ({ ...item, isSystem: false }))
                ]
            };
            
            return JSON.parse(JSON.stringify(merged));
        },

        // 只获取用户 UI（用于导出）
        async getUserUiLib() {
            return JSON.parse(JSON.stringify(this._userUiLibCache));
        },

        async saveData(data) {
            this._cache = data;
            this._dirty = true;
            // 防抖同步
            if (this._syncTimer) clearTimeout(this._syncTimer);
            this._syncTimer = setTimeout(() => this.sync(), 1000);
        },

        async saveUserUiLib(data) {
            this._userUiLibCache = data;
            this._dirty = true;
            if (this._syncTimer) clearTimeout(this._syncTimer);
            this._syncTimer = setTimeout(() => this.sync(), 1000);
        },

        async sync() {
            if (!this._dirty) return;
            try {
                await StorageManager.set('appNavigator_data', this._cache);
                await StorageManager.set('appNavigator_user_uiLib', this._userUiLibCache);
                this._dirty = false;
                console.log('DataManager: 数据已同步到存储');
            } catch (e) {
                console.error('Sync failed:', e);
            }
        },

        // 强制立即同步（用于关键操作后）
        async syncNow() {
            if (this._syncTimer) clearTimeout(this._syncTimer);
            await this.sync();
        },

        async addApp(app) {
            app.id = Utils.generateId();
            this._cache.apps.push(app);
            await this.saveData(this._cache);
            return app;
        },

        async updateApp(id, updates) {
            const index = this._cache.apps.findIndex(a => a.id === id);
            if (index !== -1) {
                this._cache.apps[index] = { ...this._cache.apps[index], ...updates };
                await this.saveData(this._cache);
                return this._cache.apps[index];
            }
            return null;
        },

        async deleteApp(id) {
            this._cache.apps = this._cache.apps.filter(a => a.id !== id);
            await this.saveData(this._cache);
        },

        async updateAppsOrder(orderedIds) {
            // 根据传入的 ID 顺序重新排序应用
            const appsMap = new Map(this._cache.apps.map(a => [a.id, a]));
            const newApps = [];
            for (const id of orderedIds) {
                const app = appsMap.get(id);
                if (app) {
                    newApps.push(app);
                    appsMap.delete(id);
                }
            }
            // 将剩余的应用（不在排序列表中的）添加到末尾
            appsMap.forEach(app => newApps.push(app));
            this._cache.apps = newApps;
            await this.saveData(this._cache);
        },

        async addCategory(category) {
            category.id = Utils.generateId();
            this._cache.categories.push(category);
            await this.saveData(this._cache);
            return category;
        },

        async updateCategoriesOrder(orderedIds) {
            // 确保 'all' 始终排在第一位
            const allCategory = this._cache.categories.find(c => c.id === 'all');
            const otherCategories = orderedIds
                .map(id => this._cache.categories.find(c => c.id === id))
                .filter(c => c && c.id !== 'all');
            
            // 重新构建分类数组：all 在前，其他按新顺序
            this._cache.categories = allCategory ? [allCategory, ...otherCategories] : otherCategories;
            await this.saveData(this._cache);
        },

        async updateCategory(id, updates) {
            const index = this._cache.categories.findIndex(c => c.id === id);
            if (index !== -1) {
                this._cache.categories[index] = { ...this._cache.categories[index], ...updates };
                await this.saveData(this._cache);
                return this._cache.categories[index];
            }
            return null;
        },

        async deleteCategory(id) {
            this._cache.categories = this._cache.categories.filter(c => c.id !== id);
            this._cache.apps = this._cache.apps.filter(a => a.category !== id);
            await this.saveData(this._cache);
        },

        // UI 分类管理（只能操作用户分类）
        async addUiCategory(name) {
            const category = { id: Utils.generateId(), name };
            this._userUiLibCache.categories.push(category);
            await this.saveUserUiLib(this._userUiLibCache);
            return category;
        },

        async deleteUiCategory(id) {
            // 检查是否是系统分类
            const systemCategory = this.systemUiLib.categories.find(c => c.id === id);
            if (systemCategory) {
                console.warn('不能删除系统分类');
                return;
            }
            this._userUiLibCache.categories = this._userUiLibCache.categories.filter(c => c.id !== id);
            this._userUiLibCache.items = this._userUiLibCache.items.filter(i => i.category !== id);
            await this.saveUserUiLib(this._userUiLibCache);
        },

        // UI 图标管理（只能操作用户图标）
        async addUiItem(item) {
            item.id = Utils.generateId();
            this._userUiLibCache.items.push(item);
            await this.saveUserUiLib(this._userUiLibCache);
            return item;
        },

        async deleteUiItem(id) {
            // 检查是否是系统图标
            const systemItem = this.systemUiLib.items.find(i => i.id === id);
            if (systemItem) {
                console.warn('不能删除系统图标');
                return;
            }
            this._userUiLibCache.items = this._userUiLibCache.items.filter(i => i.id !== id);
            await this.saveUserUiLib(this._userUiLibCache);
        },

        // 导出数据（只导出用户数据）
        async export() {
            await this.sync(); // 确保数据已保存
            return {
                data: this._cache,
                userUiLib: this._userUiLibCache,  // 只导出用户 UI
                exportTime: new Date().toISOString(),
                version: '1.0'
            };
        },

        // 导入数据（只导入用户 UI）
        async import(jsonData) {
            // 导入应用数据
            if (jsonData.data && jsonData.data.categories && jsonData.data.apps) {
                this._cache = jsonData.data;
                await StorageManager.set('appNavigator_data', this._cache);
            } 
            // 支持简化格式
            else if (jsonData.categories && jsonData.apps) {
                this._cache = jsonData;
                await StorageManager.set('appNavigator_data', this._cache);
            }
            
            // 只导入用户 UI（不导入系统 UI）
            if (jsonData.userUiLib) {
                this._userUiLibCache = jsonData.userUiLib;
                await StorageManager.set('appNavigator_user_uiLib', this._userUiLibCache);
            } else if (jsonData.uiLib) {
                // 兼容旧格式：如果导入的是 uiLib，只导入其中的用户分类和图标
                // 过滤掉与系统 UI id 冲突的项目
                const systemIds = this.systemUiLib.items.map(i => i.id);
                const userItems = jsonData.uiLib.items.filter(i => !systemIds.includes(i.id));
                const systemCatIds = this.systemUiLib.categories.map(c => c.id);
                const userCategories = jsonData.uiLib.categories.filter(c => !systemCatIds.includes(c.id));
                
                this._userUiLibCache = {
                    categories: userCategories,
                    items: userItems
                };
                await StorageManager.set('appNavigator_user_uiLib', this._userUiLibCache);
            }
            
            this._dirty = false;
        }
    };

    // ==================== 应用导航器 ====================
    class AppNavigator {
        constructor() {
            this.currentCategory = 'all';
            this.sidebarCollapsed = false;
            this.showHiddenApps = false;
            this.editingAppId = null;
            this.editingCategoryId = null;
            this.iconSelectCallback = null;
            this.eventListeners = [];
            this.resizeObserver = null;
        }

        async init() {
            await DataManager.init();

            // 加载侧边栏状态
            const savedState = await StorageManager.get('sidebarCollapsed');
            this.sidebarCollapsed = savedState === true;

            // 加载隐藏站点显示状态
            const savedShowHidden = await StorageManager.get('appNavigator_showHiddenApps');
            this.showHiddenApps = savedShowHidden === true;

            // 先检测深色模式，确保渲染时能获取正确状态
            detectDarkMode();

            this.bindEvents();
            await this.renderNavigation();
            await this.renderApps();
            this.initSidebarState();

            // 使用 requestAnimationFrame 优化首次渲染
            requestAnimationFrame(() => {
                this.updateHeaderLogo();
            });
        }

        initSidebarState() {
            const body = document.body;
            const sidebar = Utils.get('sidebar');

            if (this.sidebarCollapsed) {
                body.classList.add('sidebar-collapsed');
                if (sidebar) sidebar.classList.add('collapsed');
            } else {
                body.classList.remove('sidebar-collapsed');
                if (sidebar) sidebar.classList.remove('collapsed');
            }
        }

        async toggleSidebarCollapse() {
            const body = document.body;
            const sidebar = Utils.get('sidebar');
            this.sidebarCollapsed = !this.sidebarCollapsed;

            if (this.sidebarCollapsed) {
                body.classList.add('sidebar-collapsed');
                if (sidebar) sidebar.classList.add('collapsed');
            } else {
                body.classList.remove('sidebar-collapsed');
                if (sidebar) sidebar.classList.remove('collapsed');
            }

            await StorageManager.set('sidebarCollapsed', this.sidebarCollapsed);
        }

        updateHeaderLogo() {
            const logoContainer = Utils.get('headerLogo');
            if (!logoContainer || typeof themeConfig === 'undefined') return;

            const currentThemeId = localStorage.getItem('selectedTheme') || themeConfig.defaultTheme || 'material-rose';
            const currentTheme = themeConfig.themes.find(t => t.id === currentThemeId);

            if (currentTheme && currentTheme.logo) {
                let logo = currentTheme.logo;
                const isPureBase64 = /^[A-Za-z0-9+/=]+$/.test(logo) && logo.length > 20;
                const isDataUri = logo.startsWith('data:');
                const isUrl = logo.startsWith('http') || logo.startsWith('//') || logo.includes('.');

                let isImage = false;
                if (isPureBase64) {
                    logo = 'data:image/png;base64,' + logo;
                    isImage = true;
                } else if (isDataUri || isUrl) {
                    isImage = true;
                }

                if (isImage) {
                    logoContainer.classList.add('is-image');
                    logoContainer.innerHTML = Utils.createImageWithFallback(logo, 'Logo', '🧭');
                } else {
                    logoContainer.classList.remove('is-image');
                    logoContainer.textContent = logo;
                }
            } else {
                logoContainer.classList.remove('is-image');
                logoContainer.textContent = '🧭';
            }
        }

        async renderNavigation() {
            const navMenu = Utils.get('navMenu');
            if (!navMenu) return;

            const data = await DataManager.getData();
            const isDarkMode = document.body.classList.contains('dark-mode');

            // 使用 DocumentFragment 优化 DOM 操作
            const fragment = document.createDocumentFragment();

            data.categories.forEach(category => {
                const navItem = document.createElement('a');
                navItem.href = '#';
                navItem.className = 'nav-item';
                navItem.dataset.category = category.id;
                navItem.dataset.title = category.name;
                navItem.setAttribute('role', 'menuitem');
                if (category.id === this.currentCategory) navItem.classList.add('active');

                // 根据主题选择图标
                const catIcon = isDarkMode && category.iconDark ? category.iconDark : category.icon;
                const isImage = this.isImageIcon(catIcon);
                
                // 根据 monochrome 属性决定图标颜色
                // 浅色模式：显示原色
                // 深色模式：显示白色
                let iconHtml;
                if (isImage) {
                    // 图片图标：使用 filter 滤镜
                    let iconStyle = '';
                    if (category.monochrome && isDarkMode) {
                        // 深色模式下 monochrome 图标显示白色
                        iconStyle = 'filter: invert(1) brightness(2);';
                    }
                    iconHtml = Utils.createMonochromeImage(catIcon, category.name, iconStyle);
                } else {
                    // Emoji/Unicode 图标：使用 CSS color
                    let iconColor = '';
                    if (category.monochrome && isDarkMode) {
                        // 深色模式下 monochrome 图标显示白色
                        iconColor = 'color: white;';
                    }
                    iconHtml = `<span style="font-size: 20px; ${iconColor}">${Utils.escapeHtml(catIcon)}</span>`;
                }

                navItem.innerHTML = `
                        <span class="nav-icon" ${category.monochrome ? 'data-monochrome="true"' : ''}>${iconHtml}</span>
                        <span class="nav-text">${Utils.escapeHtml(category.name)}</span>
                    `;

                // 添加键盘支持
                navItem.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.switchCategory(category.id);
                        this.updateActiveNav(navItem);
                    }
                });

                fragment.appendChild(navItem);
            });

            navMenu.innerHTML = '';
            navMenu.appendChild(fragment);
        }

        async renderApps() {
            const contentArea = Utils.get('contentArea');
            if (!contentArea) return;

            const data = await DataManager.getData();
            const isDarkMode = document.body.classList.contains('dark-mode');
            let html = '';

            if (this.currentCategory === 'all') {
                const categoriesWithApps = data.categories
                    .filter(cat => cat.id !== 'all')
                    .map((category, index) => {
                        const appsInCategory = data.apps
                            .filter(app => app.category === category.id)
                            .filter(app => this.showHiddenApps || !app.hidden);
                        return { category, appsInCategory, index };
                    })
                    .filter(item => item.appsInCategory.length > 0);

                if (categoriesWithApps.length === 0) {
                    html = `<div class="empty-state">
                            <div style="font-size:48px; margin-bottom:16px;">📭</div>
                            <p>暂无应用，点击右下角 + 按钮添加</p>
                        </div>`;
                } else {
                    html = categoriesWithApps.map(({ category, appsInCategory, index }) => `
                            <div style="animation-delay: ${index * 0.08}s" class="category">
                                ${this.createCategoryHTML(category, appsInCategory, isDarkMode)}
                            </div>
                        `).join('');
                }
            } else {
                const category = data.categories.find(cat => cat.id === this.currentCategory);
                const appsInCategory = data.apps
                    .filter(app => app.category === this.currentCategory)
                    .filter(app => this.showHiddenApps || !app.hidden);

                if (category && appsInCategory.length > 0) {
                    html = `<div class="category">
                            <div class="content-header">
                                <h2 class="content-title">${Utils.escapeHtml(category.name)}</h2>
                            </div>
                            <div class="apps-grid" data-category="${this.currentCategory}">
                                ${appsInCategory.map(app => this.createAppCardHTML(app)).join('')}
                            </div>
                        </div>`;
                } else {
                    html = `<div class="empty-state">
                            <div style="font-size:48px; margin-bottom:16px;">📭</div>
                            <p>该分类下暂无应用</p>
                            <button class="btn-primary" data-action="open-add-app" data-category="${this.currentCategory}" style="margin-top:12px;" type="button">+ 添加应用</button>
                        </div>`;
                }
            }

            contentArea.innerHTML = html;
        }

        createCategoryHTML(category, apps, isDarkMode) {
            const catIcon = isDarkMode && category.iconDark ? category.iconDark : category.icon;
            const isImage = this.isImageIcon(catIcon);
            
            // 根据 monochrome 属性决定图标颜色
            // 浅色模式：显示原色
            // 深色模式：显示白色
            let iconStyle = '';
            if (category.monochrome && isImage && isDarkMode) {
                // 深色模式下 monochrome 图标显示白色
                iconStyle = 'filter: invert(1) brightness(2);';
            }
            const iconHtml = isImage ? 
                Utils.createMonochromeImage(catIcon, category.name, iconStyle) : 
                Utils.escapeHtml(catIcon);

            return `
                    <h3 class="category-title">${iconHtml} ${Utils.escapeHtml(category.name)}</h3>
                    <div class="apps-grid" data-category="${category.id}">
                        ${apps.map(app => this.createAppCardHTML(app)).join('')}
                    </div>
                `;
        }

        createAppCardHTML(app) {
            const isImage = this.isImageIcon(app.icon);
            const iconHtml = isImage ?
                Utils.createImageWithFallback(app.icon, app.name, '🌐') :
                Utils.escapeHtml(app.icon || '🌐');
            const hiddenClass = app.hidden ? ' app-card-hidden' : '';

            return `
                    <div class="app-card${hiddenClass}" data-app-id="${app.id}" tabindex="0" role="link" aria-label="${Utils.escapeHtml(app.name)}">
                        <div class="app-icon">${iconHtml}</div>
                        <div class="app-content">
                            <h3 class="app-name">${Utils.escapeHtml(app.name)}</h3>
                            <p class="app-description">${Utils.escapeHtml(app.description || '')}</p>
                        </div>
                        <div class="app-actions">
                            <button class="app-action-btn" data-action="edit-app" data-app-id="${app.id}" title="编辑" aria-label="编辑 ${Utils.escapeHtml(app.name)}"><img src="./image/icons/edit.svg" width="16" height="16" style="filter: var(--icon-filter, none);"></button>
                            <button class="app-action-btn delete" data-action="delete-app" data-app-id="${app.id}" title="删除" aria-label="删除 ${Utils.escapeHtml(app.name)}"><img src="./image/icons/delete.svg" width="16" height="16" style="filter: var(--icon-filter, none);"></button>
                        </div>
                    </div>
                `;
        }

        isImageIcon(icon) {
            if (!icon) return false;
            return icon.includes('.') || icon.startsWith('http') || icon.startsWith('data:') || icon.startsWith('//');
        }

        bindEvents() {
            console.log('AppNavigator: 绑定事件...');

            // 双击 Logo 切换隐藏站点显示状态
            const headerLogo = Utils.get('headerLogo');
            if (headerLogo) {
                const dblclickHandler = async () => {
                    this.showHiddenApps = !this.showHiddenApps;
                    await StorageManager.set('appNavigator_showHiddenApps', this.showHiddenApps);
                    await this.renderApps();
                    showToast(this.showHiddenApps ? '已显示隐藏的站点' : '已隐藏隐藏的站点');
                };
                headerLogo.addEventListener('dblclick', dblclickHandler);
                this.eventListeners.push({ element: headerLogo, event: 'dblclick', handler: dblclickHandler });
            }

            const navMenu = Utils.get('navMenu');
            if (navMenu) {
                const clickHandler = (e) => {
                    const navItem = e.target.closest('.nav-item');
                    if (navItem) {
                        e.preventDefault();
                        const category = navItem.dataset.category;
                        this.switchCategory(category);
                        this.updateActiveNav(navItem);

                        if (window.innerWidth <= 768) {
                            toggleSidebar();
                        }
                    }
                };
                navMenu.addEventListener('click', clickHandler);
                this.eventListeners.push({ element: navMenu, event: 'click', handler: clickHandler });
            }

            // 主题变更监听
            const themeHandler = () => {
                // 先检测并更新深色模式类，确保后续渲染能获取正确的状态
                detectDarkMode();
                this.updateHeaderLogo();
                // 重新渲染应用列表以切换深浅色图标
                this.renderApps();
                // 重新渲染导航栏以切换分类深浅色图标
                this.renderNavigation();
            };
            document.addEventListener('themeChanged', themeHandler);
            this.eventListeners.push({ element: document, event: 'themeChanged', handler: themeHandler });

            // 内容区域点击
            const contentArea = Utils.get('contentArea');
            if (contentArea) {
                const clickHandler = async (e) => {
                    const card = e.target.closest('.app-card');
                    if (card && !e.target.closest('.app-actions')) {
                        const appId = card.dataset.appId;
                        const data = await DataManager.getData();
                        const app = data.apps.find(a => a.id === appId);
                        if (app) {
                            window.open(app.url, '_blank');
                        }
                    }
                };

                // 键盘支持
                const keyHandler = async (e) => {
                    if (e.key === 'Enter') {
                        const card = e.target.closest('.app-card');
                        if (card) {
                            const appId = card.dataset.appId;
                            const data = await DataManager.getData();
                            const app = data.apps.find(a => a.id === appId);
                            if (app) window.open(app.url, '_blank');
                        }
                    }
                };

                contentArea.addEventListener('click', clickHandler);
                contentArea.addEventListener('keydown', keyHandler);
                this.eventListeners.push(
                    { element: contentArea, event: 'click', handler: clickHandler },
                    { element: contentArea, event: 'keydown', handler: keyHandler }
                );
            }

            // FAB 外部点击关闭
            const docClickHandler = (e) => {
                const fab = Utils.get('fabMain');
                const menu = Utils.get('fabMenu');
                if (fab && menu && !fab.contains(e.target) && !menu.contains(e.target)) {
                    menu.classList.remove('show');
                    fab.classList.remove('active');
                    fab.setAttribute('aria-expanded', 'false');
                }
            };
            document.addEventListener('click', docClickHandler);
            this.eventListeners.push({ element: document, event: 'click', handler: docClickHandler });

            // 窗口大小变化监听（节流）
            const resizeHandler = Utils.throttle(() => {
                Utils.clearCache();
                closeEngineDropdown();
            }, 250);
            window.addEventListener('resize', resizeHandler);
            this.eventListeners.push({ element: window, event: 'resize', handler: resizeHandler });

            // 初始化拖拽排序
            this.initDragAndDrop();
            this.initCategoryDragAndDrop();
        }

        initCategoryDragAndDrop() {
            const navMenu = Utils.get('navMenu');
            if (!navMenu) return;

            let longPressTimer = null;
            let isDragging = false;
            let isLongPress = false;
            let startX = 0;
            let startY = 0;
            let currentNavItem = null;
            let draggedCategoryId = null;
            const LONG_PRESS_DURATION = 500;
            const MOVE_THRESHOLD = 10;

            // 开始长按检测
            const startLongPress = (e, navItem) => {
                // 跳过 "全部应用"
                if (navItem.dataset.category === 'all') return;

                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

                startX = clientX;
                startY = clientY;
                currentNavItem = navItem;
                isLongPress = false;
                isDragging = false;

                navItem.classList.add('pressing');

                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    navItem.classList.add('pressing-active');
                    navItem.setAttribute('draggable', 'true');
                    
                    const dragStartEvent = new DragEvent('dragstart', {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: new DataTransfer()
                    });
                    navItem.dispatchEvent(dragStartEvent);
                }, LONG_PRESS_DURATION);
            };

            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                if (currentNavItem) {
                    currentNavItem.classList.remove('pressing', 'pressing-active');
                    if (!isDragging) {
                        currentNavItem.setAttribute('draggable', 'false');
                    }
                }
            };

            const pointerDownHandler = (e) => {
                const navItem = e.target.closest('.nav-item');
                if (!navItem) return;
                startLongPress(e, navItem);
            };

            const pointerMoveHandler = (e) => {
                if (!currentNavItem || isDragging) return;

                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

                const moveDistance = Math.sqrt(
                    Math.pow(clientX - startX, 2) + Math.pow(clientY - startY, 2)
                );

                if (moveDistance > MOVE_THRESHOLD) {
                    cancelLongPress();
                }
            };

            const pointerUpHandler = () => {
                cancelLongPress();
            };

            const dragStartHandler = (e) => {
                const navItem = e.target.closest('.nav-item');
                if (!navItem || !isLongPress || navItem.dataset.category === 'all') {
                    e.preventDefault();
                    return;
                }

                isDragging = true;
                navItem.classList.add('dragging');
                navItem.classList.remove('pressing', 'pressing-active');
                draggedCategoryId = navItem.dataset.category;

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedCategoryId);
            };

            const dragOverHandler = (e) => {
                e.preventDefault();
                if (!isDragging) return;

                const targetItem = e.target.closest('.nav-item');
                const draggedItem = document.querySelector('.nav-item.dragging');
                if (!targetItem || !draggedItem || targetItem === draggedItem) return;
                if (targetItem.dataset.category === 'all') return; // 不能拖到 "全部" 前面

                // 计算插入位置
                const rect = targetItem.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                
                if (e.clientY < midY) {
                    navMenu.insertBefore(draggedItem, targetItem);
                } else {
                    navMenu.insertBefore(draggedItem, targetItem.nextSibling);
                }
            };

            const dropHandler = async (e) => {
                e.preventDefault();
                if (!isDragging) return;

                // 获取新的分类顺序（跳过 'all'）
                const navItems = [...navMenu.querySelectorAll('.nav-item')];
                const newOrder = navItems
                    .map(item => item.dataset.category)
                    .filter(id => id !== 'all');

                // 保存新顺序
                await DataManager.updateCategoriesOrder(newOrder);
                showToast('分类排序已保存');

                // 刷新应用列表以更新分类显示顺序
                await this.renderApps();

                // 清理状态
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('dragging', 'pressing', 'pressing-active');
                    item.setAttribute('draggable', 'false');
                });

                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }

                isDragging = false;
                isLongPress = false;
                currentNavItem = null;
                draggedCategoryId = null;
            };

            const dragEndHandler = () => {
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('dragging', 'pressing', 'pressing-active');
                    item.setAttribute('draggable', 'false');
                });

                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }

                isDragging = false;
                isLongPress = false;
                currentNavItem = null;
                draggedCategoryId = null;
            };

            // 绑定事件
            navMenu.addEventListener('mousedown', pointerDownHandler);
            navMenu.addEventListener('mousemove', pointerMoveHandler);
            navMenu.addEventListener('mouseup', pointerUpHandler);
            navMenu.addEventListener('mouseleave', pointerUpHandler);

            navMenu.addEventListener('touchstart', pointerDownHandler, { passive: true });
            navMenu.addEventListener('touchmove', pointerMoveHandler, { passive: true });
            navMenu.addEventListener('touchend', pointerUpHandler);

            navMenu.addEventListener('dragstart', dragStartHandler);
            navMenu.addEventListener('dragover', dragOverHandler);
            navMenu.addEventListener('drop', dropHandler);
            navMenu.addEventListener('dragend', dragEndHandler);
        }

        initDragAndDrop() {
            const contentArea = Utils.get('contentArea');
            if (!contentArea) return;

            let longPressTimer = null;
            let isDragging = false;
            let isLongPress = false;
            let startX = 0;
            let startY = 0;
            let currentCard = null;
            let sourceCategoryId = null;
            let draggedAppId = null;
            const LONG_PRESS_DURATION = 500; // 长按时间阈值 500ms
            const MOVE_THRESHOLD = 10; // 移动阈值 10px

            // 开始长按检测
            const startLongPress = (e, card) => {
                // 忽略操作按钮区域
                if (e.target.closest('.app-actions')) return;

                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

                startX = clientX;
                startY = clientY;
                currentCard = card;
                isLongPress = false;
                isDragging = false;

                // 添加按压样式
                card.classList.add('pressing');

                // 启动长按定时器
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    card.classList.add('pressing-active');
                    card.setAttribute('draggable', 'true');
                    
                    // 触发拖拽开始
                    const dragStartEvent = new DragEvent('dragstart', {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: new DataTransfer()
                    });
                    card.dispatchEvent(dragStartEvent);
                }, LONG_PRESS_DURATION);
            };

            // 取消长按
            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                if (currentCard) {
                    currentCard.classList.remove('pressing', 'pressing-active');
                    if (!isDragging) {
                        currentCard.setAttribute('draggable', 'false');
                    }
                }
            };

            // 鼠标/触摸按下
            const pointerDownHandler = (e) => {
                const card = e.target.closest('.app-card');
                if (!card) return;
                
                startLongPress(e, card);
            };

            // 鼠标/触摸移动
            const pointerMoveHandler = (e) => {
                if (!currentCard || isDragging) return;

                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

                // 如果移动距离超过阈值，取消长按
                const moveDistance = Math.sqrt(
                    Math.pow(clientX - startX, 2) + Math.pow(clientY - startY, 2)
                );

                if (moveDistance > MOVE_THRESHOLD) {
                    cancelLongPress();
                }
            };

            // 鼠标/触摸抬起
            const pointerUpHandler = (e) => {
                cancelLongPress();
            };

            // 拖拽开始
            const dragStartHandler = (e) => {
                const card = e.target.closest('.app-card');
                if (!card || !isLongPress) {
                    e.preventDefault();
                    return;
                }

                isDragging = true;
                card.classList.add('dragging');
                card.classList.remove('pressing', 'pressing-active');
                
                // 保存拖拽的应用ID和源分类
                draggedAppId = card.dataset.appId;
                const sourceGrid = card.closest('.apps-grid');
                sourceCategoryId = sourceGrid ? sourceGrid.dataset.category : null;

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedAppId);
            };

            // 拖拽经过
            const dragOverHandler = (e) => {
                e.preventDefault();
                if (!isDragging) return;

                const grid = e.target.closest('.apps-grid');
                const draggedCard = document.querySelector('.app-card.dragging');
                if (!grid || !draggedCard) return;

                const afterElement = getDragAfterElement(grid, e.clientY, e.clientX);
                if (afterElement == null) {
                    grid.appendChild(draggedCard);
                } else {
                    grid.insertBefore(draggedCard, afterElement);
                }
            };

            // 放置
            const dropHandler = async (e) => {
                e.preventDefault();
                if (!isDragging) return;

                const grid = e.target.closest('.apps-grid');
                const draggedCard = document.querySelector('.app-card.dragging');
                if (!grid || !draggedCard) return;

                const targetCategoryId = grid.dataset.category;
                const appId = draggedCard.dataset.appId;
                
                // 检查是否跨分类拖拽
                if (sourceCategoryId && targetCategoryId && sourceCategoryId !== targetCategoryId) {
                    // 跨分类：更新应用分类
                    await DataManager.updateApp(appId, { category: targetCategoryId });
                    showToast('应用已移动到新分类');
                    
                    // 重新渲染以显示新分类
                    await this.renderApps();
                } else {
                    // 同分类：只更新排序
                    const cards = [...grid.querySelectorAll('.app-card')];
                    const newOrder = cards.map(card => card.dataset.appId);
                    await DataManager.updateAppsOrder(newOrder);
                }

                // 清理所有状态
                document.querySelectorAll('.app-card').forEach(card => {
                    card.classList.remove('dragging', 'pressing', 'pressing-active');
                    card.setAttribute('draggable', 'false');
                });
                
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                
                isDragging = false;
                isLongPress = false;
                currentCard = null;
                sourceCategoryId = null;
                draggedAppId = null;
            };

            // 拖拽结束
            const dragEndHandler = (e) => {
                // 清理所有卡片的拖拽状态
                document.querySelectorAll('.app-card').forEach(card => {
                    card.classList.remove('dragging', 'pressing', 'pressing-active');
                    card.setAttribute('draggable', 'false');
                });
                
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                
                isDragging = false;
                isLongPress = false;
                currentCard = null;
                sourceCategoryId = null;
                draggedAppId = null;
            };

            // 获取拖拽后的插入位置
            function getDragAfterElement(container, y, x) {
                const draggableElements = [...container.querySelectorAll('.app-card:not(.dragging)')];
                
                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offsetX = x - box.left - box.width / 2;
                    const offsetY = y - box.top - box.height / 2;
                    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
                    
                    if (distance < closest.offset) {
                        return { offset: distance, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.POSITIVE_INFINITY }).element;
            }

            // 绑定事件
            contentArea.addEventListener('mousedown', pointerDownHandler);
            contentArea.addEventListener('mousemove', pointerMoveHandler);
            contentArea.addEventListener('mouseup', pointerUpHandler);
            contentArea.addEventListener('mouseleave', pointerUpHandler);

            contentArea.addEventListener('touchstart', pointerDownHandler, { passive: true });
            contentArea.addEventListener('touchmove', pointerMoveHandler, { passive: true });
            contentArea.addEventListener('touchend', pointerUpHandler);

            contentArea.addEventListener('dragstart', dragStartHandler);
            contentArea.addEventListener('dragover', dragOverHandler);
            contentArea.addEventListener('drop', dropHandler);
            contentArea.addEventListener('dragend', dragEndHandler);

            // 阻止拖拽时打开应用，并清理状态
            contentArea.addEventListener('click', (e) => {
                // 清理所有拖拽状态
                document.querySelectorAll('.app-card').forEach(card => {
                    card.classList.remove('dragging', 'pressing', 'pressing-active');
                    card.setAttribute('draggable', 'false');
                });
                
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                
                if (isDragging || isLongPress) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                
                isDragging = false;
                isLongPress = false;
                currentCard = null;
                sourceCategoryId = null;
                draggedAppId = null;
            }, true);
        }

        switchCategory(category) {
            this.currentCategory = category;
            this.renderApps();
        }

        updateActiveNav(activeItem) {
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
                item.setAttribute('aria-current', 'false');
            });
            activeItem.classList.add('active');
            activeItem.setAttribute('aria-current', 'true');
        }

        destroy() {
            this.eventListeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.eventListeners = [];
        }
    }

    // ==================== 全局函数 ====================
    let appNavigator;
    let currentEngineIndex = 0;
    let searchModalOpen = false;
    let engineDropdownOpen = false;

    function toggleSidebar() {
        const sidebar = Utils.get('sidebar');
        const overlay = Utils.get('overlay');
        const menuToggle = document.querySelector('.menu-toggle');

        if (sidebar) {
            const isOpen = sidebar.classList.toggle('open');
            if (menuToggle) {
                menuToggle.setAttribute('aria-expanded', isOpen);
            }
        }
        if (overlay) overlay.classList.toggle('show');
    }

    async function toggleSidebarCollapse() {
        if (window.appNavigator) {
            await window.appNavigator.toggleSidebarCollapse();
        }
    }

    function toggleFabMenu() {
        const fab = Utils.get('fabMain');
        const menu = Utils.get('fabMenu');
        if (fab && menu) {
            const isActive = fab.classList.toggle('active');
            menu.classList.toggle('show');
            fab.setAttribute('aria-expanded', isActive);
        }
    }

    function closeFabMenu() {
        const fab = Utils.get('fabMain');
        const menu = Utils.get('fabMenu');
        if (fab) {
            fab.classList.remove('active');
            fab.setAttribute('aria-expanded', 'false');
        }
        if (menu) menu.classList.remove('show');
    }

    function openModal(modalId) {
        const modal = Utils.get(modalId);
        if (modal) {
            // 支持 show 和 active 两种类名
            if (modal.id === 'iconPreviewModal') {
                modal.classList.add('active');
            } else {
                modal.classList.add('show');
            }
            // 焦点管理
            const focusable = modal.querySelector('input, select, textarea, button:not(.modal-close)');
            if (focusable) setTimeout(() => focusable.focus(), 100);
            closeFabMenu();
        }
    }

    function closeModal(modalId) {
        const modal = Utils.get(modalId);
        if (modal) {
            modal.classList.remove('show');
            modal.classList.remove('active');
        }

        // 重置表单
        if (modalId === 'appModal') {
            window.appNavigator.editingAppId = null;
            Utils.get('appModalTitle').textContent = '添加网站';
            Utils.get('appName').value = '';
            Utils.get('appUrl').value = '';
            Utils.get('appDesc').value = '';
            Utils.get('appIcon').value = '';
            Utils.get('appHidden').checked = false;
            Utils.get('iconPreview').innerHTML = '🌐';
        } else if (modalId === 'categoryModal') {
            window.appNavigator.editingCategoryId = null;
            Utils.get('categoryModalTitle').textContent = '添加分类';
            Utils.get('catName').value = '';
            Utils.get('catIcon').value = '';
            Utils.get('catIconPreview').textContent = '📁';
        }
    }

    async function openAddAppModal(categoryId) {
        const data = await DataManager.getData();
        const select = Utils.get('appCategory');
        if (select) {
            select.innerHTML = data.categories
                .filter(c => c.id !== 'all')
                .map(c => `<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`)
                .join('');
        }
        Utils.get('appHidden').checked = false;
        openModal('appModal');
    }

    async function editApp(appId) {
        const data = await DataManager.getData();
        const app = data.apps.find(a => a.id === appId);
        if (!app) return;

        window.appNavigator.editingAppId = appId;
        Utils.get('appModalTitle').textContent = '编辑网站';
        Utils.get('appName').value = app.name;
        Utils.get('appUrl').value = app.url;
        Utils.get('appDesc').value = app.description || '';
        Utils.get('appIcon').value = app.icon || '';
        Utils.get('appHidden').checked = app.hidden || false;
        updateIconPreview();

        const select = Utils.get('appCategory');
        select.innerHTML = data.categories
            .filter(c => c.id !== 'all')
            .map(c => `<option value="${c.id}" ${c.id === app.category ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`)
            .join('');

        openModal('appModal');
    }

    async function saveApp() {
        const name = Utils.get('appName').value.trim();
        const url = Utils.get('appUrl').value.trim();
        const category = Utils.get('appCategory').value;
        const description = Utils.get('appDesc').value.trim();
        const icon = Utils.get('appIcon').value.trim();
        const hidden = Utils.get('appHidden')?.checked || false;

        if (!name || !url || !category) {
            showToast('请填写必填项', 'error');
            return;
        }

        let finalUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            finalUrl = 'https://' + url;
        }

        const appData = { name, url: finalUrl, category, description, icon, hidden };

        if (window.appNavigator.editingAppId) {
            await DataManager.updateApp(window.appNavigator.editingAppId, appData);
            showToast('网站已更新');
        } else {
            await DataManager.addApp(appData);
            showToast('网站已添加');
        }

        closeModal('appModal');
        await window.appNavigator.renderNavigation();
        await window.appNavigator.renderApps();

        if (hidden) {
            await showHiddenTip();
        }
    }

    async function deleteApp(appId) {
        const confirmed = await showConfirm('确定要删除这个网站吗？', { isDanger: true, title: '删除网站' });
        if (!confirmed) return;
        await DataManager.deleteApp(appId);
        await window.appNavigator.renderApps();
        showToast('网站已删除');
    }

    function openAddCategoryModal() {
        openModal('categoryModal');
    }

    async function openManageCategoriesModal() {
        await renderCategoriesList();
        openModal('manageCategoriesModal');
    }

    async function editCategory(catId) {
        const data = await DataManager.getData();
        const cat = data.categories.find(c => c.id === catId);
        if (!cat || cat.id === 'all') return;

        window.appNavigator.editingCategoryId = catId;
        Utils.get('categoryModalTitle').textContent = '编辑分类';
        Utils.get('catName').value = cat.name;
        Utils.get('catIcon').value = cat.icon || '';
        Utils.get('catIconDark').value = cat.iconDark || '';
        if (Utils.get('catMonochrome')) {
            Utils.get('catMonochrome').checked = cat.monochrome || false;
        }
        updateCatIconPreview();

        closeModal('manageCategoriesModal');
        openModal('categoryModal');
    }

    async function saveCategory() {
        const name = Utils.get('catName').value.trim();
        const icon = Utils.get('catIcon').value.trim();
        const iconDark = Utils.get('catIconDark')?.value.trim();
        const monochrome = Utils.get('catMonochrome')?.checked || false;

        if (!name) {
            showToast('请输入分类名称', 'error');
            return;
        }

        const catData = { name, icon: icon || '📁', iconDark: iconDark || '', monochrome };

        if (window.appNavigator.editingCategoryId) {
            await DataManager.updateCategory(window.appNavigator.editingCategoryId, catData);
            showToast('分类已更新');
        } else {
            await DataManager.addCategory(catData);
            showToast('分类已添加');
        }

        // 强制立即同步，确保数据保存到存储
        await DataManager.syncNow();

        closeModal('categoryModal');
        await window.appNavigator.renderNavigation();
        await window.appNavigator.renderApps();
    }

    async function deleteCategory(catId) {
        if (catId === 'all') {
            showToast('不能删除默认分类', 'error');
            return;
        }
        const data = await DataManager.getData();
        const cat = data.categories.find(c => c.id === catId);
        const confirmed = await showConfirm(`确定要删除分类"${cat.name}"吗？该分类下的所有网站也会被删除。`, { isDanger: true, title: '删除分类' });
        if (!confirmed) return;

        await DataManager.deleteCategory(catId);
        if (window.appNavigator.currentCategory === catId) {
            window.appNavigator.switchCategory('all');
        }
        await renderCategoriesList();
        await window.appNavigator.renderNavigation();
        await window.appNavigator.renderApps();
        showToast('分类已删除');
    }

    async function renderCategoriesList() {
        const data = await DataManager.getData();
        const container = Utils.get('categoriesList');
        if (!container) return;

        container.innerHTML = data.categories
            .filter(c => c.id !== 'all')
            .map(cat => {
                const count = data.apps.filter(a => a.category === cat.id).length;
                const isImage = cat.icon && (cat.icon.includes('.') || cat.icon.startsWith('http'));
                const iconHtml = isImage ?
                    Utils.createImageWithFallback(cat.icon, cat.name) :
                    Utils.escapeHtml(cat.icon || '📁');

                return `
                        <div class="category-list-item">
                            <div class="cat-icon">${iconHtml}</div>
                            <div class="cat-info">
                                <div class="cat-name">${Utils.escapeHtml(cat.name)}</div>
                                <div class="cat-count">${count} 个网站</div>
                            </div>
                            <div class="cat-actions">
                                <button class="app-action-btn" data-action="edit-cat" data-cat-id="${cat.id}" title="编辑" aria-label="编辑分类"><img src="./image/icons/edit.svg" width="16" height="16" style="filter: var(--icon-filter, none);"></button>
                                <button class="app-action-btn delete" data-action="delete-cat" data-cat-id="${cat.id}" title="删除" aria-label="删除分类"><img src="./image/icons/delete.svg" width="16" height="16" style="filter: var(--icon-filter, none);"></button>
                            </div>
                        </div>
                    `;
            }).join('');
    }

    function updateIconPreview() {
        const icon = Utils.get('appIcon').value.trim();
        const preview = Utils.get('iconPreview');

        if (!icon) {
            preview.innerHTML = '🌐';
            return;
        }

        if (icon.startsWith('http') || icon.startsWith('data:') || icon.startsWith('//')) {
            preview.innerHTML = Utils.createImageWithFallback(icon, '预览', '❓');
        } else {
            preview.textContent = icon;
        }
    }

    function autoFetchIcon() {
        const url = Utils.get('appUrl').value.trim();
        if (!url) return;

        try {
            const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
            const domain = urlObj.hostname;
            const faviconUrl = `https://favicon.im/${domain}?l=${Date.now()}`; // 添加时间戳防止缓存

            Utils.get('appIcon').value = faviconUrl;
            updateIconPreview();
            showToast('已自动获取图标');
        } catch(e) {
            console.error('获取图标失败:', e);
        }
    }

    function clearIcon() {
        Utils.get('appIcon').value = '';
        updateIconPreview();
    }

    function openUiLib() {
        window.appNavigator.iconSelectCallback = (icon) => {
            Utils.get('appIcon').value = icon;
            updateIconPreview();
            closeUiLib();
        };
        renderUiLib();
        Utils.get('uiLibPanel').classList.add('show');
    }

    function openUiLibForCategory() {
        window.appNavigator.iconSelectCallback = (icon) => {
            Utils.get('catIcon').value = icon;
            updateCatIconPreview();
            closeUiLib();
        };
        renderUiLib();
        Utils.get('uiLibPanel').classList.add('show');
    }

    function openUiLibDarkForCategory() {
        window.appNavigator.iconSelectCallback = (icon) => {
            Utils.get('catIconDark').value = icon;
            updateCatIconPreview();
            closeUiLib();
        };
        renderUiLib();
        Utils.get('uiLibPanel').classList.add('show');
    }

    function closeUiLib() {
        Utils.get('uiLibPanel').classList.remove('show');
        window.appNavigator.iconSelectCallback = null;
    }

    async function renderUiLib() {
        const lib = await DataManager.getUiLib();
        const tabsContainer = Utils.get('uiLibTabs');
        const contentContainer = Utils.get('uiLibContent');

        if (tabsContainer) {
            tabsContainer.innerHTML = lib.categories.map((cat, index) => `
                    <button class="ui-lib-tab ${index === 0 ? 'active' : ''}"
                            data-action="switch-uilib-tab" data-cat-id="${cat.id}"
                            role="tab"
                            aria-selected="${index === 0}"
                            aria-controls="uiLibContent"
                            id="ui-tab-${cat.id}">
                        ${Utils.escapeHtml(cat.name)}
                    </button>
                `).join('');
        }

        if (lib.categories.length > 0) {
            await renderUiLibItems(lib.categories[0].id);
        }
    }

    async function renderUiLibItems(categoryId) {
        const lib = await DataManager.getUiLib();
        const container = Utils.get('uiLibContent');
        const items = lib.items.filter(i => i.category === categoryId);

        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<div class="empty-state-compact"><p>暂无图标</p></div>';
            return;
        }

        container.innerHTML = `<div class="ui-lib-grid">
                ${items.map(item => {
            // 判断是否为图片：网络URL、data URL、本地路径（./ 或 / 开头）
            const isImage = item.url.startsWith('http') || 
                           item.url.startsWith('data:') || 
                           item.url.startsWith('./') || 
                           item.url.startsWith('/') ||
                           item.url.match(/\.(svg|png|jpg|jpeg|gif|ico|webp)$/i);
            const content = isImage ?
                `<img src="${Utils.escapeHtml(item.url)}" alt="${Utils.escapeHtml(item.name)}" style="width:32px;height:32px;object-fit:contain;" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=\'font-size:24px;\'>\ud83c\udf10</span>';">` :
                `<span style="font-size:28px;">${Utils.escapeHtml(item.url)}</span>`;
            return `
                        <div class="ui-lib-item" data-action="select-uilib-icon" data-icon="${Utils.escapeHtml(item.url)}"
                             title="${Utils.escapeHtml(item.name)}"
                             tabindex="0"
                             role="button"
                             data-keydown-action="select-uilib-icon" data-icon="${Utils.escapeHtml(item.url)}">
                            ${content}
                            <span>${Utils.escapeHtml(item.name)}</span>
                        </div>
                    `;
        }).join('')}
            </div>`;
    }

    function selectUiIcon(icon) {
        if (window.appNavigator.iconSelectCallback) {
            window.appNavigator.iconSelectCallback(icon);
        }
    }

    async function openUiLibManager() {
        closeUiLib();
        await renderUiLibManager();
        openModal('uiLibManagerModal');
    }

    async function renderUiLibManager() {
        const lib = await DataManager.getUiLib();
        const systemLib = DataManager.systemUiLib;

        const catList = Utils.get('uiCategoriesList');
        if (catList) {
            catList.innerHTML = lib.categories.map(cat => {
                // 检查是否是系统分类
                const isSystem = systemLib.categories.some(c => c.id === cat.id);
                const deleteBtn = isSystem ? '' : `
                    <button class="app-action-btn delete" data-action="delete-ui-cat" data-cat-id="${cat.id}" title="删除" aria-label="删除分类">
                        <img src="./image/icons/delete.svg" width="16" height="16" style="filter: var(--icon-filter, none);">
                    </button>
                `;
                return `
                    <div class="category-list-item">
                        <div class="cat-info">
                            <div class="cat-name">${Utils.escapeHtml(cat.name)}${isSystem ? ' <span style="color:var(--md-sys-color-outline);font-size:12px;">系统</span>' : ''}</div>
                        </div>
                        <div class="cat-actions">
                            ${deleteBtn}
                        </div>
                    </div>
                `;
            }).join('');
        }

        const select = Utils.get('uiItemCategory');
        if (select) {
            // 添加"全部"选项作为第一个选项
            select.innerHTML = '<option value="">全部分类</option>' + 
                lib.categories.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join('');
            
            // 添加 change 事件监听，根据分类筛选图标
            select.onchange = async () => {
                const selectedCategory = select.value;
                await renderUiItemsList(selectedCategory);
            };
        }

        await renderUiItemsList();
    }

    // 修复：正确传递 event target
    function switchUiTab(tab, clickedBtn) {
        document.querySelectorAll('#uiLibManagerModal .tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('#uiLibManagerModal .tab-content').forEach(t => {
            t.classList.remove('active');
            t.hidden = true;
        });

        if (clickedBtn) {
            clickedBtn.classList.add('active');
            clickedBtn.setAttribute('aria-selected', 'true');
        }

        const tabId = 'uiTab' + tab.charAt(0).toUpperCase() + tab.slice(1);
        const tabContent = Utils.get(tabId);
        if (tabContent) {
            tabContent.classList.add('active');
            tabContent.hidden = false;
        }
    }

    async function addUiCategory() {
        const name = Utils.get('newUiCategoryName').value.trim();
        if (!name) {
            showToast('请输入分类名称', 'error');
            return;
        }
        await DataManager.addUiCategory(name);
        Utils.get('newUiCategoryName').value = '';
        await renderUiLibManager();
        showToast('UI分类已添加');
    }

    async function deleteUiCategory(id) {
        const confirmed = await showConfirm('确定要删除这个UI分类吗？', { isDanger: true, title: '删除分类' });
        if (!confirmed) return;
        await DataManager.deleteUiCategory(id);
        await renderUiLibManager();
        showToast('UI分类已删除');
    }

    async function addUiItem() {
        const category = Utils.get('uiItemCategory').value;
        const name = Utils.get('uiItemName').value.trim();
        const url = Utils.get('uiItemUrl').value.trim();

        if (!name) {
            showToast('请输入图标名称', 'error');
            return;
        }

        if (!url) {
            showToast('请输入图标 URL', 'error');
            return;
        }

        // 验证 URL 格式（禁止 data URL 上传）
        if (url.startsWith('data:')) {
            showToast('为节省存储空间，不支持上传本地文件，请使用网络地址', 'error');
            return;
        }

        await DataManager.addUiItem({ category, name, url });
        
        // 清空表单
        Utils.get('uiItemName').value = '';
        Utils.get('uiItemUrl').value = '';
        
        // 根据当前选中的分类筛选刷新列表
        const select = Utils.get('uiItemCategory');
        const filterCategory = select ? select.value : '';
        await renderUiItemsList(filterCategory);
        showToast('图标已添加');
    }

    async function renderUiItemsList(filterCategory = '') {
        const lib = await DataManager.getUiLib();
        const container = Utils.get('uiItemsList');
        if (!container) return;

        // 根据分类筛选
        let items = lib.items;
        if (filterCategory) {
            items = items.filter(item => item.category === filterCategory);
        }

        if (items.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--md-sys-color-on-surface-variant);">暂无图标</div>';
            return;
        }

        container.innerHTML = items.map(item => {
            const cat = lib.categories.find(c => c.id === item.category);
            // 判断是否为图片：网络URL、data URL、本地路径或图片文件
            const isImage = item.url.startsWith('http') || 
                           item.url.startsWith('data:') || 
                           item.url.startsWith('./') || 
                           item.url.startsWith('/') ||
                           item.url.match(/\.(svg|png|jpg|jpeg|gif|ico|webp)$/i);
            // 系统图标不能删除
            const deleteBtn = item.isSystem ? '' : `
                <button class="app-action-btn delete" data-action="delete-ui-item" data-item-id="${item.id}" title="删除" aria-label="删除图标">
                    <img src="./image/icons/delete.svg" width="16" height="16" style="filter: var(--icon-filter, none);">
                </button>
            `;
            // 图标显示内容
            const iconContent = isImage ?
                `<img src="${Utils.escapeHtml(item.url)}" alt="${Utils.escapeHtml(item.name)}" style="width:24px;height:24px;object-fit:contain;" loading="lazy">` :
                Utils.escapeHtml(item.url);
            
            return `
                    <div class="category-list-item" style="cursor:pointer;" data-action="preview-ui-item" data-item-id="${item.id}">
                        <div class="cat-icon" style="font-size:20px;pointer-events:none;">
                            ${iconContent}
                        </div>
                        <div class="cat-info" style="pointer-events:none;">
                            <div class="cat-name">${Utils.escapeHtml(item.name)}</div>
                            <div class="cat-count">${cat ? Utils.escapeHtml(cat.name) : '未分类'}${item.isSystem ? ' · 系统' : ''}</div>
                        </div>
                        <div class="cat-actions" onclick="event.stopPropagation();">
                            ${deleteBtn}
                        </div>
                    </div>
                `;
        }).join('');
    }

    async function deleteUiItem(id) {
        await DataManager.deleteUiItem(id);
        // 获取当前选中的分类筛选，刷新列表时保持一致
        const select = Utils.get('uiItemCategory');
        const filterCategory = select ? select.value : '';
        await renderUiItemsList(filterCategory);
    }

    // 预览图标
    async function previewUiItem(id) {
        const lib = await DataManager.getUiLib();
        const item = lib.items.find(i => i.id === id);
        if (!item) return;

        const cat = lib.categories.find(c => c.id === item.category);
        
        // 设置预览内容
        const previewImage = Utils.get('iconPreviewImage');
        const previewName = Utils.get('iconPreviewName');
        const previewCategory = Utils.get('iconPreviewCategory');
        
        if (previewImage) {
            previewImage.src = item.url;
            previewImage.alt = item.name;
        }
        if (previewName) {
            previewName.textContent = item.name;
        }
        if (previewCategory) {
            previewCategory.textContent = (cat ? cat.name : '未分类') + (item.isSystem ? ' · 系统图标' : '');
        }
        
        // 打开预览模态框
        const modal = Utils.get('iconPreviewModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    async function exportData() {
        const data = await DataManager.export();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `app-navigator-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('数据已导出');
    }

    function importData() {
        Utils.get('importFile').click();
    }

    async function handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const confirmed = await showConfirm('导入数据将覆盖现有数据，确定继续吗？', { title: '导入数据', okText: '继续', isDanger: true });
                if (confirmed) {
                    await DataManager.import(data);
                    await window.appNavigator.renderNavigation();
                    await window.appNavigator.renderApps();
                    showToast('数据导入成功');
                }
            } catch(err) {
                showToast('文件格式错误', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        const icon = type === 'error' ? '❌' : '✨';
        toast.style.cssText = `
                position: fixed;
                top: 70px;
                right: 20px;
                background: var(--md-sys-color-inverse-surface);
                color: var(--md-sys-color-inverse-on-surface);
                padding: 12px 20px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 3000;
                animation: slideInRight 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                border: 1px solid var(--md-sys-color-outline-variant);
            `;
        toast.innerHTML = `<span aria-hidden="true">${icon}</span><span>${Utils.escapeHtml(message)}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // ==================== 搜索功能 ====================
    function openSearchModal() {
        const modal = Utils.get('searchModal');
        const input = Utils.get('searchInput');
        searchModalOpen = true;
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        if (input) {
            input.value = '';
            renderSearchHistory();
            setTimeout(() => input.focus(), 100);
        }
        // 更新下拉菜单位置
        requestAnimationFrame(updateEngineDropdownPosition);
    }

    function closeSearchModal() {
        const modal = Utils.get('searchModal');
        searchModalOpen = false;
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        closeEngineDropdown();
    }

    // 优化：防止下拉菜单超出视口
    function updateEngineDropdownPosition() {
        const wrapper = Utils.get('engineSelectWrapper');
        const menu = Utils.get('engineDropdownMenu');
        if (!wrapper || !menu) return;

        const rect = wrapper.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();

        // 检查右边界
        let left = rect.left;
        if (left + 180 > window.innerWidth) { // 180 是 min-width
            left = window.innerWidth - 190;
        }

        menu.style.left = Math.max(10, left) + 'px';
        menu.style.top = rect.bottom + 4 + 'px';
    }

    function toggleEngineDropdown(event) {
        if (event) event.stopPropagation();
        const wrapper = Utils.get('engineSelectWrapper');
        const menu = Utils.get('engineDropdownMenu');
        engineDropdownOpen = !engineDropdownOpen;

        if (engineDropdownOpen) {
            updateEngineDropdownPosition();
            if (wrapper) {
                wrapper.classList.add('open');
                wrapper.setAttribute('aria-expanded', 'true');
            }
            if (menu) menu.classList.add('show');
        } else {
            closeEngineDropdown();
        }
    }

    function closeEngineDropdown() {
        engineDropdownOpen = false;
        const wrapper = Utils.get('engineSelectWrapper');
        const menu = Utils.get('engineDropdownMenu');
        if (wrapper) {
            wrapper.classList.remove('open');
            wrapper.setAttribute('aria-expanded', 'false');
        }
        if (menu) menu.classList.remove('show');
    }

    async function selectEngine(index) {
        currentEngineIndex = index;
        renderEngineDropdown();
        updateEngineDisplay();
        closeEngineDropdown();
        const input = Utils.get('searchInput');
        if (input) input.focus();
        
        // 保存当前搜索引擎到存储
        try {
            await StorageManager.set('selectedSearchEngine', index);
        } catch (e) {
            console.error('保存搜索引擎失败:', e);
        }
    }

    function renderEngineDropdown() {
        const menu = Utils.get('engineDropdownMenu');
        if (!menu || typeof searchEngines === 'undefined') return;

        menu.innerHTML = searchEngines.map((engine, index) => `
                <div class="engine-option ${index === currentEngineIndex ? 'active' : ''}"
                     data-action="select-engine" data-engine-index="${index}"
                     role="option"
                     aria-selected="${index === currentEngineIndex}">
                    <img src="${engine.icon}" alt="" loading="lazy" onerror="this.src='./image/icons/search.svg'">
                    <span>${Utils.escapeHtml(engine.name)}</span>
                </div>
            `).join('');
    }

    function updateEngineDisplay() {
        if (typeof searchEngines === 'undefined') return;
        const engine = searchEngines[currentEngineIndex];
        const iconImg = Utils.get('currentEngineIcon');
        const nameSpan = Utils.get('currentEngineName');
        const footerName = Utils.get('footerEngineName');

        if (iconImg) {
            iconImg.src = engine.icon;
            iconImg.alt = '';
        }
        if (nameSpan) nameSpan.textContent = engine.name;
        if (footerName) footerName.textContent = engine.name;
    }

    function onSearchInput(event) {
        if (event.key === 'Enter') {
            doSearch();
        }
    }

    function doSearch() {
        const input = Utils.get('searchInput');
        const query = input ? input.value.trim() : '';
        if (!query || typeof searchEngines === 'undefined') return;

        saveSearchHistory(query);
        const engine = searchEngines[currentEngineIndex];
        const url = engine.url.replace('{q}', encodeURIComponent(query));
        window.open(url, '_blank');
        closeSearchModal();
    }

    // 防抖保存历史记录
    const debouncedSaveHistory = Utils.debounce(async (query) => {
        try {
            let history = await StorageManager.get('searchHistory') || [];
            // 兼容旧格式（字符串数组）
            history = history.filter(item => {
                const itemQuery = typeof item === 'string' ? item : item?.query;
                return itemQuery !== query;
            });
            history.unshift({ query: query, time: Date.now() });
            history = history.slice(0, 10);
            await StorageManager.set('searchHistory', history);
        } catch (e) {
            console.error('Failed to save search history:', e);
        }
    }, 500);

    async function saveSearchHistory(query) {
        debouncedSaveHistory(query);
    }

    async function getSearchHistory() {
        try {
            return await StorageManager.get('searchHistory') || [];
        } catch (e) {
            return [];
        }
    }

    async function renderSearchHistory() {
        const historyDiv = Utils.get('searchHistory');
        const listDiv = Utils.get('historyList');
        let history = await getSearchHistory();

        if (!historyDiv || !listDiv) return;

        // 兼容旧格式（字符串数组）
        history = history.map(item => {
            if (typeof item === 'string') {
                return { query: item, time: Date.now() };
            }
            return item;
        });

        // 更新全局变量供事件处理使用
        window.searchHistory = history;

        if (history.length === 0) {
            listDiv.innerHTML = '<div class="empty-history">暂无搜索记录</div>';
            historyDiv.style.display = 'block';
            return;
        }

        listDiv.innerHTML = history.map((item, index) => `
                <div class="history-item" data-action="use-history" data-history-index="${index}" role="listitem" tabindex="0" data-keydown-action="use-history">
                    <div class="history-icon" aria-hidden="true">🕐</div>
                    <div class="history-text">${Utils.escapeHtml(item.query)}</div>
                    <div class="history-time">${Utils.formatTime(item.time)}</div>
                </div>
            `).join('');

        historyDiv.style.display = 'block';
    }

    async function useHistoryItem(historyIndex) {
        const history = await getSearchHistory();
        const item = history[historyIndex];
        if (!item) return;

        const input = Utils.get('searchInput');
        if (input) {
            // 兼容旧格式（字符串数组）和新格式（对象数组）
            const query = typeof item === 'string' ? item : item.query;
            input.value = query;
            // 使用当前选择的引擎搜索，而不是历史引擎
            doSearch();
        }
    }

    async function clearSearchHistory() {
        await StorageManager.remove('searchHistory');
        renderSearchHistory();
    }

    // ==================== 主题和壁纸 ====================
    function detectDarkMode() {
        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-background').trim();

        const isDark = isColorDark(bgColor);
        document.body.classList.toggle('dark-mode', isDark);

        // 更新 RGB 变量
        if (isDark) {
            document.documentElement.style.setProperty('--md-sys-color-surface-rgb', '40, 40, 40');
            document.documentElement.style.setProperty('--md-sys-color-background-rgb', '30, 30, 30');
            document.documentElement.style.setProperty('--md-sys-color-surface-variant-rgb', '50, 50, 50');
        } else {
            document.documentElement.style.setProperty('--md-sys-color-surface-rgb', '255, 248, 249');
            document.documentElement.style.setProperty('--md-sys-color-background-rgb', '255, 248, 249');
            document.documentElement.style.setProperty('--md-sys-color-surface-variant-rgb', '243, 221, 226');
        }
    }

    function isColorDark(color) {
        if (!color) return false;
        let r, g, b;
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                r = parseInt(hex.substr(0, 2), 16);
                g = parseInt(hex.substr(2, 2), 16);
                b = parseInt(hex.substr(4, 2), 16);
            }
        } else if (color.startsWith('rgb')) {
            const match = color.match(/\d+/g);
            if (match) {
                r = parseInt(match[0]);
                g = parseInt(match[1]);
                b = parseInt(match[2]);
            }
        }
        if (r === undefined || isNaN(r)) return false;
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 128;
    }

    function togglePersonalizationPanel() {
        // 使用原生方法获取元素，避免缓存问题
        const dropdown = document.getElementById('personalizationDropdown');
        const overlay = document.getElementById('personalizationOverlay');
        const btn = document.getElementById('personalizationToggleBtn');

        if (!dropdown) {
            console.error('找不到个性化下拉菜单元素');
            return;
        }

        const isOpen = dropdown.classList.contains('show');

        if (isOpen) {
            // 关闭
            dropdown.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
            if (btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            }
        } else {
            // 打开
            dropdown.classList.add('show');
            if (overlay) overlay.classList.add('show');
            if (btn) {
                btn.classList.add('active');
                btn.setAttribute('aria-expanded', 'true');
            }

            // 安全地渲染主题选项
            try {
                if (typeof themeConfig !== 'undefined' && themeConfig.themes) {
                    renderThemeOptions();
                } else {
                    console.warn('themeConfig 未加载，跳过主题渲染');
                    // 如果主题配置没加载，至少清空选项避免报错
                    const container = document.getElementById('themeOptions');
                    if (container) container.innerHTML = '<div style="padding:10px;color:#999">主题加载中...</div>';
                }
            } catch (e) {
                console.error('渲染主题选项失败:', e);
            }
        }
    }


    function renderThemeOptions() {
        const container = Utils.get('themeOptions');
        if (!container || typeof themeConfig === 'undefined') return;

        const currentTheme = localStorage.getItem('selectedTheme') || themeConfig.defaultTheme || 'material-rose';

        container.innerHTML = themeConfig.themes.map(theme => {
            const color = theme.colors && theme.colors['--md-sys-color-primary'] ? theme.colors['--md-sys-color-primary'] : '#B14A6B';
            const isActive = theme.id === currentTheme;

            return `
                    <div class="theme-option ${isActive ? 'active' : ''}"
                         data-action="select-theme"
                         data-theme-id="${theme.id}"
                         role="radio"
                         aria-checked="${isActive}"
                         tabindex="0">
                        <div class="theme-option-preview" style="background: ${color}"></div>
                        <span class="theme-option-name">${Utils.escapeHtml(theme.name)}</span>
                        <span class="theme-option-check" aria-hidden="true">✓</span>
                    </div>
                `;
        }).join('');
    }

    function selectTheme(themeId) {
        localStorage.setItem('selectedTheme', themeId);

        if (typeof themeConfig !== 'undefined' && themeConfig.themes) {
            const theme = themeConfig.themes.find(t => t.id === themeId);
            if (theme && theme.colors) {
                Object.entries(theme.colors).forEach(([key, value]) => {
                    document.documentElement.style.setProperty(key, value);
                });
            }
        }

        requestAnimationFrame(detectDarkMode);
        document.dispatchEvent(new CustomEvent('themeChanged', { detail: { themeId } }));

        // 更新 UI
        document.querySelectorAll('.theme-option').forEach(opt => {
            const isSelected = opt.dataset.themeId === themeId;
            opt.classList.toggle('active', isSelected);
            opt.setAttribute('aria-checked', isSelected);
        });

        const themeName = themeConfig.themes.find(t => t.id === themeId)?.name || '新主题';
        showToast(`已切换到 ${themeName}`);
    }

    class WallpaperManager {
        constructor() {
            this.defaults = { url: '', opacity: 50, blur: 0, overlayOpacity: 85 };
            this.settings = { ...this.defaults };
            this.init();
        }

        async init() {
            try {
                const saved = await StorageManager.get('appNavigator_wallpaper');
                if (saved) {
                    this.settings = { ...this.defaults, ...saved };
                }
            } catch (e) {
                console.error('Failed to load wallpaper settings:', e);
            }
            await this.applySettings();
            this.bindPresetEvents();
            this.bindLocalFileEvent();
        }

        bindLocalFileEvent() {
            const fileInput = document.getElementById('wallpaperFileInput');
            const selectBtn = document.getElementById('btnSelectLocalImage');
            const urlInput = Utils.get('wallpaperUrl');
            
            if (!fileInput || !selectBtn) return;
            
            // 点击按钮触发文件选择
            selectBtn.addEventListener('click', () => {
                fileInput.click();
            });
            
            // 处理文件选择
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                // 验证文件类型
                if (!file.type.startsWith('image/')) {
                    showToast('请选择有效的图片文件', 'error');
                    return;
                }
                
                // 检查文件大小（限制5MB，避免存储过大）
                const MAX_SIZE = 5 * 1024 * 1024; // 5MB
                if (file.size > MAX_SIZE) {
                    showToast('图片过大，请选择小于5MB的图片', 'error');
                    return;
                }
                
                showToast('正在处理图片...');
                
                try {
                    // 清理旧的本地图片数据（如果有）
                    await this.clearLocalImageData();
                    
                    // 读取文件为 base64
                    const base64 = await this.fileToBase64(file);
                    
                    // 保存图片数据和元信息
                    const imageData = {
                        data: base64,
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        timestamp: Date.now()
                    };
                    
                    await StorageManager.set('appNavigator_wallpaper_image', imageData);
                    
                    // 更新设置（使用特殊标记表示本地图片）
                    this.settings.url = 'local://wallpaper';
                    this.settings.isLocalImage = true;
                    
                    // 更新UI
                    if (urlInput) {
                        urlInput.value = '';
                        urlInput.placeholder = `本地图片: ${file.name}`;
                    }
                    
                    const nameDisplay = document.getElementById('localImageName');
                    if (nameDisplay) {
                        nameDisplay.textContent = `已保存: ${file.name} (${this.formatFileSize(file.size)})`;
                        nameDisplay.style.display = 'block';
                    }
                    
                    // 应用壁纸
                    await this.applySettings();
                    
                    // 保存设置（关键：保存 isLocalImage 标记和 url）
                    await this.save();
                    
                    showToast('本地图片已保存到浏览器');
                    console.log('本地图片已保存:', file.name, this.formatFileSize(file.size));
                    
                } catch (error) {
                    console.error('处理本地图片失败:', error);
                    showToast('图片处理失败: ' + error.message, 'error');
                }
            });
        }

        // 将文件转换为 base64
        fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('文件读取失败'));
                reader.readAsDataURL(file);
            });
        }

        // 格式化文件大小
        formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        // 清理本地图片数据
        async clearLocalImageData() {
            try {
                const existing = await StorageManager.get('appNavigator_wallpaper_image');
                if (existing) {
                    await StorageManager.remove('appNavigator_wallpaper_image');
                    console.log('已清理旧的本地图片数据');
                }
            } catch (e) {
                console.error('清理本地图片数据失败:', e);
            }
        }

        async applySettings() {
            const layer = Utils.get('wallpaperLayer');
            const overlay = Utils.get('wallpaperOverlay');
            const urlInput = Utils.get('wallpaperUrl');
            const opacitySlider = Utils.get('opacitySlider');
            const blurSlider = Utils.get('blurSlider');
            const overlaySlider = Utils.get('overlaySlider');

            if (!layer || !overlay) return;

            let imageUrl = this.settings.url;

            // 如果是本地图片，从存储中加载
            if (this.settings.isLocalImage || imageUrl === 'local://wallpaper') {
                try {
                    const imageData = await StorageManager.get('appNavigator_wallpaper_image');
                    if (imageData && imageData.data) {
                        imageUrl = imageData.data;
                        
                        // 更新UI显示
                        if (urlInput) {
                            urlInput.value = '';
                            urlInput.placeholder = `本地图片: ${imageData.name}`;
                        }
                        const nameDisplay = document.getElementById('localImageName');
                        if (nameDisplay) {
                            nameDisplay.textContent = `已保存: ${imageData.name} (${this.formatFileSize(imageData.size)})`;
                            nameDisplay.style.display = 'block';
                        }
                    } else {
                        // 本地图片数据丢失，清空设置
                        imageUrl = '';
                        this.settings.isLocalImage = false;
                    }
                } catch (e) {
                    console.error('加载本地图片失败:', e);
                    imageUrl = '';
                }
            }

            if (imageUrl) {
                if (imageUrl.includes('gradient')) {
                    layer.style.backgroundImage = imageUrl;
                } else {
                    layer.style.backgroundImage = `url(${imageUrl})`;
                }
                layer.style.opacity = this.settings.opacity / 100;
                layer.style.filter = `blur(${this.settings.blur}px)`;
            } else {
                layer.style.backgroundImage = '';
                layer.style.opacity = 0;
            }

            overlay.style.opacity = (100 - this.settings.overlayOpacity) / 100;

            if (urlInput && !this.settings.isLocalImage) urlInput.value = this.settings.url || '';
            if (opacitySlider) opacitySlider.value = this.settings.opacity;
            if (blurSlider) blurSlider.value = this.settings.blur;
            if (overlaySlider) overlaySlider.value = this.settings.overlayOpacity;

            // 恢复预设的 active 状态
            const presets = document.querySelectorAll('.wallpaper-preset');
            presets.forEach(p => {
                p.classList.remove('active');
                if (p.dataset.url === this.settings.url) {
                    p.classList.add('active');
                }
            });

            this.updateDisplayValues();
        }

        updateDisplayValues() {
            const opacityValue = Utils.get('opacityValue');
            const blurValue = Utils.get('blurValue');
            const overlayValue = Utils.get('overlayValue');

            if (opacityValue) opacityValue.textContent = this.settings.opacity + '%';
            if (blurValue) blurValue.textContent = this.settings.blur + 'px';
            if (overlayValue) overlayValue.textContent = this.settings.overlayOpacity + '%';
        }

        bindPresetEvents() {
            const presets = document.querySelectorAll('.wallpaper-preset');
            presets.forEach(preset => {
                const clickHandler = (e) => {
                    presets.forEach(p => p.classList.remove('active'));
                    e.target.classList.add('active');
                    const url = e.target.dataset.url;
                    const urlInput = Utils.get('wallpaperUrl');
                    if (urlInput) urlInput.value = url;
                    this.updateFromInputs();
                };
                preset.addEventListener('click', clickHandler);
                // 键盘支持
                preset.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') clickHandler(e);
                });
            });
        }

        async updateFromInputs() {
            const urlInput = Utils.get('wallpaperUrl');
            const opacitySlider = Utils.get('opacitySlider');
            const blurSlider = Utils.get('blurSlider');
            const overlaySlider = Utils.get('overlaySlider');

            const newUrl = urlInput ? urlInput.value.trim() : '';
            
            // 如果从网络图片切换到其他（渐变、URL等），清理本地图片
            if (newUrl && this.settings.isLocalImage) {
                await this.clearLocalImageData();
                this.settings.isLocalImage = false;
                
                const nameDisplay = document.getElementById('localImageName');
                if (nameDisplay) {
                    nameDisplay.textContent = '';
                    nameDisplay.style.display = 'none';
                }
                if (urlInput) urlInput.placeholder = '输入图片URL...';
                console.log('切换到网络图片，已清理本地图片数据');
            }

            this.settings = {
                url: newUrl,
                isLocalImage: this.settings.isLocalImage && !newUrl, // 如果有新URL，取消本地图片标记
                opacity: parseInt(opacitySlider ? opacitySlider.value : 50),
                blur: parseInt(blurSlider ? blurSlider.value : 0),
                overlayOpacity: parseInt(overlaySlider ? overlaySlider.value : 85)
            };

            await this.applySettings();
            await this.save(); // 保存设置
        }

        async reset() {
            // 清理本地图片数据
            await this.clearLocalImageData();
            
            // 清空文件输入
            const fileInput = document.getElementById('wallpaperFileInput');
            if (fileInput) fileInput.value = '';
            
            const nameDisplay = document.getElementById('localImageName');
            if (nameDisplay) {
                nameDisplay.textContent = '';
                nameDisplay.style.display = 'none';
            }
            
            const urlInput = Utils.get('wallpaperUrl');
            if (urlInput) {
                urlInput.value = '';
                urlInput.placeholder = '输入图片URL...';
            }
            
            this.settings = { ...this.defaults };
            document.querySelectorAll('.wallpaper-preset').forEach(p => p.classList.remove('active'));
            await this.applySettings();
            await this.save();
            showToast('已恢复默认设置');
        }

        async save() {
            await StorageManager.set('appNavigator_wallpaper', this.settings);
        }
    }

    let wallpaperManager;

    async function updateWallpaper() {
        if (wallpaperManager) await wallpaperManager.updateFromInputs();
    }

    async function updateWallpaperSettings() {
        if (wallpaperManager) await wallpaperManager.updateFromInputs();
    }

    function resetWallpaper() {
        if (wallpaperManager) wallpaperManager.reset();
    }

    async function saveWallpaperSettings() {
        if (wallpaperManager) {
            await wallpaperManager.save();
            togglePersonalizationPanel();
            showToast('壁纸设置已保存');
        }
    }

    // ==================== 键盘导航支持 ====================
    function setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K 打开搜索
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                openSearchModal();
            }

            // ESC 关闭模态框
            if (e.key === 'Escape') {
                if (searchModalOpen) {
                    closeSearchModal();
                } else {
                    // 关闭其他模态框
                    const openModal = document.querySelector('.modal-overlay.show, .ui-lib-panel.show');
                    if (openModal) {
                        if (openModal.classList.contains('ui-lib-panel')) closeUiLib();
                        else closeModal(openModal.id);
                    }
                }
            }

            // Tab 循环捕获在模态框内
            if (e.key === 'Tab') {
                const modal = document.querySelector('.modal-overlay.show, .search-modal.show');
                if (modal) {
                    const focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
                    if (focusable.length) {
                        const first = focusable[0];
                        const last = focusable[focusable.length - 1];

                        if (e.shiftKey && document.activeElement === first) {
                            last.focus();
                            e.preventDefault();
                        } else if (!e.shiftKey && document.activeElement === last) {
                            first.focus();
                            e.preventDefault();
                        }
                    }
                }
            }
        });

        // 侧边栏键盘支持
        const sidebar = Utils.get('sidebar');
        if (sidebar) {
            sidebar.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    const navItem = e.target.closest('.nav-item');
                    if (navItem) navItem.click();
                }
            });
        }
    }

    // ==================== 初始化 ====================
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('app.js: DOMContentLoaded 触发');
        
        // 避免重复初始化
        if (window.appNavigator) {
            console.log('app.js: AppNavigator 已存在，跳过重复初始化');
            return;
        }
        
        console.log('app.js: 创建 AppNavigator 实例...');
        appNavigator = new AppNavigator();
        window.appNavigator = appNavigator;
        window.detectDarkMode = detectDarkMode;

        // 导出函数到全局
        window.autoFetchIcon = autoFetchIcon;
        window.updateIconPreview = updateIconPreview;
        window.clearIcon = clearIcon;
        window.openUiLibManager = openUiLibManager;
        window.renderUiLibManager = renderUiLibManager;
        window.addUiCategory = addUiCategory;
        window.deleteUiCategory = deleteUiCategory;
        window.addUiItem = addUiItem;
        window.deleteUiItem = deleteUiItem;
        window.switchUiTab = switchUiTab;
        window.addUiItem = addUiItem;
        window.renderUiLib = renderUiLib;
        window.renderUiLibItems = renderUiLibItems;
        window.openUiLib = openUiLib;
        window.openUiLibForCategory = openUiLibForCategory;
        window.openUiLibDarkForCategory = openUiLibDarkForCategory;
        window.closeUiLib = closeUiLib;
        window.selectUiIcon = selectUiIcon;

        // 导出 DataManager 到全局，供 inline-scripts.js 使用
        window.DataManager = DataManager;

        await appNavigator.init();
        console.log('app.js: AppNavigator 初始化完成');

        wallpaperManager = new WallpaperManager();

        // 加载保存的搜索引擎设置
        try {
            const savedEngineIndex = await StorageManager.get('selectedSearchEngine');
            if (savedEngineIndex !== null && savedEngineIndex !== undefined &&
                savedEngineIndex >= 0 && savedEngineIndex < searchEngines.length) {
                currentEngineIndex = savedEngineIndex;
                console.log('已恢复保存的搜索引擎:', searchEngines[currentEngineIndex]?.name);
            }
        } catch (e) {
            console.error('加载保存的搜索引擎失败:', e);
        }

        renderEngineDropdown();
        updateEngineDisplay();

        // 延迟检测深色模式确保 CSS 已应用
        setTimeout(detectDarkMode, 50);

        // 点击外部关闭下拉菜单
        document.addEventListener('click', (e) => {
            const wrapper = Utils.get('engineSelectWrapper');
            const menu = Utils.get('engineDropdownMenu');
            if (wrapper && menu && !wrapper.contains(e.target) && !menu.contains(e.target)) {
                closeEngineDropdown();
            }
        });

        // 个性化面板外部点击
        document.addEventListener('click', (e) => {
            const dropdown = Utils.get('personalizationDropdown');
            const btn = Utils.get('personalizationToggleBtn');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.remove('show');
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
                const overlay = Utils.get('personalizationOverlay');
                if (overlay) overlay.classList.remove('show');
            }
        });

        // 设置键盘导航
        setupKeyboardNavigation();

        // 清理 DOM 缓存
        window.addEventListener('beforeunload', () => {
            Utils.clearCache();
            if (appNavigator) appNavigator.destroy();
        });
    });

    // 全局错误处理
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        // 可以在这里添加错误上报逻辑
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
    });