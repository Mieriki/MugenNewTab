# MugenNewTab - 新标签页导航

一个基于 **Material Design 3** 设计的纯前端新标签页导航应用，同时也是一个 **Chrome / Firefox 浏览器扩展（Manifest V3）**。它提供统一的应用导航中心，用于管理和快速访问各类开发者工具、外部链接和自定义网站。

![MugenNewTab](./public/image/logo/mugen.png)

---

## ✨ 功能特性

- **应用导航**：分类展示工具应用和外部链接，支持自定义分类、添加/编辑/删除网站
- **拖拽排序**：长按应用卡片即可拖拽排序，支持同分类排序和跨分类移动
- **隐藏站点**：支持隐藏不常用的站点，双击左上角 Logo 快速切换显示/隐藏
- **全局搜索**：集成 16 个搜索引擎，快捷键 `Ctrl+K` / `Cmd+K` 唤起，支持关键词补全
- **个性化主题**：12 套内置主题（含深色模式），基于 CSS 变量动态切换
- **壁纸背景**：支持自定义壁纸 URL 或本地图片上传，可调节透明度、模糊度、遮罩
- **数据管理**：应用/分类的增删改查，数据导入/导出（JSON 格式备份）
- **UI 图标库**：约 48 个系统 SVG 图标 + 用户自定义图标管理
- **云同步**：基于 GitHub Gist 的数据云同步

---

## 🚀 运行方式

### 方式一：作为网页版运行

```bash
# 安装开发依赖
npm install

# 启动开发服务器
npm run dev
# 然后访问 http://localhost:5173
```

网页版使用 `localStorage` 存储数据。

### 方式二：作为 Chrome 扩展运行

```bash
npm run build:chromium
# 此时 dist/ 目录即为 Chromium 扩展加载目录
```

1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `./build-chromium.sh` 生成的 `build-chromium/` 目录（或 `npm run build:chromium` 生成的 `dist/`）
5. 打开新标签页即可看到 MugenNewTab

扩展版使用 `chrome.storage.local` 存储数据。

### 方式三：作为 Firefox 扩展运行

```bash
./build-firefox.sh
```

1. 打开 Firefox 扩展调试页：`about:debugging`
2. 点击「临时载入附加组件」
3. 选择 `build-firefox/manifest.json`
4. `js/background-firefox.js` 会自动处理启动时首个标签页的重定向

---

## 📁 项目结构

```
MugenNewTab/
├── index.html                  # 主入口（网页版 & 扩展新标签页）
├── view/
│   └── popup.html              # 扩展弹出窗口入口
├── manifest.json               # Chrome / Chromium / Edge Manifest V3
├── manifest.firefox.json       # Firefox Manifest V3
├── public/                     # 静态资源（构建时原样复制到 dist）
│   ├── config/                 # JSON 配置：主题、搜索引擎、默认数据
│   └── image/                  # 图标与 Logo
├── src/                        # Vue3 + TypeScript 源码
│   ├── App.vue                 # 新标签页根组件
│   ├── PopupApp.vue            # 弹出窗口根组件
│   ├── main.ts                 # 新标签页入口
│   ├── popup.ts                # 弹出窗口入口
│   ├── background.ts           # Firefox 后台脚本
│   ├── components/             # Vue 组件
│   ├── composables/            # 组合式函数
│   ├── services/               # 业务服务（BrowserAPI、Storage、Config、CloudSync 等）
│   ├── stores/                 # Pinia 状态管理
│   ├── styles/                 # SCSS 全局样式
│   ├── types/                  # TypeScript 类型定义
│   └── utils/                  # 工具函数
├── build-chromium.sh           # Chromium 扩展构建脚本
├── build-firefox.sh            # Firefox 扩展构建脚本
├── sign-firefox.sh             # 扩展打包/签名脚本（同时生成 Chromium .zip 与 Firefox .xpi/.zip）
├── scripts/
│   └── postbuild.js            # 构建后根据目标生成 dist/manifest.json
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── README.md
```

---

## 🛠️ 开发说明

### 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Vue 3（Composition API） |
| 语言 | TypeScript |
| 状态管理 | Pinia |
| 构建工具 | Vite |
| UI 设计 | Material Design 3 |
| 样式 | SCSS + CSS 变量 |
| 存储 | localStorage / chrome.storage.local / browser.storage.local |
| 扩展 API | Chrome / Firefox Manifest V3 |
| 测试 | Vitest + jsdom + @vue/test-utils |

### 常用命令

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev

# 类型检查 + 生产构建
npm run build

# 预览生产构建
npm run preview

# 运行测试（监听模式）
npm run test

# 运行测试（单次）
npx vitest run

# 单独类型检查
npx vue-tsc --noEmit
```

### 构建产物结构

执行 `npm run build:firefox` 或 `npm run build:chromium` 后，`dist/` 目录结构如下：

```
dist/
├── index.html
├── view/
│   └── popup.html
├── manifest.json               # 由 scripts/postbuild.js 根据目标生成
├── js/
│   ├── main-*.js
│   ├── popup-*.js
│   ├── global-*.js
│   ├── background-firefox.js   # Firefox 后台脚本（仅 Firefox 包使用）
│   └── *.css
├── config/
│   ├── themes.json
│   ├── searchEngines.json
│   └── defaultData.json
└── image/
    ├── icons/
    └── logo/
```

---

## 💾 数据备份与恢复

1. 点击页面右下角「个性化」按钮
2. 在设置面板中找到「数据管理」
3. 支持导出当前配置为 JSON 文件，或导入已有的 JSON 备份

**注意**：数据结构、存储键名与旧版原生实现保持一致，旧版数据可直接导入。

---

## 📦 浏览器扩展打包

项目提供 `sign-firefox.sh` 脚本，一次运行即可同时打包 Chromium（Chrome / Edge）与 Firefox 扩展。

1. 安装全局依赖：
   ```bash
   npm install -g web-ext
   ```
2. （可选）设置 Firefox API 密钥环境变量 `WEB_EXT_API_KEY` 与 `WEB_EXT_API_SECRET`
3. 执行 `./sign-firefox.sh`

生成文件：

- `dist/mugen_newtab-chromium.zip`：Chrome / Edge 商店提交包 / 开发者模式加载包
- `dist/mugen_newtab-*.xpi`：Firefox 已签名安装包（需设置 API 密钥）
- `dist/mugen_newtab-*.zip`：Firefox 未签名包（未设置密钥时生成，用于临时加载测试）

---

## 🧪 测试

项目使用 Vitest 进行单元测试，覆盖 services、stores、composables 与 components。

```bash
# 运行全部测试
npx vitest run
```

核心存储契约测试位于 `src/services/__tests__/storage.legacy.test.ts`，保留自旧版 `tests/storage.test.js` 的 5 个核心契约：

- 写操作返回前已经持久化
- 修改前重新读取最新快照，避免旧缓存覆盖外部更新
- 存储失败会拒绝操作并回滚内存缓存
- 分类局部排序不会删除未出现在排序列表中的分类
- 旧数据缺少「全部应用」分类时会无损补齐

---

## 📄 许可证

本项目基于开源许可证发布，详见 [LICENSE](./LICENSE)。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。开发前请运行 `npm run build` 与 `npx vitest run` 确保构建与测试通过。
