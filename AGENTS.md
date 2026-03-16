# MugenNewTab - 新标签页导航

## 项目概述

MugenNewTab（新标签页导航）是一个基于 Material Design 3 设计的**纯前端 Web 应用**，同时也是一个 **Chrome 浏览器扩展**。它用于统一管理和快速访问各类开发者工具和外部链接。

**主要功能：**
- **应用导航**：分类展示工具应用和外部链接
- **全局搜索**：集成多搜索引擎（Google/Bing/百度/DuckDuckGo/GitHub/Stack Overflow）
- **个性化**：多套主题切换（支持深色模式）、自定义壁纸背景
- **数据管理**：支持应用/分类的增删改查，数据导入/导出备份
- **UI 图标库**：系统图标 + 用户自定义图标管理

**运行模式：**
1. **网页版**：作为静态网站部署，使用 localStorage 存储数据
2. **Chrome 扩展**：替换浏览器新标签页，使用 Chrome Storage API 存储数据

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | HTML5, CSS3, ES6+ JavaScript |
| UI 设计 | Material Design 3 |
| 存储 | localStorage（网页版）/ Chrome Storage API（扩展版）|
| 扩展 API | Chrome Extension Manifest V3 |
| 外部依赖 | 无（纯原生实现）|

**重要说明**：本项目**无构建工具**，无 package.json、无 npm/yarn 依赖、无打包流程。直接部署静态文件即可运行。

---

## 项目结构

```
MugenNewTab/
├── index.html              # 主入口（约 100KB，包含完整 HTML + CSS）
├── manifest.json           # Chrome Extension Manifest V3 配置
├── config/                 # JSON 配置文件目录
│   ├── themes.json         # 主题配色配置（3套主题）
│   ├── searchEngines.json  # 搜索引擎配置（6个引擎）
│   └── defaultData.json    # 默认应用、分类和系统 UI 图标配置
├── js/                     # JavaScript 文件目录
│   ├── app.js              # 主应用逻辑（Utils, StorageManager, DataManager, AppNavigator, WallpaperManager）
│   ├── configLoader.js     # 配置加载器（同步/异步加载 JSON 配置）
│   ├── data.config.js      # 数据配置工具（访问 DefaultData）
│   ├── themes.config.js    # 简化版主题管理器类
│   ├── searchEngines.js    # 搜索引擎工具函数
│   ├── ThemeManager.js     # 完整主题管理器类
│   ├── ExtensionStorage.js # Chrome Storage 兼容层 + DataManager 实现
│   └── inline-scripts.js   # 全局函数和事件委托处理（Manifest V3 CSP 兼容）
├── view/                   # 工具页面目录
│   ├── popup.html          # Chrome 扩展弹出窗口
│   └── popup.js            # 弹出窗口独立脚本
├── image/                  # 静态图片资源
│   ├── icons/              # SVG 图标（48个系统图标）
│   └── logo/               # Logo 图片
└── .idea/                  # IDE 配置
```

---

## 核心架构

### 1. 主页面 (index.html)

主页面采用**单文件架构**，包含：
1. **CSS 样式**（内联样式，使用 CSS 变量实现主题切换）
2. **HTML 结构**：应用栏、侧边栏、内容区、模态框、搜索组件等
3. **JavaScript 引入**：通过 `<script>` 标签引入 `js/` 目录下的模块

**脚本加载顺序（关键）：**
```html
<script src="js/configLoader.js"></script>      <!-- 必须先加载，同步加载配置 -->
<script src="js/data.config.js"></script>       <!-- 数据配置工具 -->
<script src="js/themes.config.js"></script>     <!-- 主题管理器 -->
<script src="js/searchEngines.js"></script>     <!-- 搜索引擎工具 -->
<script src="js/ThemeManager.js"></script>      <!-- 完整主题管理器类 -->
<script src="js/inline-scripts.js"></script>    <!-- 全局函数和事件委托 -->
<script src="js/app.js"></script>               <!-- 主应用逻辑 -->
```

### 2. JavaScript 模块组织

**文件职责分工：**

| 文件 | 职责 |
|------|------|
| `js/configLoader.js` | 配置加载器，使用同步 XHR 确保配置在页面渲染前加载完成，填充全局变量 `themeConfig`, `searchEngines`, `DefaultData` |
| `js/app.js` | 核心应用逻辑：Utils 工具函数、StorageManager 存储适配、DataManager 数据管理、AppNavigator 主应用类、WallpaperManager 壁纸管理 |
| `js/ExtensionStorage.js` | Chrome Storage API 封装，独立的 DataManager 实现，用于 popup.html 等独立页面 |
| `js/inline-scripts.js` | 全局函数定义、事件委托（data-action）、初始化逻辑、键盘快捷键（Manifest V3 CSP 合规）|
| `js/ThemeManager.js` | 完整主题管理器类，处理主题切换和 CSS 变量应用 |
| `js/themes.config.js` | 简化版主题管理器类 |
| `js/data.config.js` | 数据配置工具，访问 DefaultData |
| `js/searchEngines.js` | 搜索引擎工具函数 |

**核心类/对象：**

| 名称 | 类型 | 职责 |
|------|------|------|
| `ConfigLoader` | 对象 | 同步/异步加载 JSON 配置文件 |
| `Utils` | 对象 | 防抖/节流、XSS 转义、ID 生成、图片加载容错、DOM 缓存 |
| `StorageManager` | 对象 | 存储抽象层，自动检测 Chrome 扩展环境，兼容 localStorage 和 Chrome Storage |
| `DataManager` | 对象 | 数据管理（应用、分类、UI 库），带内存缓存和同步机制 |
| `AppNavigator` | 类 | 主应用类，处理导航、渲染、状态管理、事件绑定 |
| `ThemeManager` | 类 | 主题管理，应用 CSS 变量，渲染主题选择器 |
| `WallpaperManager` | 类 | 壁纸背景管理（透明度、模糊、遮罩、本地图片）|

### 3. Chrome 扩展架构

**Manifest V3 配置 (`manifest.json`):**
```json
{
    "manifest_version": 3,
    "chrome_url_overrides": { "newtab": "index.html" },
    "action": { "default_popup": "view/popup.html" },
    "permissions": ["storage", "activeTab", "tabs"],
    "host_permissions": ["http://*/", "https://*/"],
    "content_security_policy": {
        "extension_pages": "script-src 'self'; object-src 'self'"
    }
}
```

**扩展功能：**
- 替换浏览器新标签页显示 MugenNewTab
- 点击扩展图标弹出快速添加网站窗口 (`view/popup.html`)
- 自动获取当前标签页信息（标题、URL、图标）
- CSP 合规：所有内联脚本已移至外部文件 (`inline-scripts.js`, `popup.js`)

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
| `searchHistory` | 搜索历史记录 | JSON 数组 |
| `selectedSearchEngine` | 当前搜索引擎索引 | 数字 |

**重要说明：** UI 图标库分为系统默认和用户自定义两部分：
- **系统 UI**：从 `config/defaultData.json` 的 `systemUiLib` 读取，不保存到浏览器存储，更新版本时可自动添加新图标
- **用户 UI**：保存到 `appNavigator_user_uiLib`，用户可自由添加/删除/导出
- **显示时**：合并系统 UI 和用户 UI，系统图标标记为 `isSystem: true`，不可删除

### 数据结构

**应用数据格式：**
```javascript
{
    categories: [
        { id: 'all', name: '全部应用', icon: '📱' },
        { id: 'cat_xxx', name: '娱乐媒体', icon: './image/icons/heart.svg', iconDark: './image/icons/heart-white.svg', monochrome: true }
    ],
    apps: [
        {
            id: 'app_xxx',
            name: '应用名称',
            description: '描述',
            icon: 'https://...',  // 或 Emoji
            url: 'https://...',
            category: 'categoryId'
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

遵循 Material Design 3 规范：
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

配置位于 `config/themes.json`，默认包含3套主题：
1. `material-rose` - Mugen娘经典配色（默认）
2. `jigoku-shoujo` - 地狱少女·阎魔爱（深色）
3. `element-office` - 简洁办公

主题切换通过 `ThemeManager.applyTheme(themeId)` 实现，自动设置 CSS 变量并触发 `themeChanged` 事件。

**深色模式检测：** 通过计算背景色亮度自动检测 (`Utils.isColorDark`)，自动添加 `dark-mode` 类到 body。

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

## 安全注意事项

- **XSS 防护**：所有用户输入必须转义后显示（使用 `Utils.escapeHtml()`）
- **CSP 合规**：Chrome 扩展 CSP 限制内联脚本，相关逻辑已移至 `inline-scripts.js`
- **图标加载**：使用 `onerror` 回退机制防止破损图标
- **本地图片存储**：限制 5MB，避免存储空间溢出
- **禁止 Data URL 上传**：UI 图标库不支持 data URL（节省存储空间）

---

## 注意事项

1. **无包管理器**：本项目无 package.json，不依赖 npm/yarn，直接编辑静态文件即可

2. **单文件架构**：主页面 `index.html` 约 100KB（主要是 CSS 和 HTML），修改时建议先定位到对应功能区域

3. **存储限制**：
   - localStorage 通常限制 5-10MB
   - Chrome Storage 有容量限制（建议本地图片不超过 5MB）

4. **跨域限制**：作为 Chrome 扩展运行时，注意 CORS 政策对 fetch 请求的限制

5. **浏览器兼容**：使用现代 ES6+ 特性（async/await, 可选链等），需现代浏览器支持

6. **主题闪烁**：页面加载时有防闪烁脚本（`data-theme-loading` 属性），修改主题逻辑时注意保持

7. **重复 ID**：添加新应用时需确保 ID 唯一（使用 `Utils.generateId()` 或 `DataManager.addApp()`）

8. **配置加载顺序**：`configLoader.js` 必须在其他脚本之前加载，且使用同步 XHR 确保配置可用
