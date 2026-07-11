// ==================== 云同步管理器（GitHub Gist）====================
const CloudSyncManager = {
    SYNC_FILE_NAME: 'mugen-newtab-sync.json',
    GIST_DESCRIPTION: 'MugenNewTab 导航数据云同步备份',
    STORAGE_KEYS: {
        token: 'appNavigator_cloudSync_token',
        gistId: 'appNavigator_cloudSync_gistId',
        autoSync: 'appNavigator_cloudSync_autoSync',
        lastSyncTime: 'appNavigator_cloudSync_lastSyncTime',
        userInfo: 'appNavigator_cloudSync_userInfo'
    },

    _token: null,
    _gistId: null,
    _autoSync: false,
    _lastSyncTime: 0,
    _userInfo: null,
    _autoSyncTimer: null,
    _syncInProgress: false,

    // 需要同步的本地存储键
    SYNC_DATA_KEYS: [
        'appNavigator_data',
        'appNavigator_user_uiLib',
        'appNavigator_wallpaper',
        'appNavigator_wallpaper_image',
        'selectedTheme',
        'sidebarCollapsed',
        'searchHistory',
        'selectedSearchEngine',
        'appNavigator_showHiddenApps',
        'appNavigator_hiddenTipDismissed',
        'appNavigator_dataUpdatedAt'
    ],

    async init() {
        await this._loadSettings();
        this.renderStatus();

        if (this._token) {
            this.validateToken().then(valid => {
                if (valid) {
                    this._maybePullOnStartup();
                }
            });
        }
    },

    async _loadSettings() {
        this._token = await StorageManager.get(this.STORAGE_KEYS.token);
        this._gistId = await StorageManager.get(this.STORAGE_KEYS.gistId);
        this._autoSync = await StorageManager.get(this.STORAGE_KEYS.autoSync) || false;
        this._lastSyncTime = await StorageManager.get(this.STORAGE_KEYS.lastSyncTime) || 0;
        this._userInfo = await StorageManager.get(this.STORAGE_KEYS.userInfo);
    },

    async _saveSettings() {
        await StorageManager.set(this.STORAGE_KEYS.token, this._token);
        await StorageManager.set(this.STORAGE_KEYS.gistId, this._gistId);
        await StorageManager.set(this.STORAGE_KEYS.autoSync, this._autoSync);
        await StorageManager.set(this.STORAGE_KEYS.lastSyncTime, this._lastSyncTime);
        await StorageManager.set(this.STORAGE_KEYS.userInfo, this._userInfo);
    },

    // 验证 GitHub Token 是否有效
    async validateToken(token = this._token) {
        if (!token) return false;
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: this._authHeaders(token)
            });
            if (response.status === 200) {
                const user = await response.json();
                this._userInfo = { login: user.login, id: user.id, avatar: user.avatar_url };
                if (token !== this._token) {
                    this._token = token;
                    await this._saveSettings();
                } else {
                    await StorageManager.set(this.STORAGE_KEYS.userInfo, this._userInfo);
                }
                return true;
            }
            return false;
        } catch (e) {
            console.error('[CloudSync] validateToken error:', e);
            return false;
        }
    },

    _authHeaders(token) {
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        };
    },

    // 查找或创建同步用的 Gist
    async findOrCreateGist() {
        if (this._gistId) {
            try {
                const gist = await this._getGist(this._gistId);
                if (gist && gist.files[this.SYNC_FILE_NAME]) {
                    return this._gistId;
                }
            } catch (e) {
                console.warn('[CloudSync] stored gist not found, creating new one');
            }
        }

        // 查找已有同步 Gist
        const gists = await this._listGists();
        const existing = gists.find(g => g.files[this.SYNC_FILE_NAME]);
        if (existing) {
            this._gistId = existing.id;
            await StorageManager.set(this.STORAGE_KEYS.gistId, this._gistId);
            return this._gistId;
        }

        // 创建新 Gist
        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: this._authHeaders(this._token),
            body: JSON.stringify({
                description: this.GIST_DESCRIPTION,
                public: false,
                files: {
                    [this.SYNC_FILE_NAME]: {
                        content: JSON.stringify(this._createEmptySyncData(), null, 2)
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error(`创建 Gist 失败: ${response.status} ${response.statusText}`);
        }

        const gist = await response.json();
        this._gistId = gist.id;
        await StorageManager.set(this.STORAGE_KEYS.gistId, this._gistId);
        return this._gistId;
    },

    async _listGists() {
        const response = await fetch('https://api.github.com/gists?per_page=100', {
            headers: this._authHeaders(this._token)
        });
        if (!response.ok) {
            throw new Error(`获取 Gist 列表失败: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    },

    async _getGist(gistId) {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: this._authHeaders(this._token)
        });
        if (!response.ok) {
            throw new Error(`获取 Gist 失败: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    },

    _createEmptySyncData() {
        return {
            version: '1.0',
            lastModified: Date.now(),
            device: this._getDeviceName(),
            data: {}
        };
    },

    _getDeviceName() {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edg')) return 'Edge';
        return 'Browser';
    },

    // 收集本地所有需要同步的数据
    async _collectLocalData() {
        await DataManager.syncNow();
        const data = {};
        for (const key of this.SYNC_DATA_KEYS) {
            data[key] = await StorageManager.get(key);
        }
        return {
            version: '1.0',
            lastModified: Date.now(),
            device: this._getDeviceName(),
            data
        };
    },

    // 上传本地数据到 Gist
    async upload({ silent = false } = {}) {
        if (this._syncInProgress) return { success: false, message: '同步进行中' };
        if (!this._token) return { success: false, message: '请先配置 GitHub Token' };

        this._syncInProgress = true;
        try {
            const gistId = await this.findOrCreateGist();
            const syncData = await this._collectLocalData();

            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: this._authHeaders(this._token),
                body: JSON.stringify({
                    files: {
                        [this.SYNC_FILE_NAME]: {
                            content: JSON.stringify(syncData, null, 2)
                        }
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `上传失败: ${response.status}`);
            }

            this._lastSyncTime = syncData.lastModified;
            await StorageManager.set(this.STORAGE_KEYS.lastSyncTime, this._lastSyncTime);
            this.renderStatus();

            if (!silent) showToast('数据已同步到 GitHub Gist');
            return { success: true, time: this._lastSyncTime };
        } catch (e) {
            console.error('[CloudSync] upload error:', e);
            if (!silent) showToast('同步失败：' + e.message, 'error');
            return { success: false, message: e.message };
        } finally {
            this._syncInProgress = false;
        }
    },

    // 从 Gist 下载数据
    async download() {
        if (this._syncInProgress) return { success: false, message: '同步进行中' };
        if (!this._token) return { success: false, message: '请先配置 GitHub Token' };

        this._syncInProgress = true;
        try {
            const gistId = await this.findOrCreateGist();
            const gist = await this._getGist(gistId);
            const file = gist.files[this.SYNC_FILE_NAME];
            if (!file) {
                throw new Error('同步文件不存在');
            }

            const content = file.content || await this._fetchRawContent(file.raw_url);
            const syncData = JSON.parse(content);

            this._syncInProgress = false;
            return { success: true, data: syncData };
        } catch (e) {
            console.error('[CloudSync] download error:', e);
            this._syncInProgress = false;
            return { success: false, message: e.message };
        }
    },

    async _fetchRawContent(rawUrl) {
        const response = await fetch(rawUrl, {
            headers: this._authHeaders(this._token)
        });
        if (!response.ok) {
            throw new Error(`获取文件内容失败: ${response.status}`);
        }
        return await response.text();
    },

    // 将云端数据应用到本地
    async applyDownloadedData(syncData) {
        if (!syncData || !syncData.data) return false;

        const snapshot = {};
        for (const key of this.SYNC_DATA_KEYS) {
            if (Object.prototype.hasOwnProperty.call(syncData.data, key)) {
                snapshot[key] = syncData.data[key];
            }
        }
        await DataManager.applyStorageSnapshot(snapshot);

        this._lastSyncTime = syncData.lastModified || Date.now();
        await StorageManager.set(this.STORAGE_KEYS.lastSyncTime, this._lastSyncTime);

        return true;
    },

    // 拉取并应用（带冲突检测）
    // force=true：用户主动点击"恢复云端"，直接恢复（仅二次确认）
    // force=false：自动拉取，仅在云端确实更新时提示
    async pullAndApply({ force = false, silent = false } = {}) {
        if (!this._token) {
            if (!silent) showToast('请先配置 GitHub Token', 'error');
            return { success: false };
        }

        const result = await this.download();
        if (!result.success) {
            if (!silent) showToast('拉取失败：' + result.message, 'error');
            return result;
        }

        const remote = result.data;
        const remoteTime = new Date(remote.lastModified).toLocaleString();
        const localSyncTime = this._lastSyncTime
            ? new Date(this._lastSyncTime).toLocaleString()
            : '从未上传';

        if (!force) {
            // 自动场景：仅当云端确实比上次上传更新时才提示
            const TIME_BUFFER = 5000;
            const remoteNewer = remote.lastModified > (this._lastSyncTime || 0) + TIME_BUFFER;
            if (!remoteNewer) {
                // 云端没有新数据，静默跳过
                return { success: true, applied: false, message: '本地数据已是最新' };
            }

            const confirmed = await showConfirm(
                `检测到云端数据更新（云端 ${remoteTime}，本地上次上传 ${localSyncTime}），是否用云端数据覆盖本地？`,
                { title: '恢复云端数据', okText: '覆盖本地', isDanger: true }
            );
            if (!confirmed) return { success: true, applied: false, message: '用户取消' };
        } else {
            // 用户主动恢复：显示信息并二次确认
            const confirmed = await showConfirm(
                `将用云端数据覆盖本地（云端更新时间：${remoteTime}），此操作不可撤销，是否继续？`,
                { title: '恢复云端数据', okText: '覆盖本地', isDanger: true }
            );
            if (!confirmed) return { success: true, applied: false, message: '用户取消' };
        }

        await this.applyDownloadedData(remote);

        // 刷新 UI
        await this._refreshUI();

        this.renderStatus();
        if (!silent) showToast('已从云端恢复数据');
        return { success: true, applied: true };
    },

    // 刷新主题、壁纸和应用界面
    async _refreshUI() {
        if (typeof window.appNavigator?.renderNavigation === 'function') {
            await window.appNavigator.renderNavigation();
        }
        if (typeof window.appNavigator?.renderApps === 'function') {
            await window.appNavigator.renderApps();
        }

        const themeId = await StorageManager.get('selectedTheme') || themeConfig?.defaultTheme || 'material-rose';
        if (themeId && typeof ThemeManager !== 'undefined') {
            const themeManager = new ThemeManager();
            themeManager.applyTheme(themeId);
            document.dispatchEvent(new CustomEvent('themeChanged', { detail: { themeId } }));
            if (typeof detectDarkMode === 'function') {
                requestAnimationFrame(detectDarkMode);
            }
        }

        if (window.wallpaperManager && typeof window.wallpaperManager.loadSavedWallpaper === 'function') {
            await window.wallpaperManager.loadSavedWallpaper();
        }
    },

    // 启动时自动拉取（仅当远程更新时提示）
    async _maybePullOnStartup() {
        if (!this._token || !this._autoSync) return;

        const result = await this.download();
        if (!result.success) return;

        const remote = result.data;
        const TIME_BUFFER = 5000;

        // 用上次上传时间比较，而不是当前时间
        if (remote.lastModified > (this._lastSyncTime || 0) + TIME_BUFFER) {
            const remoteTime = new Date(remote.lastModified).toLocaleString();
            const confirmed = await showConfirm(
                `检测到其他设备上的更新（${remoteTime}），是否恢复到本地？`,
                { title: '发现云端更新', okText: '恢复', isDanger: false }
            );
            if (confirmed) {
                await this.applyDownloadedData(remote);
                await this._refreshUI();
                showToast('已从云端恢复数据');
            }
        }

        this.renderStatus();
    },

    // 保存 Token
    async saveToken(token) {
        token = token.trim();
        if (!token) {
            showToast('请输入 GitHub Token', 'error');
            return false;
        }

        showToast('正在验证 Token...');
        const valid = await this.validateToken(token);
        if (!valid) {
            showToast('Token 验证失败，请检查是否有效', 'error');
            return false;
        }

        await this._saveSettings();
        await this.findOrCreateGist();
        this.renderStatus();
        showToast('GitHub 账号已连接');
        return true;
    },

    // 退出登录
    async logout() {
        const confirmed = await showConfirm('确定要断开 GitHub 云同步吗？本地数据不会删除。', {
            title: '断开同步',
            okText: '断开',
            isDanger: true
        });
        if (!confirmed) return;

        this._token = null;
        this._gistId = null;
        this._userInfo = null;
        this._lastSyncTime = 0;
        await this._saveSettings();
        this.renderStatus();
        showToast('已断开云同步');
    },

    // 切换自动同步
    async setAutoSync(enabled) {
        this._autoSync = !!enabled;
        await StorageManager.set(this.STORAGE_KEYS.autoSync, this._autoSync);
        this.renderStatus();
    },

    // 触发自动同步（防抖）
    scheduleAutoSync() {
        if (!this._autoSync || !this._token) return;

        if (this._autoSyncTimer) {
            clearTimeout(this._autoSyncTimer);
        }

        this._autoSyncTimer = setTimeout(() => {
            this.upload({ silent: true }).then(result => {
                if (result.success) {
                    console.log('[CloudSync] auto sync completed');
                }
            });
        }, 3000);
    },

    // 渲染同步状态 UI
    renderStatus() {
        const container = document.getElementById('cloudSyncStatus');
        if (!container) return;

        if (!this._token) {
            container.innerHTML = `
                <div class="cloud-sync-not-logged">
                    <div class="cloud-sync-hint">使用 GitHub Gist 备份和同步你的数据</div>
                    <button class="wallpaper-btn wallpaper-btn-primary" data-action="cloud-sync-login" style="width: 100%; margin-top: 8px;">
                        🔗 连接 GitHub
                    </button>
                </div>
            `;
            return;
        }

        const userName = this._userInfo?.login || 'GitHub 用户';
        const avatar = this._userInfo?.avatar || '';
        const syncTimeText = this._lastSyncTime ? Utils.formatTime(this._lastSyncTime) : '从未同步';
        const autoSyncChecked = this._autoSync ? 'checked' : '';

        container.innerHTML = `
            <div class="cloud-sync-logged">
                <div class="cloud-sync-user">
                    ${avatar ? `<img src="${Utils.escapeHtml(avatar)}" alt="" class="cloud-sync-avatar">` : ''}
                    <div class="cloud-sync-user-info">
                        <div class="cloud-sync-user-name">${Utils.escapeHtml(userName)}</div>
                        <div class="cloud-sync-last-time">上次同步：${Utils.escapeHtml(syncTimeText)}</div>
                    </div>
                </div>
                <label class="cloud-sync-toggle">
                    <input type="checkbox" data-action="cloud-sync-toggle-auto" ${autoSyncChecked}>
                    <span>自动同步</span>
                </label>
                <div class="cloud-sync-actions">
                    <button class="wallpaper-btn wallpaper-btn-primary" data-action="cloud-sync-upload">⬆️ 立即上传</button>
                    <button class="wallpaper-btn wallpaper-btn-secondary" data-action="cloud-sync-download">⬇️ 恢复云端</button>
                </div>
                <button class="cloud-sync-logout" data-action="cloud-sync-logout">断开连接</button>
            </div>
        `;
    },

    // 打开 Token 输入对话框
    async showLoginDialog() {
        const token = await showPrompt(
            '请输入 GitHub Personal Access Token（需要 gist 权限）',
            {
                title: '连接 GitHub',
                confirmText: '连接',
                cancelText: '取消',
                inputPlaceholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
                inputType: 'password'
            }
        );
        if (token) {
            await this.saveToken(token);
        }
    }
};

// 云同步相关操作挂载到 window 供事件委托调用
window.CloudSyncManager = CloudSyncManager;

window.cloudSyncLogin = function() {
    CloudSyncManager.showLoginDialog();
};

window.cloudSyncUpload = function() {
    CloudSyncManager.upload();
};

window.cloudSyncDownload = function() {
    CloudSyncManager.pullAndApply({ force: true });
};

window.cloudSyncLogout = function() {
    CloudSyncManager.logout();
};

window.cloudSyncToggleAuto = function(element) {
    CloudSyncManager.setAutoSync(element.checked);
};

// 页面加载完成后初始化云同步
document.addEventListener('DOMContentLoaded', () => {
    if (typeof CloudSyncManager !== 'undefined') {
        CloudSyncManager.init().catch(e => {
            console.error('[CloudSync] init failed:', e);
        });
    }
});
