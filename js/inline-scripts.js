// =====================================================
// MugenNewTab 内联脚本外置 - Manifest V3 CSP 兼容
// =====================================================

// 防止主题闪烁 - 在 CSS 渲染前执行
(function() {
    const savedTheme = localStorage.getItem('selectedTheme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        document.documentElement.setAttribute('data-theme-loading', 'true');
    }
    if (prefersDark && !savedTheme) {
        document.documentElement.classList.add('dark-mode-prefers');
    }
})();

// =====================================================
// DOM 加载完成后初始化
// =====================================================
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    initSearchEngine();
    initEventDelegation();
    initKeyboardShortcuts();
    initAppNavigator();
});

// 初始化搜索引擎
function initSearchEngine() {
    if (typeof searchEngines === 'undefined') return;
    
    try {
        const savedIndex = localStorage.getItem('selectedSearchEngine');
        if (savedIndex !== null) {
            const index = parseInt(savedIndex);
            if (index >= 0 && index < searchEngines.length) {
                window.currentSearchEngine = searchEngines[index];
                window.currentEngineIndex = index;
                
                // 更新显示
                const footerName = document.getElementById('footerEngineName');
                if (footerName) {
                    footerName.textContent = searchEngines[index].name;
                }
                console.log('已恢复保存的搜索引擎:', searchEngines[index].name);
            }
        }
    } catch (e) {
        console.error('加载保存的搜索引擎失败:', e);
    }
}

// 初始化主题
function initTheme() {
    if (typeof ThemeManager === 'undefined') return;
    
    const themeManager = new ThemeManager();
    const currentTheme = themeManager.getCurrentTheme();
    
    if (currentTheme && currentTheme.colors) {
        themeManager.applyTheme(currentTheme.id, false);
    }
    document.documentElement.removeAttribute('data-theme-loading');
}

// 初始化应用导航器
// 注：AppNavigator 实例由 app.js 创建，这里仅检查是否需要初始化
function initAppNavigator() {
    // AppNavigator 实例由 app.js 的 DOMContentLoaded 处理程序创建
    // 这里不执行任何操作，避免重复初始化
    console.log('initAppNavigator: 实例将由 app.js 创建');
}

// =====================================================
// 全局函数（供 HTML 内联调用，需改为外部定义）
// =====================================================

// 侧边栏
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!sidebar) return;
    
    const isActive = sidebar.classList.contains('active');
    if (isActive) {
        sidebar.classList.remove('active');
        overlay?.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.add('active');
        overlay?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.toggleSidebarCollapse = async function() {
    // 如果 AppNavigator 已加载，使用它的方法（支持 Chrome Storage）
    if (window.appNavigator) {
        await window.appNavigator.toggleSidebarCollapse();
        return;
    }
    
    // 否则使用本地实现（仅 localStorage）
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
    
    // 触发重绘以调整布局
    window.dispatchEvent(new Event('resize'));
};

// FAB 菜单
window.toggleFabMenu = function() {
    const fabMenu = document.getElementById('fabMenu');
    const fabMain = document.getElementById('fabMain');
    if (!fabMenu || !fabMain) return;
    
    const isActive = fabMenu.classList.contains('active');
    if (isActive) {
        fabMenu.classList.remove('active');
        fabMain.classList.remove('active');
        fabMain.setAttribute('aria-expanded', 'false');
    } else {
        fabMenu.classList.add('active');
        fabMain.classList.add('active');
        fabMain.setAttribute('aria-expanded', 'true');
    }
};

// 搜索模态框
window.openSearchModal = function() {
    const modal = document.getElementById('searchModal');
    const input = document.getElementById('searchInput');
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => input?.focus(), 100);
    renderSearchHistory();
};

window.closeSearchModal = function() {
    const modal = document.getElementById('searchModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = '';
};

window.toggleEngineDropdown = function(event) {
    event?.stopPropagation();
    const dropdown = document.getElementById('engineDropdown');
    if (!dropdown) return;
    
    const isActive = dropdown.classList.contains('active');
    if (isActive) {
        dropdown.classList.remove('active');
    } else {
        dropdown.classList.add('active');
        renderEngineList();
    }
};

// 应用模态框
window.openAddAppModal = async function(categoryId) {
    const modal = document.getElementById('appModal');
    const select = document.getElementById('appCategory');
    if (!modal) return;
    
    // 重置表单
    const modalTitle = document.getElementById('appModalTitle');
    if (modalTitle) modalTitle.textContent = '添加网站';
    document.getElementById('appName').value = '';
    document.getElementById('appUrl').value = '';
    document.getElementById('appDesc').value = '';
    document.getElementById('appIcon').value = '';
    updateIconPreview();
    
    if (window.appNavigator) {
        window.appNavigator.editingAppId = null;
    }
    
    // 加载分类选项
    await loadCategoryOptions(select, categoryId);
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.editApp = async function(appId) {
    if (!window.appNavigator) return;
    
    const data = await DataManager.getData();
    const app = data.apps.find(a => a.id === appId);
    if (!app) return;
    
    window.appNavigator.editingAppId = appId;
    const modalTitle = document.getElementById('appModalTitle');
    if (modalTitle) modalTitle.textContent = '编辑网站';
    document.getElementById('appName').value = app.name;
    document.getElementById('appUrl').value = app.url;
    document.getElementById('appDesc').value = app.description || '';
    document.getElementById('appIcon').value = app.icon || '';
    updateIconPreview();
    
    const select = document.getElementById('appCategory');
    await loadCategoryOptions(select, app.category);
    
    document.getElementById('appModal').classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.saveApp = async function() {
    const name = document.getElementById('appName')?.value.trim();
    const url = document.getElementById('appUrl')?.value.trim();
    const category = document.getElementById('appCategory')?.value;
    const description = document.getElementById('appDesc')?.value.trim();
    const icon = document.getElementById('appIcon')?.value.trim();

    if (!name || !url || !category) {
        showToast('请填写必填项', 'error');
        return;
    }

    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        finalUrl = 'https://' + url;
    }

    const appData = { name, url: finalUrl, category, description, icon };
    
    if (window.appNavigator?.editingAppId) {
        await DataManager.updateApp(window.appNavigator.editingAppId, appData);
        showToast('网站已更新');
    } else {
        await DataManager.addApp(appData);
        showToast('网站已添加');
    }

    closeModal('appModal');
    await window.appNavigator?.renderNavigation();
    await window.appNavigator?.renderApps();
};

window.deleteApp = async function(appId) {
    const confirmed = await showConfirm('确定要删除这个网站吗？', { isDanger: true, title: '删除网站' });
    if (!confirmed) return;
    await DataManager.deleteApp(appId);
    await window.appNavigator?.renderNavigation();
    await window.appNavigator?.renderApps();
    showToast('网站已删除');
};

// 分类模态框
window.openAddCategoryModal = function() {
    const modal = document.getElementById('categoryModal');
    if (!modal) return;
    
    const modalTitle = document.getElementById('categoryModalTitle');
    if (modalTitle) modalTitle.textContent = '添加分类';
    document.getElementById('catName').value = '';
    document.getElementById('catIcon').value = '';
    updateCatIconPreview();
    
    if (window.appNavigator) {
        window.appNavigator.editingCategoryId = null;
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.openManageCategoriesModal = async function() {
    await renderCategoriesList();
    document.getElementById('manageCategoriesModal')?.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.editCategory = async function(catId) {
    if (!window.appNavigator) return;
    
    const data = await DataManager.getData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat || cat.id === 'all') return;

    window.appNavigator.editingCategoryId = catId;
    const modalTitle = document.getElementById('categoryModalTitle');
    if (modalTitle) modalTitle.textContent = '编辑分类';
    document.getElementById('catName').value = cat.name;
    document.getElementById('catIcon').value = cat.icon || '';
    updateCatIconPreview();

    closeModal('manageCategoriesModal');
    document.getElementById('categoryModal').classList.add('active');
};

window.saveCategory = async function() {
    const name = document.getElementById('catName')?.value.trim();
    const icon = document.getElementById('catIcon')?.value.trim();

    if (!name) {
        showToast('请输入分类名称', 'error');
        return;
    }

    const catData = { name, icon: icon || './image/icons/folder.svg' };

    if (window.appNavigator?.editingCategoryId) {
        await DataManager.updateCategory(window.appNavigator.editingCategoryId, catData);
        showToast('分类已更新');
    } else {
        await DataManager.addCategory(catData);
        showToast('分类已添加');
    }

    closeModal('categoryModal');
    await window.appNavigator?.renderNavigation();
    await window.appNavigator?.renderApps();
};

window.deleteCategory = async function(catId) {
    if (catId === 'all') {
        showToast('不能删除默认分类', 'error');
        return;
    }
    
    const data = await DataManager.getData();
    const cat = data.categories.find(c => c.id === catId);
    const confirmed = await showConfirm(`确定要删除分类"${cat?.name || ''}"吗？该分类下的所有网站也会被删除。`, { isDanger: true, title: '删除分类' });
    if (!confirmed) return;

    await DataManager.deleteCategory(catId);
    if (window.appNavigator?.currentCategory === catId) {
        window.appNavigator.switchCategory('all');
    }
    await renderCategoriesList();
    await window.appNavigator?.renderNavigation();
    await window.appNavigator?.renderApps();
    showToast('分类已删除');
};

// UI 库模态框
window.openUiLib = function() {
    document.getElementById('uiLibModal')?.classList.add('active');
    renderUiLib();
};

window.openUiLibForCategory = function() {
    window.uiLibTarget = 'category';
    document.getElementById('uiLibModal')?.classList.add('active');
    renderUiLib();
};

window.closeUiLib = function() {
    document.getElementById('uiLibModal')?.classList.remove('active');
    window.uiLibTarget = null;
};

window.selectUiIcon = function(url) {
    if (window.uiLibTarget === 'category') {
        document.getElementById('catIcon').value = url;
        updateCatIconPreview();
    } else {
        document.getElementById('appIcon').value = url;
        updateIconPreview();
    }
    closeUiLib();
};

// 通用模态框操作
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('active');
    
    // 检查是否还有其他模态框打开
    const anyActive = document.querySelector('.modal-overlay.active');
    if (!anyActive) {
        document.body.style.overflow = '';
    }
};

// 数据导入导出
window.exportData = async function() {
    // 使用 DataManager.export() 获取完整数据（包含 apps、categories 和 uiLib）
    const exportData = await DataManager.export();
    if (!exportData || !exportData.data) return;
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mugennewtab_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出');
};

window.importData = function() {
    document.getElementById('importFile')?.click();
};

window.handleImport = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (data.categories && data.apps) {
            const confirmed = await showConfirm('导入将覆盖现有数据，是否继续？', { title: '导入数据', okText: '继续', isDanger: true });
            if (confirmed) {
                await DataManager.import(data);
                await window.appNavigator?.renderNavigation();
                await window.appNavigator?.renderApps();
                showToast('数据导入成功');
            }
        } else {
            showToast('无效的数据格式', 'error');
        }
    } catch (e) {
        showToast('导入失败：' + e.message, 'error');
    }
    
    event.target.value = '';
};

// 图标相关
window.updateIconPreview = function() {
    const iconInput = document.getElementById('appIcon');
    const icon = iconInput?.value || '';
    const preview = document.getElementById('iconPreview');
    if (!preview) return;
    
    if (icon.includes('.') || icon.startsWith('http')) {
        preview.innerHTML = `<img src="${icon}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.innerHTML='<img src=\'./image/icons/picture.svg\' width=\'28\' height=\'28\'>'">`;
    } else {
        preview.textContent = icon;
    }
};

window.updateCatIconPreview = function() {
    const iconInput = document.getElementById('catIcon');
    const icon = iconInput?.value || '';
    const preview = document.getElementById('catIconPreview');
    if (!preview) return;
    
    if (icon.includes('.') || icon.startsWith('http')) {
        preview.innerHTML = `<img src="${icon}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.innerHTML='<img src=\'./image/icons/folder.svg\' width=\'28\' height=\'28\'>'">`;
    } else {
        preview.textContent = icon;
    }
};

window.autoFetchIcon = async function() {
    const urlInput = document.getElementById('appUrl');
    const url = urlInput?.value;
    if (!url) {
        showToast('请先输入网站链接', 'error');
        return;
    }
    
    try {
        const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
        const faviconUrl = `https://favicon.im/${urlObj.hostname}`;
        
        document.getElementById('appIcon').value = faviconUrl;
        updateIconPreview();
        showToast('图标已自动获取');
    } catch (e) {
        showToast('无法获取图标', 'error');
    }
};

window.clearIcon = function() {
    document.getElementById('appIcon').value = '';
    updateIconPreview();
};

// 搜索功能
window.doSearch = function() {
    const input = document.getElementById('searchInput');
    const query = input?.value.trim();
    if (!query) return;
    
    const engine = window.currentSearchEngine || (typeof searchEngines !== 'undefined' ? searchEngines[0] : null);
    if (!engine) return;
    
    const searchUrl = engine.url.replace('{q}', encodeURIComponent(query));
    
    // 保存搜索历史
    saveSearchHistory(query);
    
    window.open(searchUrl, '_blank');
    closeSearchModal();
    input.value = '';
};

window.saveSearchHistory = function(query) {
    let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    history = history.filter(q => q !== query);
    history.unshift(query);
    if (history.length > 10) history = history.slice(0, 10);
    localStorage.setItem('searchHistory', JSON.stringify(history));
    window.searchHistory = history;
};

window.renderSearchHistory = function() {
    const container = document.getElementById('searchHistory');
    const listContainer = document.getElementById('historyList');
    if (!container || !listContainer) return;
    
    const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    window.searchHistory = history;
    
    if (history.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    listContainer.innerHTML = history.map((q, i) => `
        <div class="history-item" data-history-index="${i}">
            <span class="history-icon">🕐</span>
            <span class="history-text">${escapeHtml(q)}</span>
        </div>
    `).join('');
};

window.clearSearchHistory = function() {
    localStorage.removeItem('searchHistory');
    window.searchHistory = [];
    renderSearchHistory();
    showToast('搜索历史已清空');
};

window.selectEngine = async function(index) {
    if (typeof searchEngines === 'undefined') return;
    window.currentSearchEngine = searchEngines[index];
    window.currentEngineIndex = index;
    const dropdown = document.getElementById('engineDropdown');
    if (dropdown) dropdown.classList.remove('active');
    
    // 更新显示
    const wrapper = document.getElementById('engineSelectWrapper');
    const footerName = document.getElementById('footerEngineName');
    if (wrapper && searchEngines[index]) {
        wrapper.innerHTML = `<img src="${searchEngines[index].iconUrl}" alt="">`;
    }
    if (footerName && searchEngines[index]) {
        footerName.textContent = searchEngines[index].name;
    }
    
    // 保存到 localStorage
    try {
        localStorage.setItem('selectedSearchEngine', index);
    } catch (e) {
        console.error('保存搜索引擎失败:', e);
    }
};

window.renderEngineList = function() {
    const dropdown = document.getElementById('engineDropdown');
    if (!dropdown || typeof searchEngines === 'undefined') return;
    
    dropdown.innerHTML = searchEngines.map((engine, i) => `
        <div class="engine-option" data-engine-index="${i}">
            <img src="${engine.iconUrl}" alt="${engine.name}">
            <span>${engine.name}</span>
        </div>
    `).join('');
};

// 壁纸设置
window.togglePersonalizationPanel = function() {
    const panel = document.getElementById('personalizationPanel') || document.getElementById('personalizationDropdown');
    const overlay = document.getElementById('personalizationOverlay');
    const btn = document.getElementById('personalizationToggleBtn');
    
    if (!panel) return;
    
    const isActive = panel.classList.contains('show');
    if (isActive) {
        panel.classList.remove('show');
        overlay?.classList.remove('show');
        btn?.setAttribute('aria-expanded', 'false');
    } else {
        panel.classList.add('show');
        overlay?.classList.add('show');
        btn?.setAttribute('aria-expanded', 'true');
    }
};

window.updateWallpaper = function() {
    const url = document.getElementById('wallpaperUrl')?.value;
    if (!url) return;
    
    const bg = document.getElementById('wallpaperBackground');
    if (bg) bg.style.backgroundImage = `url(${url})`;
};

window.updateWallpaperSettings = function() {
    const opacity = document.getElementById('opacitySlider')?.value || 50;
    const blur = document.getElementById('blurSlider')?.value || 0;
    const overlay = document.getElementById('overlaySlider')?.value || 85;
    
    const bg = document.getElementById('wallpaperBackground');
    const overlayEl = document.getElementById('wallpaperOverlay');
    
    // 更新显示值
    const opacityValue = document.getElementById('opacityValue');
    const blurValue = document.getElementById('blurValue');
    const overlayValue = document.getElementById('overlayValue');
    
    if (opacityValue) opacityValue.textContent = opacity + '%';
    if (blurValue) blurValue.textContent = blur + 'px';
    if (overlayValue) overlayValue.textContent = overlay + '%';
    
    if (bg) {
        bg.style.opacity = opacity / 100;
        bg.style.filter = `blur(${blur}px)`;
    }
    if (overlayEl) {
        overlayEl.style.opacity = overlay / 100;
    }
};

window.resetWallpaper = function() {
    document.getElementById('wallpaperUrl').value = '';
    document.getElementById('opacitySlider').value = 50;
    document.getElementById('blurSlider').value = 0;
    document.getElementById('overlaySlider').value = 85;
    
    const bg = document.getElementById('wallpaperBackground');
    const overlay = document.getElementById('wallpaperOverlay');
    
    if (bg) {
        bg.style.backgroundImage = '';
        bg.style.opacity = 0.5;
        bg.style.filter = 'blur(0px)';
    }
    if (overlay) overlay.style.opacity = 0.85;
    
    // 更新显示值
    const opacityValue = document.getElementById('opacityValue');
    const blurValue = document.getElementById('blurValue');
    const overlayValue = document.getElementById('overlayValue');
    
    if (opacityValue) opacityValue.textContent = '50%';
    if (blurValue) blurValue.textContent = '0px';
    if (overlayValue) overlayValue.textContent = '85%';
};

window.saveWallpaperSettings = function() {
    const settings = {
        url: document.getElementById('wallpaperUrl')?.value,
        opacity: document.getElementById('opacitySlider')?.value,
        blur: document.getElementById('blurSlider')?.value,
        overlay: document.getElementById('overlaySlider')?.value
    };
    
    localStorage.setItem('wallpaperSettings', JSON.stringify(settings));
    showToast('壁纸设置已保存');
};

// UI 库管理
window.openUiLibManager = async function() {
    // 关闭其他模态框
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    
    // 打开 UI 库管理模态框
    const modal = document.getElementById('uiLibManagerModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // 如果有 renderUiLibManager 函数，调用它来渲染列表
        if (typeof renderUiLibManager === 'function') {
            await renderUiLibManager();
        }
    }
};

window.switchUiTab = function(tab, btn) {
    // 移除所有 active 类
    document.querySelectorAll('#uiLibManagerModal .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#uiLibManagerModal .tab-content').forEach(c => c.style.display = 'none');
    
    // 添加 active 类
    if (btn) btn.classList.add('active');
    const content = document.getElementById('uiTab' + (tab === 'categories' ? 'Categories' : 'Items'));
    if (content) content.style.display = 'block';
};

window.switchUiLibTab = async function(catId) {
    document.querySelectorAll('.ui-lib-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-cat-id="${catId}"]`)?.classList.add('active');
    if (typeof renderUiLibItems === 'function') {
        await renderUiLibItems(catId);
    }
};

// =====================================================
// 辅助函数
// =====================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 美化的确认对话框（替代原生 confirm）
let confirmResolve = null;

window.showConfirm = async function(message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const messageEl = document.getElementById('confirmModalMessage');
        const titleEl = document.getElementById('confirmModalTitle');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const iconEl = modal.querySelector('.confirm-icon');
        
        if (!modal || !messageEl) {
            // 如果模态桃不存在，回退到原生 confirm
            resolve(confirm(message));
            return;
        }
        
        // 设置内容
        messageEl.textContent = message;
        titleEl.textContent = options.title || '提示';
        
        // 设置按钮文字
        okBtn.textContent = options.okText || '确定';
        cancelBtn.textContent = options.cancelText || '取消';
        
        // 设置按钮样式（危险操作 vs 普通操作）
        if (options.isDanger) {
            okBtn.classList.remove('confirm-ok-btn-primary');
            // 使用 error 颜色变量
            iconEl.style.background = 'var(--md-sys-color-error-container, rgba(186, 26, 26, 0.12))';
            iconEl.style.color = 'var(--md-sys-color-error, #BA1A1A)';
            // 使用警告图标
            iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>`;
        } else {
            okBtn.classList.add('confirm-ok-btn-primary');
            // 使用 primary 颜色变量
            iconEl.style.background = 'var(--md-sys-color-primary-container, rgba(177, 74, 107, 0.12))';
            iconEl.style.color = 'var(--md-sys-color-primary, #B14A6B)';
            // 使用问号图标
            iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>`;
        }
        
        // 显示模态桃
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // 定义处理函数
        const handleOk = () => {
            cleanup();
            resolve(true);
        };
        
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                resolve(false);
            } else if (e.key === 'Enter') {
                cleanup();
                resolve(true);
            }
        };
        
        const handleOverlayClick = (e) => {
            if (e.target === modal) {
                cleanup();
                resolve(false);
            }
        };
        
        // 清理函数
        const cleanup = () => {
            modal.classList.remove('active');
            const anyActive = document.querySelector('.modal-overlay.active');
            if (!anyActive) {
                document.body.style.overflow = '';
            }
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleOverlayClick);
            document.removeEventListener('keydown', handleKeydown);
        };
        
        // 绑定事件
        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleOverlayClick);
        document.addEventListener('keydown', handleKeydown);
    });
}

window.closeConfirmModal = function() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.classList.remove('active');
        const anyActive = document.querySelector('.modal-overlay.active');
        if (!anyActive) {
            document.body.style.overflow = '';
        }
    }
}

function showToast(message, type = 'success') {
    // 复用 index.html 中的 showToast 或创建新的
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        window.showToast(message, type);
        return;
    }
    
    const existing = document.getElementById('toast');
    if (existing) {
        existing.textContent = message;
        existing.className = `toast ${type} show`;
        setTimeout(() => existing.classList.remove('show'), 3000);
    }
}

async function loadCategoryOptions(select, selectedId) {
    if (!select) return;
    
    const data = await DataManager.getData();
    const categories = data.categories.filter(c => c.id !== 'all');
    select.innerHTML = categories.map(c => 
        `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');
}

async function renderCategoriesList() {
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    const data = await DataManager.getData();
    container.innerHTML = data.categories
        .filter(c => c.id !== 'all')
        .map(cat => {
            const count = data.apps.filter(a => a.category === cat.id).length;
            const isImage = cat.icon && (cat.icon.includes('.') || cat.icon.startsWith('http'));
            const iconHtml = isImage 
                ? `<img src="${cat.icon}" style="width:24px;height:24px;" onerror="this.style.display='none';this.parentElement.innerHTML='<img src=\'./image/icons/folder.svg\' width=\'24\' height=\'24\'>'">`
                : (cat.icon || '<img src=\'./image/icons/folder.svg\' width=\'24\' height=\'24\'>');
            
            return `
                <div class="category-item">
                    <div class="category-info">
                        <span class="category-icon">${iconHtml}</span>
                        <span class="category-name">${escapeHtml(cat.name)}</span>
                        <span class="category-count">${count} 个应用</span>
                    </div>
                    <div class="category-actions">
                        <button class="app-action-btn" data-action="edit-cat" data-cat-id="${cat.id}" title="编辑">✏️</button>
                        <button class="app-action-btn delete" data-action="delete-cat" data-cat-id="${cat.id}" title="删除">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
}

function renderUiLib(category) {
    // 简化实现，完整实现需要更多代码
    const container = document.getElementById('uiLibGrid');
    if (!container) return;
    
    container.innerHTML = '<div class="empty-state">UI库加载中...</div>';
}

// =====================================================
// 事件委托处理 (data-action)
// =====================================================

function initEventDelegation() {
    document.addEventListener('click', function(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        handleDataAction(action, target, e);
    });
    
    // 处理 change 事件
    document.addEventListener('change', function(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        if (action === 'update-wallpaper' || action === 'handle-import') {
            handleDataAction(action, target, e);
        }
    });
    
    // 处理 input 事件
    document.addEventListener('input', function(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        if (action === 'update-settings' || action === 'preview-icon' || action === 'preview-cat-icon') {
            handleDataAction(action, target, e);
        }
    });
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', function(e) {
        const wrapper = document.getElementById('engineSelectWrapper');
        const dropdown = document.getElementById('engineDropdown');
        if (wrapper && dropdown && !wrapper.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
    
    // 历史记录项点击
    document.addEventListener('click', function(e) {
        const item = e.target.closest('[data-history-index]');
        if (item) {
            const index = parseInt(item.dataset.historyIndex);
            const query = window.searchHistory?.[index];
            const input = document.getElementById('searchInput');
            if (query && input) {
                input.value = query;
                doSearch();
            }
        }
    });
    
    // 搜索引擎选项点击
    document.addEventListener('click', function(e) {
        const option = e.target.closest('[data-engine-index]');
        if (option) {
            selectEngine(parseInt(option.dataset.engineIndex));
        }
    });
    
    // 分类编辑/删除
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-action="edit-cat"], [data-action="delete-cat"]');
        if (btn) {
            const catId = btn.dataset.catId;
            if (btn.dataset.action === 'edit-cat') {
                editCategory(catId);
            } else {
                deleteCategory(catId);
            }
        }
    });
}

async function handleDataAction(action, element, event) {
    switch (action) {
        // 搜索
        case 'search':
            event.preventDefault();
            doSearch();
            break;
        case 'close-search':
            closeSearchModal();
            break;
        case 'clear-history':
            clearSearchHistory();
            break;
        case 'open-search':
            openSearchModal();
            break;
        case 'toggle-engine':
            toggleEngineDropdown(event);
            break;
            
        // 侧边栏
        case 'toggle-sidebar':
            toggleSidebar();
            break;
        case 'toggle-collapse':
            toggleSidebarCollapse();
            break;
            
        // 个性化
        case 'toggle-panel':
            togglePersonalizationPanel();
            break;
        case 'update-wallpaper':
            updateWallpaper();
            break;
        case 'update-settings':
            updateWallpaperSettings();
            break;
        case 'reset-wallpaper':
            resetWallpaper();
            break;
        case 'save-wallpaper':
            saveWallpaperSettings();
            break;
            
        // FAB
        case 'toggle-fab':
            toggleFabMenu();
            break;
        case 'open-add-app':
            openAddAppModal();
            break;
        case 'open-add-cat':
            openAddCategoryModal();
            break;
        case 'manage-cats':
            openManageCategoriesModal();
            break;
        case 'open-uilib-manager':
            if (typeof openUiLibManager === 'function') openUiLibManager();
            else showToast('图标库功能加载中...');
            break;
        case 'export':
            exportData();
            break;
        case 'import':
            importData();
            break;
            
        // 模态框
        case 'close-modal':
            const modalId = element.dataset.modal;
            if (modalId) closeModal(modalId);
            break;
            
        // 应用操作
        case 'save-app':
            saveApp();
            break;
        case 'save-cat':
            saveCategory();
            break;
        case 'auto-icon':
            // URL 输入框失去焦点时自动获取图标
            if (typeof autoFetchIcon === 'function') autoFetchIcon();
            break;
        case 'preview-icon':
            updateIconPreview();
            break;
        case 'preview-cat-icon':
            updateCatIconPreview();
            break;
        case 'open-uilib':
            openUiLib();
            break;
        case 'open-uilib-cat':
            openUiLibForCategory();
            break;
        case 'fetch-icon':
            autoFetchIcon();
            break;
        case 'clear-icon':
            clearIcon();
            break;
            
        // UI 库
        case 'close-uilib':
            closeUiLib();
            break;
        case 'open-uilib-manager':
            openUiLibManager();
            break;
        case 'switch-tab-cats':
            switchUiTab('categories', element);
            break;
        case 'switch-tab-items':
            switchUiTab('items', element);
            break;
        case 'add-ui-cat':
            if (typeof addUiCategory === 'function') addUiCategory();
            break;
        case 'add-ui-item':
            if (typeof addUiItem === 'function') addUiItem();
            break;
            
        // 导入
        case 'handle-import':
            handleImport(event);
            break;
        case 'close-and-add-cat':
            closeModal('manageCategoriesModal');
            openAddCategoryModal();
            break;
            
        // 主题选择
        case 'select-theme':
            const themeId = element.dataset.themeId;
            if (themeId && typeof ThemeManager !== 'undefined') {
                const themeManager = new ThemeManager();
                themeManager.applyTheme(themeId);
                
                // 触发 themeChanged 事件以更新 Logo 等
                document.dispatchEvent(new CustomEvent('themeChanged', { detail: { themeId } }));
                
                // 更新主题选项 UI
                document.querySelectorAll('.theme-option').forEach(opt => {
                    const isSelected = opt.dataset.themeId === themeId;
                    opt.classList.toggle('active', isSelected);
                    opt.setAttribute('aria-checked', isSelected);
                });
                
                // 检测并更新深色模式
                if (typeof detectDarkMode === 'function') {
                    requestAnimationFrame(detectDarkMode);
                } else {
                    // 简单判断：如果背景色较暗，添加 dark-mode 类
                    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-background').trim();
                    const r = parseInt(bgColor.slice(1, 3), 16);
                    const g = parseInt(bgColor.slice(3, 5), 16);
                    const b = parseInt(bgColor.slice(5, 7), 16);
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    document.body.classList.toggle('dark-mode', brightness < 128);
                }
                
                // 显示提示
                const themeName = typeof themeConfig !== 'undefined' ? 
                    themeConfig.themes.find(t => t.id === themeId)?.name : themeId;
                showToast(`已切换到 ${themeName}`);
            }
            break;
            
        // 应用卡片操作
        case 'edit-app':
            const editAppId = element.dataset.appId;
            if (editAppId) editApp(editAppId);
            break;
        case 'delete-app':
            const deleteAppId = element.dataset.appId;
            if (deleteAppId) deleteApp(deleteAppId);
            break;
        case 'open-add-app':
            const catId = element.dataset.category;
            openAddAppModal(catId);
            break;
            
        // 搜索历史
        case 'use-history':
            const historyIdx = element.dataset.historyIndex;
            const query = window.searchHistory?.[historyIdx];
            const input = document.getElementById('searchInput');
            if (query && input) {
                input.value = query;
                doSearch();
            }
            break;
            
        // 搜索引擎
        case 'select-engine':
            const engineIdx = element.dataset.engineIndex;
            if (engineIdx) selectEngine(parseInt(engineIdx));
            break;
            
        // UI 库
        case 'switch-uilib-tab':
            const uiCatId = element.dataset.catId;
            if (uiCatId && typeof switchUiLibTab === 'function') switchUiLibTab(uiCatId);
            break;
        case 'select-uilib-icon':
            const iconUrl = element.dataset.icon;
            if (iconUrl && typeof selectUiIcon === 'function') selectUiIcon(iconUrl);
            break;
        case 'delete-ui-cat':
            const delUiCatId = element.dataset.catId;
            if (delUiCatId && typeof deleteUiCategory === 'function') deleteUiCategory(delUiCatId);
            break;
        case 'delete-ui-item':
            const itemId = element.dataset.itemId;
            if (itemId && typeof deleteUiItem === 'function') deleteUiItem(itemId);
            break;
    }
}

// =====================================================
// 键盘快捷键
// =====================================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K 打开搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            openSearchModal();
        }
        
        // ESC 关闭模态框
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay.active');
            if (modals.length > 0) {
                modals[modals.length - 1].classList.remove('active');
                if (document.querySelectorAll('.modal-overlay.active').length === 0) {
                    document.body.style.overflow = '';
                }
            }
        }
        
        // Enter 在搜索框中执行搜索
        if (e.key === 'Enter' && document.activeElement?.id === 'searchInput') {
            doSearch();
        }
        
        // 处理 data-keydown-action
        if (e.key === 'Enter' || e.key === ' ') {
            const target = document.activeElement?.closest('[data-keydown-action]');
            if (target) {
                const action = target.dataset.keydownAction;
                const themeId = target.dataset.themeId;
                const icon = target.dataset.icon;
                
                if (action === 'select-theme' && themeId && typeof ThemeManager !== 'undefined') {
                    e.preventDefault();
                    const themeManager = new ThemeManager();
                    themeManager.applyTheme(themeId);
                } else if (action === 'use-history') {
                    e.preventDefault();
                    const idx = target.dataset.historyIndex;
                    const q = window.searchHistory?.[idx];
                    const input = document.getElementById('searchInput');
                    if (q && input) {
                        input.value = q;
                        doSearch();
                    }
                } else if (action === 'select-uilib-icon' && icon && typeof selectUiIcon === 'function') {
                    e.preventDefault();
                    selectUiIcon(icon);
                }
            }
        }
    });
}
