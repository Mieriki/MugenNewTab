# MugenNewTab - 新标签页导航

一个基于 **Material Design 3** 设计的纯前端新标签页导航应用，同时也是一个 **Chrome 浏览器扩展（Manifest V3）**。它提供统一的应用导航中心，用于管理和快速访问各类开发者工具、外部链接和自定义网站。

![MugenNewTab](./image/logo/logo.png)

---

## ✨ 功能特性

- **应用导航**：分类展示工具应用和外部链接，支持自定义分类、添加/编辑/删除网站
- **拖拽排序**：长按应用卡片即可拖拽排序，支持同分类排序和跨分类移动
- **隐藏站点**：支持隐藏不常用的站点，双击左上角 Logo 快速切换显示/隐藏
- **全局搜索**：集成 16 个搜索引擎，快捷键 `Ctrl+K` / `Cmd+K` 唤起，支持关键词补全
- **个性化主题**：12 套内置主题（含深色模式），基于 CSS 变量动态切换
- **壁纸背景**：支持自定义壁纸 URL 或本地图片上传，可调节透明度、模糊度、遮罩
- **数据管理**：应用/分类的增删改查，数据导入/导出（JSON 格式备份）
- **UI 图标库**：48 个系统 SVG 图标 + 用户自定义图标管理

---

## 🚀 运行方式

### 方式一：作为网页版运行

本项目为纯静态站点，无需安装依赖：

```bash
# 直接打开
open index.html

# 或使用本地服务器（推荐，避免 CORS 问题）
python -m http.server 8080
# 然后访问 http://localhost:8080
```

网页版使用 `localStorage` 存储数据。

### 方式二：作为 Chrome 扩展运行

1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目根目录
5. 打开新标签页即可看到 MugenNewTab

扩展版使用 `chrome.storage.local` 存储数据。

---

## 📁 项目结构

```
MugenNewTab/
├── index.html                  # 主入口（网页版 & 扩展新标签页）
├── manifest.json               # Chrome Extension Manifest V3 配置
├── config/                     # JSON 配置文件
│   ├── themes.json             # 12 套主题配色
│   ├── searchEngines.json      # 16 个搜索引擎
│   └── defaultData.json        # 默认应用、分类和系统图标
├── js/                         # JavaScript 逻辑
│   ├── app.js                  # 核心应用逻辑
│   ├── configLoader.js         # 配置加载器
│   ├── data.config.js          # 数据配置工具
│   ├── searchEngines.js        # 搜索引擎工具
│   ├── ThemeManager.js         # 主题管理器
│   ├── storage.js              # 页面与 popup 共用的存储/数据管理层
│   ├── ExtensionStorage.js     # 旧存储入口兼容层
│   ├── inline-scripts.js       # 全局函数与事件委托
│   └── theme-loader.js         # 主题防闪烁加载
├── view/                       # 扩展弹出窗口
│   ├── popup.html
│   └── popup.js
├── image/                      # 图片与图标资源
│   ├── icons/
│   └── logo/
└── README.md                   # 本文件
```

---

## 🛠️ 开发说明

### 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | HTML5, CSS3, ES6+ JavaScript |
| UI 设计 | Material Design 3 |
| 存储 | localStorage / chrome.storage.local |
| 扩展 API | Chrome Extension Manifest V3 |
| 构建工具 | 无（纯原生实现）|

### 脚本加载顺序

```html
<script src="js/configLoader.js"></script>
<script src="js/data.config.js"></script>
<script src="js/themes.config.js"></script>
<script src="js/searchEngines.js"></script>
<script src="js/storage.js"></script>
<script src="js/ThemeManager.js"></script>
<script src="js/theme-loader.js"></script>
<script src="js/inline-scripts.js"></script>
<script src="js/app.js"></script>
```

### 运行存储回归测试

```bash
node --test tests/storage.test.js
```

### 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+K` / `Cmd+K` | 打开全局搜索 |
| `Esc` | 关闭搜索/模态框 |
| 双击左上角 Logo | 切换隐藏站点显示 |
| 长按应用卡片 | 拖拽排序 |

---

## 💾 数据备份与恢复

1. 点击页面右下角「个性化」按钮
2. 在设置面板中找到「数据管理」
3. 支持导出当前配置为 JSON 文件，或导入已有的 JSON 备份

---

## 📄 许可证

本项目基于开源许可证发布，详见 [LICENSE](./LICENSE)。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。由于本项目无构建工具，修改时直接编辑静态文件即可。
