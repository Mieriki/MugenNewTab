// Popup 脚本 - 独立的 JS 文件，避免 CSP 问题

console.log('=== POPUP 脚本开始加载 ===');
console.log('chrome 对象:', typeof chrome !== 'undefined' ? '存在' : '不存在');
console.log('chrome.tabs:', typeof chrome !== 'undefined' && chrome.tabs ? '存在' : '不存在');
console.log('chrome.storage:', typeof chrome !== 'undefined' && chrome.storage ? '存在' : '不存在');

// 检查当前环境
if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        console.log('同步查询结果:', tabs);
        if (chrome.runtime.lastError) {
            console.error('Chrome API 错误:', chrome.runtime.lastError);
        }
    });
}

console.log('ExtensionStorage 加载后 - DataManager:', typeof DataManager !== 'undefined' ? '存在' : '不存在');

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('=== DOMContentLoaded 触发 ===');
    
    try {
        // 确保 DataManager 已初始化
        if (typeof DataManager !== 'undefined' && DataManager.init) {
            console.log('等待 DataManager 初始化...');
            await DataManager.init();
            console.log('DataManager 就绪');
        }
        
        await loadCategories();
        await tryGetCurrentTabInfo();
        setupEventListeners();
        
        console.log('=== Popup 初始化完成 ===');
    } catch (error) {
        console.error('初始化失败:', error);
        const select = document.getElementById('appCategory');
        if (select) {
            select.innerHTML = '<option value="">加载失败，请刷新</option>';
        }
    }
});

// 加载分类列表
async function loadCategories() {
    try {
        console.log('开始加载分类...');
        
        if (typeof DataManager === 'undefined') {
            throw new Error('DataManager 未定义');
        }
        
        const data = await DataManager.getData();
        console.log('获取到数据:', data);
        
        const select = document.getElementById('appCategory');
        if (!select) {
            throw new Error('分类选择框未找到');
        }
        
        // 清空并添加默认选项
        select.innerHTML = '<option value="">选择分类...</option>';
        
        if (!data || !data.categories) {
            throw new Error('数据格式错误');
        }
        
        const categories = data.categories.filter(c => c.id !== 'all');
        
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
        
        // 添加新建分类选项
        const newOption = document.createElement('option');
        newOption.value = '__new__';
        newOption.textContent = '+ 新建分类';
        select.appendChild(newOption);
        
        console.log('分类加载完成:', categories.length, '个分类');
    } catch (error) {
        console.error('加载分类失败:', error);
        const select = document.getElementById('appCategory');
        if (select) {
            select.innerHTML = '<option value="">加载失败</option>';
        }
    }
}

function toggleNewCategoryInput(show) {
    const group = document.getElementById('newCategoryGroup');
    const input = document.getElementById('newCategoryName');
    if (group) group.style.display = show ? 'block' : 'none';
    if (show && input) {
        input.value = '';
        input.focus();
    }
}

// 尝试获取当前标签页信息
async function tryGetCurrentTabInfo() {
    console.log('尝试获取当前标签页...');
    
    // 检查 chrome API
    if (typeof chrome === 'undefined') {
        console.error('chrome 对象不存在！');
        return;
    }
    if (!chrome.tabs) {
        console.error('chrome.tabs 不存在！可能缺少 tabs 权限');
        return;
    }
    
    // 使用回调方式（更可靠）
    return new Promise((resolve) => {
        console.log('使用回调方式获取标签页...');
        
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            // 检查 Chrome API 错误
            if (chrome.runtime.lastError) {
                console.error('Chrome API 错误:', chrome.runtime.lastError.message);
                resolve();
                return;
            }
            
            console.log('回调获取到标签页数量:', tabs?.length || 0);
            
            if (!tabs || tabs.length === 0) {
                console.log('没有获取到标签页');
                resolve();
                return;
            }
            
            const tab = tabs[0];
            console.log('当前页面信息:');
            console.log('  - 标题:', tab.title);
            console.log('  - URL:', tab.url);
            console.log('  - favIconUrl:', tab.favIconUrl ? '有' : '无');
            
            // 排除浏览器内部页面
            if (!tab.url) {
                console.log('页面无 URL，跳过');
                resolve();
                return;
            }
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || 
                tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
                console.log('浏览器内部页面，跳过:', tab.url);
                resolve();
                return;
            }
            
            // 填充表单
            const urlInput = document.getElementById('appUrl');
            const nameInput = document.getElementById('appName');
            const iconInput = document.getElementById('appIcon');
            
            if (urlInput) {
                urlInput.value = tab.url;
                console.log('已填充 URL');
            }
            if (nameInput) {
                nameInput.value = tab.title || '';
                console.log('已填充标题');
            }
            
            // 获取图标
            if (tab.favIconUrl && iconInput) {
                iconInput.value = tab.favIconUrl;
                updateIconPreview(tab.favIconUrl);
                console.log('已使用页面 favicon');
            } else if (tab.url) {
                try {
                    const urlObj = new URL(tab.url);
                    const favicon = `https://favicon.im/${urlObj.hostname}`;
                    if (iconInput) {
                        iconInput.value = favicon;
                        updateIconPreview(favicon);
                        console.log('已使用 Google Favicon 服务');
                    }
                } catch (e) {
                    console.log('URL 解析失败:', e);
                }
            }
            
            console.log('表单填充完成');
            resolve();
        });
    });
}

// 更新图标预览
function updateIconPreview(value) {
    const preview = document.getElementById('iconPreview');
    const iconValue = value || document.getElementById('appIcon').value || '';
    
    if (iconValue.includes('.') || iconValue.startsWith('http') || iconValue.startsWith('data:')) {
        preview.innerHTML = `<img src="${iconValue}" style="width:28px;height:28px;border-radius:6px;object-fit:contain;" onerror="this.style.display='none';this.parentElement.innerHTML='<img src=\'../image/icons/picture.svg\' width=\'28\' height=\'28\'>'">`;
    } else {
        preview.textContent = iconValue;
    }
}

// 自动获取图标
async function autoFetchIcon() {
    const url = document.getElementById('appUrl').value.trim();
    if (!url) {
        showToast('请先输入网站链接', 'error');
        return;
    }

    try {
        const urlObj = new URL(url);
        const faviconUrl = `${urlObj.origin}/favicon.ico`;
        
        // 使用 favicon.im 获取图标
        const favicon = `https://favicon.im/${urlObj.hostname}`;
        
        document.getElementById('appIcon').value = favicon;
        updateIconPreview(favicon);
        showToast('图标已获取');
    } catch (error) {
        showToast('无法自动获取图标', 'error');
    }
}

// 清除图标
function clearIcon() {
    document.getElementById('appIcon').value = '';
    document.getElementById('iconPreview').innerHTML = '<img src="../image/icons/picture.svg" width="28" height="28">';
}

// 保存应用
async function saveApp(e) {
    e.preventDefault();
    
    const name = document.getElementById('appName').value.trim();
    const url = document.getElementById('appUrl').value.trim();
    let category = document.getElementById('appCategory').value;
    const description = document.getElementById('appDesc').value.trim();
    const icon = document.getElementById('appIcon').value.trim();

    if (!name || !url || !category) {
        showToast('请填写必填项', 'error');
        return;
    }

    // 新建分类
    if (category === '__new__') {
        const newName = document.getElementById('newCategoryName').value.trim();
        if (!newName) {
            showToast('请输入新分类名称', 'error');
            return;
        }
        const newCat = await DataManager.addCategory({ name: newName, icon: '📁' });
        category = newCat.id;
    }

    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        finalUrl = 'https://' + url;
    }

    try {
        await DataManager.addApp({
            name,
            url: finalUrl,
            category,
            description,
            icon: icon || ''
        });
        
        showToast('网站已添加成功！', 'success');
        
        // 延迟关闭 popup 窗口
        setTimeout(() => {
            window.close();
        }, 800);
    } catch (error) {
        console.error('保存失败:', error);
        showToast('保存失败，请重试', 'error');
    }
}

// 显示提示
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 设置事件监听
function setupEventListeners() {
    document.getElementById('addAppForm').addEventListener('submit', saveApp);
    document.getElementById('appIcon').addEventListener('input', () => updateIconPreview());
    document.getElementById('btnFetchIcon').addEventListener('click', autoFetchIcon);
    document.getElementById('btnAutoIcon').addEventListener('click', autoFetchIcon);
    document.getElementById('btnClearIcon').addEventListener('click', clearIcon);
    document.getElementById('btnReset').addEventListener('click', () => {
        document.getElementById('addAppForm').reset();
        document.getElementById('iconPreview').innerHTML = '<img src="../image/icons/picture.svg" width="28" height="28">';
        toggleNewCategoryInput(false);
    });
    
    document.getElementById('appCategory').addEventListener('change', (e) => {
        toggleNewCategoryInput(e.target.value === '__new__');
    });
}
