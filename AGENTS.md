# MugenNewTab - 新标签页导航

## 项目概述

MugenNewTab（新标签页导航）是一个基于 **Material Design 3** 设计的纯前端 Web 应用，同时也是一个 **Chrome 浏览器扩展（Manifest V3）**。它提供统一的应用导航中心，用于管理和快速访问各类开发者工具、外部链接和自定义网站。

**核心功能：**
- **应用导航**：分类展示工具应用和外部链接，支持自定义分类、添加/编辑/删除网站、拖拽排序，以及隐藏/显示站点
- **全局搜索**：集成 16 个搜索引擎（Google、Bing、百度、DuckDuckGo、夸克、搜狗、360搜索、StartPage、Qwant、Ecosia、雅虎、Yandex、Perplexity、秘塔AI、BiliBili、GitHub），快捷键 `Ctrl+K` / `Cmd+K` 唤起
- **个性化主题**：12 套内置主题（含深色模式），基于 CSS 变量动态切换
- **壁纸背景**：支持自定义壁纸 URL 或本地图片上传（Base64 存储到浏览器），可调节透明度、模糊度、遮罩层
- **UI 图标库**：约 48 个系统 SVG 图标 + 用户自定义图标管理
- **数据管理**：应用/分类的增删改查，数据导入/导出（JSON 格式备份）

**运行模式：**
1. **网页版**：作为静态网站部署，使用 `localStorage` 存储数据
2. **Chrome 扩展**：替换浏览器新标签页，使用 `chrome.storage.local` API 存储数据

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | HTML5, CSS3, ES6+ JavaScript（原生实现，无框架） |
| UI 设计 | Material Design 3 |
| 存储 | `localStorage`（网页版）/ Chrome Storage API（扩展版） |
| 扩展 API | Chrome Extension Manifest V3 |
| 外部依赖 | 无（纯原生实现，无 npm/构建工具） |

**重要说明**：本项目**无构建工具**，无 `package.json`、无 npm/yarn 依赖、无打包流程。直接部署静态文件即可运行。

---

## 项目结构

```
MugenNewTab/
├── index.html                  # 主入口（单文件架构，包含完整 HTML + 内联 CSS）
├── manifest.json               # Chrome Extension Manifest V3 配置
├── config/                     # JSON 配置文件目录
│   ├── themes.json             # 12 套主题配色配置
│   ├── searchEngines.json      # 16 个搜索引擎配置
│   └── defaultData.json        # 默认应用、分类和系统 UI 图标配置
├── js/                         # JavaScript 文件目录
│   ├── app.js                  # 核心应用逻辑（Utils, StorageManager, DataManager, AppNavigator, WallpaperManager）
│   ├── configLoader.js         # 配置加载器（同步/异步加载 JSON）
│   ├── data.config.js          # 数据配置工具（访问 DefaultData）
│   ├── themes.config.js        # 主题配置占位文件
│   ├── searchEngines.js        # 搜索引擎工具函数
│   ├── ThemeManager.js         # 主题管理器类（CSS 变量应用、派生变量计算）
│   ├── theme-loader.js         # 页面渲染前立即应用主题，防止 FOUC 闪烁
│   ├── inline-scripts.js       # 全局函数、事件委托、键盘快捷键（CSP 兼容）
│   └── ExtensionStorage.js     # Chrome Storage 兼容层（popup 等独立页面使用）
├── view/                       # 扩展独立页面
│   ├── popup.html              # Chrome 扩展弹出窗口（添加网站）
│   └── popup.js                # 弹出窗口脚本
├── image/                      # 静态图片资源
│   ├── icons/                  # 系统 SVG 图标（约 48 个）
│   └── logo/                   # Logo 图片
├── AGENTS.md                   # 本文件
├── LICENSE                     # MIT License
└── .gitignore                  # Git 忽略规则
```

---

## 核心架构

### 1. 主页面 (index.html)

采用**单文件架构**，包含：
1. **CSS 样式**（内联 `<style>`，使用 CSS 变量实现主题切换和深色模式）
2. **HTML 结构**：应用栏、侧边栏、内容区、搜索模态框、应用/分类编辑模态框、壁纸设置面板、UI 图标库管理器、确认对话框等
3. **JavaScript 引入**：通过 `<script>` 标签按顺序引入

**脚本加载顺序（关键，不可随意调整）：**
```html
<script src="js/configLoader.js"></script>      <!-- 必须先加载，同步加载配置 -->
<script src="js/data.config.js"></script>       <!-- 数据配置工具 -->
<script src="js/themes.config.js"></script>     <!-- 主题配置占位 -->
<script src="js/searchEngines.js"></script>     <!-- 搜索引擎工具 -->
<script src="js/ThemeManager.js"></script>      <!-- 主题管理器类 -->
<script src="js/theme-loader.js"></script>      <!-- 在 <head> 同步加载，防止 FOUC -->
<script src="js/inline-scripts.js?v=11"></script>  <!-- 全局函数和事件委托 -->
<script src="js/app.js?v=5"></script>           <!-- 主应用逻辑 -->
```

### 2. JavaScript 模块组织

**文件职责分工：**

| 文件 | 职责 |
|------|------|
| `js/configLoader.js` | 配置加载器。使用同步 XHR 在页面渲染前加载 `config/*.json`，填充全局变量 `themeConfig`、`searchEngines`、`DefaultData`，并带缓存机制 |
| `js/app.js` | 核心应用逻辑：定义 `Utils`、`StorageManager`、`DataManager`、`AppNavigator` 类、`WallpaperManager` 类，以及大量全局辅助函数 |
| `js/ExtensionStorage.js` | Chrome Storage API 封装，提供独立的 `StorageManager` 和 `DataManager`，用于 `popup.html` 等独立页面 |
| `js/inline-scripts.js` | 全局函数定义、事件委托（`data-action`）、初始化逻辑、键盘快捷键、搜索引擎 UI 初始化 |
| `js/ThemeManager.js` | 主题管理器类，处理主题切换、CSS 变量应用、派生变量计算 |
| `js/theme-loader.js` | 在页面渲染前立即应用主题颜色，防止 FOUC 闪烁；监听 `themeConfig` 加载 |
| `js/data.config.js` | 数据配置工具，访问 `DefaultData` |
| `js/searchEngines.js` | 搜索引擎工具函数 |

**核心类/对象：**

| 名称 | 类型 | 职责 |
|------|------|------|
| `ConfigLoader` | 对象 | 同步/异步加载 JSON 配置文件，带缓存机制 |
| `Utils` | 对象 | 防抖/节流、XSS 转义、ID 生成、图片加载容错、DOM 缓存、时间格式化 |
| `StorageManager` | 对象 | 存储抽象层，自动检测 Chrome 扩展环境，兼容 `localStorage` 和 `chrome.storage.local` |
| `DataManager` | 对象 | 数据管理（应用、分类、UI 库），带内存缓存和异步同步机制 |
| `AppNavigator` | 类 | 主应用类，处理导航、渲染、状态管理、事件绑定、拖拽排序 |
| `ThemeManager` | 类 | 主题管理，应用 CSS 变量，渲染主题选择器，计算派生颜色 |
| `WallpaperManager` | 类 | 壁纸背景管理（透明度、模糊、遮罩、本地图片 Base64 存储） |

### 3. Chrome 扩展架构

**Manifest V3 配置 (`manifest.json`):**
```json
{
    "manifest_version": 3,
    "name": "MugenNewTab - 新标签页导航",
    "version": "1.0.0",
    "description": "统一管理和快速访问各类开发者工具和外部链接的应用导航中心",
    "author": "MugenNewTab",
    "homepage_url": "https://github.com/MugenNewTab/MugenNewTab",
    "icons": { "16": "image/logo/mugen.png", ... },
    "chrome_url_overrides": { "newtab": "index.html" },
    "action": { "default_popup": "view/popup.html", ... },
    "permissions": ["storage", "activeTab", "tabs"],
    "optional_permissions": ["bookmarks"],
    "host_permissions": ["http://*/", "https://*/"],
    "web_accessible_resources": [
        { "resources": ["js/*", "view/*", "image/*", "config/*"], "matches": ["<all_urls>"] }
    ],
    "content_security_policy": {
        "extension_pages": "script-src 'self'; object-src 'self'"
    }
}
```

**扩展功能：**
- 替换浏览器新标签页显示 MugenNewTab
- 点击扩展图标弹出快速添加网站窗口 (`view/popup.html`)
- 自动获取当前标签页信息（标题、URL、favicon）
- CSP 合规：所有内联脚本已移至外部文件

---

## 数据存储

### 存储键名

| 键名 | 用途 | 格式 |
|------|------|------|
| `appNavigator_data` | 应用和分类数据 | JSON `{categories, apps}` |
| `appNavigator_user_uiLib` | 用户自定义 UI 图标库 | JSON `{categories, items}` |
| `appNavigator_wallpaper` | 壁纸设置 | JSON `{url, opacity, blur, overlayOpacity, isLocalImage}` |
| `appNavigator_wallpaper_image` | 本地壁纸图片数据（Base64） | JSON `{data, name, type, size, timestamp}` |
| `selectedTheme` | 当前主题 ID | 字符串 |
| `sidebarCollapsed` | 侧边栏折叠状态 | 布尔值 |
| `searchHistory` | 搜索历史记录 | JSON 数组（最多 10 条） |
| `selectedSearchEngine` | 当前搜索引擎索引 | 数字 |
| `appNavigator_showHiddenApps` | 是否全局显示已隐藏的站点 | 布尔值 |
| `appNavigator_hiddenTipDismissed` | 隐藏站点提示是否已“不再提示” | 布尔值 |

**UI 图标库说明：**
- **系统 UI**：从 `config/defaultData.json` 的 `systemUiLib` 读取，不保存到浏览器存储，更新版本时可自动添加新图标
- **用户 UI**：保存到 `appNavigator_user_uiLib`，用户可自由添加/删除/导出
- **显示时**：合并系统 UI 和用户 UI，系统图标标记为 `isSystem: true`，不可删除

### 数据结构

**应用数据格式：**
```javascript
{
    categories: [
        { id: 'all', name: '全部应用', icon: './image/icons/menu.svg', monochrome: true },
        { id: 'cat_xxx', name: '娱乐媒体', icon: './image/icons/heart.svg', iconDark: './image/icons/heart-white.svg', monochrome: true }
    ],
    apps: [
        {
            id: 'app_xxx',
            name: '应用名称',
            description: '描述',
            icon: 'https://...',  // 或 Emoji
            url: 'https://...',
            category: 'categoryId',
            hidden: false  // 设置为 true 时站点默认不在首页显示
        }
    ]
}
```

**分类图标支持：**
- `icon`: 浅色模式图标（图片 URL 或 Emoji）
- `iconDark`: 深色模式图标（可选）
- `monochrome`: 是否为单色图标（深色模式下会反转为白色）

---

## 主题系统

### CSS 变量命名规范

遵循 Material Design 3 规范，核心变量包括：
```css
--md-sys-color-primary              /* 主色 */
--md-sys-color-on-primary           /* 主色上的文字色 */
--md-sys-color-primary-container    /* 主色容器背景 */
--md-sys-color-surface              /* 表面色 */
--md-sys-color-background           /* 背景色 */
--md-sys-color-outline              /* 边框色 */
--md-sys-color-error                /* 错误色 */
--md-sys-color-success              /* 成功色 */
/* 更多变量见 config/themes.json */
```

### 内置主题

配置位于 `config/themes.json`，`defaultTheme` 为 `material-rose`，共 12 套主题：

1. `material-rose` - Mugen娘经典（默认）
2. `midnight-rose` - 午夜蔷薇（深色）
3. `lavender-mist` - 薰衣草雾
4. `forest-whisper` - 森之语
5. `silent-library` - 静谧书馆（深色）
6. `azure-sky` - 碧空如洗
7. `amber-glow` - 琥珀微光
8. `peach-blossom` - 桃之夭夭
9. `mint-breeze` - 薄荷清风
10. `midnight-ocean` - 深海幽蓝（深色）
11. `autumn-leaves` - 秋叶绯红
12. `neon-cyber` - 霓虹赛博（深色）

主题切换通过 `ThemeManager.applyTheme(themeId)` 实现，自动设置 CSS 变量并触发 `themeChanged` 事件。

**防止 FOUC 闪烁：**
- `theme-loader.js` 在 `<head>` 中同步加载，读取 `localStorage.selectedTheme` 后立即应用主题颜色
- 如果主题尚未保存且系统偏好深色模式，会自动选择第一个可用的深色主题
- 使用 `html[data-theme-loading]` 隐藏页面内容，加载完成后添加 `html[data-theme-loaded]` 显示并淡入

**深色模式检测：**
- 通过主题配置中的 `isDark: true` 判断
- 应用深色主题时，为 `document.body` 添加 `dark-mode` 类
- 深色模式下 `--icon-filter` 等变量会反转图标颜色，`monochrome` 分类图标也会自动变白

---

## 运行方式

### 本地开发

无需安装依赖，直接用浏览器打开：
```bash
# 方式1：直接打开文件
open index.html

# 方式2：使用本地服务器（推荐，避免 CORS 问题）
python -m http.server 8080
# 然后访问 http://localhost:8080
```

### 部署

本项目为纯静态站点，可部署至任何静态托管服务：
- GitHub Pages
- Netlify / Vercel
- Nginx / Apache
- 对象存储（S3/OSS）

**部署清单：**
- `index.html`（必需）
- `js/` 目录下所有文件（必需）
- `image/` 目录（必需，图标资源）
- `config/` 目录（必需，配置文件）
- `manifest.json`（Chrome 扩展必需）
- `view/` 目录（Chrome 扩展弹出窗口必需）

### Chrome 扩展运行

1. 打开 Chrome 扩展管理页 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录
5. 扩展将使用 Chrome Storage API 替代 localStorage

---

## 开发规范

### 代码风格

- **缩进**：4 空格
- **语言**：中文注释和界面文本
- **引号**：HTML 属性使用双引号，JS 字符串使用单引号
- **变量命名**：驼峰命名法（`appNavigator`, `currentTheme`）
- **文件编码**：UTF-8

### XSS 防护

**必须**对所有动态内容使用 `Utils.escapeHtml()` 转义：
```javascript
// 正确
container.innerHTML = `<div>${Utils.escapeHtml(userInput)}</div>`;

// 错误（存在 XSS 风险）
container.innerHTML = `<div>${userInput}</div>`;
```

### 图片加载

使用 `Utils.createImageWithFallback()` 处理加载失败：
```javascript
imgHtml = Utils.createImageWithFallback(url, alt, fallbackEmoji);
```

### 事件处理

- 使用事件委托（`data-action` 属性）处理大量动态元素
- 使用 `Utils.debounce()` 和 `Utils.throttle()` 优化高频事件
- 模态框支持 ESC 关闭、Tab 循环聚焦

### 存储操作

所有存储操作均为异步：
```javascript
// 正确
const data = await StorageManager.get('key');
await StorageManager.set('key', value);

// DataManager 自动处理缓存和同步
await DataManager.saveData(data);
```

### 配置加载

`configLoader.js` 使用同步 XHR 确保配置在页面渲染前加载完成：
```javascript
// 同步加载配置（页面加载时）
const themes = ConfigLoader.loadSync('themes');

// 异步加载配置（动态刷新时）
const themes = await ConfigLoader.load('themes');
```

---

## 测试策略

本项目**没有自动化测试套件**（无单元测试、集成测试或端到端测试）。

**当前测试方式：**
- 本地在浏览器中直接打开 `index.html` 或使用本地服务器运行
- 手动验证功能：添加/编辑/删除应用、切换主题、设置壁纸、搜索、拖拽排序、数据导入导出
- 作为 Chrome 扩展加载后，验证 `chrome.storage.local` 数据持久化和 popup 添加网站功能

**建议补充测试（如需要）：**
- 使用浏览器自动化工具（如 Playwright、Puppeteer）对核心用户流程进行端到端测试
- 对 `Utils.escapeHtml()`、`StorageManager`、`DataManager` 等纯逻辑函数补充单元测试

---

## 安全注意事项

- **XSS 防护**：所有用户输入必须转义后显示（使用 `Utils.escapeHtml()`）
- **CSP 合规**：Chrome 扩展 CSP 限制内联脚本，相关逻辑已移至外部文件
- **图标加载**：使用 `onerror` 回退机制防止破损图标
- **本地图片存储**：限制 5MB，避免存储空间溢出
- **禁止 Data URL 上传**：UI 图标库不支持 data URL（节省存储空间）
- **外部链接**：应用卡片点击后通过 `window.open(url, '_blank')` 打开，注意外部 URL 来源

---

## 注意事项

1. **无包管理器**：本项目无 `package.json`，不依赖 npm/yarn，直接编辑静态文件即可

2. **单文件架构**：主页面 `index.html` 较大（主要是 CSS 和 HTML），修改时建议先定位到对应功能区域

3. **存储限制：**
   - `localStorage` 通常限制 5-10MB
   - Chrome Storage 有容量限制（建议本地图片不超过 5MB）

4. **跨域限制**：作为 Chrome 扩展运行时，注意 CORS 政策对 fetch 请求的限制

5. **浏览器兼容**：使用现代 ES6+ 特性（async/await、可选链等），需现代浏览器支持

6. **主题闪烁**：页面加载时有防闪烁脚本（`data-theme-loading` 属性），修改主题逻辑时注意保持

7. **重复 ID**：添加新应用时需确保 ID 唯一（使用 `Utils.generateId()` 或 `DataManager.addApp()`）

8. **配置加载顺序**：`configLoader.js` 必须在其他脚本之前加载，且使用同步 XHR 确保配置可用

9. **Popup 独立存储层**：`view/popup.html` 使用 `js/ExtensionStorage.js` 中的 `StorageManager` / `DataManager`，与 `app.js` 中的实现略有差异，但存储键名和接口保持一致

10. **脚本版本号**：`index.html` 中部分脚本 URL 带有 `?v=5`、`?v=11` 等查询参数，修改后如需强制刷新可递增版本号

---

## 许可证

MIT License - Copyright (c) 2026 Mieriki
