# MugenNewTab - 新标签页导航

一个基于 **Material Design 3** 设计的纯前端新标签页导航应用，同时也是一个 **Chrome / Firefox 浏览器扩展（Manifest V3）**。它提供统一的应用导航中心，用于管理和快速访问各类开发者工具、外部链接和自定义网站。

![MugenNewTab](./public/image/logo/mugen.png)

---

## ✨ 功能特性

- **应用导航**：分类展示工具应用和外部链接，支持自定义分类、添加/编辑/删除网站
- **拖拽排序**：长按应用卡片即可拖拽排序，支持同分类排序和跨分类移动
- **隐藏站点**：支持隐藏不常用的站点，双击左上角 Logo 快速切换显示/隐藏
- **全局搜索**：集成 16 个搜索引擎，快捷键 `Ctrl+K` / `Cmd+K` 唤起，支持关键词补全
- **个性化主题**：12 套主题配色，每套都有「明亮 / 深色」两种变体（共 24 个），可单独切换明暗或跟随系统深色偏好
- **壁纸背景**：支持自定义壁纸 URL 或本地图片上传，可调节透明度、模糊度、遮罩
- **数据管理**：应用/分类的增删改查，数据导入/导出（JSON 格式备份）
- **UI 图标库**：约 48 个系统 SVG 图标 + 用户自定义图标管理；系统图标用 CSS mask 渲染，颜色跟随当前主题（含 `color` 覆盖），深色模式下不再有黑图标
- **云同步**：基于 GitHub / Gitee Gist 的数据云同步，支持双向增量合并（冲突本地优先）
- **浏览器同步**：把登录凭据用口令加密后写入浏览器账号同步区，同一账号的其他设备免 Token 登录
- **跳转方式可选**：点击站点卡片 / 搜索时可选择「新标签页」或「覆盖当前页」，在个性化 → 页面布局里切换
- **本地媒体缓存**：站点图标与网络壁纸缓存进 IndexedDB（图标 7 天 / 壁纸 30 天），二次打开不再发请求；可在个性化 → 缓存里开关与清理

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
# 此时 dist-chrome/ 目录即为 Chromium 扩展加载目录
```

1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `./build-chromium.sh` 生成的 `build-chromium/` 目录（或 `npm run build:chromium` 生成的 `dist-chrome/`）
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
├── manifest.json               # Chrome / Chromium Manifest V3（新 Logo 图标）
├── manifest.edge.json          # Microsoft Edge Manifest V3（沿用旧 Logo 图标）
├── manifest.firefox.json       # Firefox Manifest V3
├── public/                     # 静态资源（构建时原样复制到产物目录）
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
│   ├── postbuild.js            # 构建后根据目标生成 <产物目录>/manifest.json
│   └── gen-themes.mjs          # 生成 themes.json：派生明/暗变体 + 对比度体检
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

执行 `npm run build:chromium` / `npm run build:edge` / `npm run build:firefox` 后，产物分别位于
`dist-chrome/`、`dist-edge/`、`dist-firefox/`，目录结构如下：

```
dist-chrome/   # Chrome / Chromium
dist-edge/     # Microsoft Edge（图标沿用旧 Logo）
dist-firefox/  # Firefox
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

## ☁️ 云同步与浏览器同步

云同步面板（右下角菜单 → 云同步）提供两条互补的路径：

| 能力 | 作用 | 需要的凭据 |
|------|------|-----------|
| 云同步 | 站点数据 + 图标库存到 GitHub / Gitee 的 Gist，多端双向增量合并（冲突本地优先） | 平台 Token（GitHub 需 `gist` 权限） |
| 浏览器同步 | 把 Token 用口令加密后写进浏览器账号同步区（`storage.sync`），同账号设备免 Token 登录 | 自定的同步密码（≥ 6 位） |

### 首次配置（设备 A）

1. 填入 Token 并点「连接」，验证通过即完成云同步；
2. 在「浏览器同步」区块勾选「开启浏览器同步」，设置同步密码并确认。

> 也可以先开启浏览器同步再登录：此时只在本机记住开关与密码，登录成功后会自动把凭据补推到同步区。

### 新设备（设备 B）

1. 用同一浏览器账号登录浏览器（`storage.sync` 才会跨设备同步）；
2. 打开云同步面板，若同步区已有其他设备的凭据，会显示「检测到其他设备的登录状态」；
3. 输入同一同步密码 →「恢复登录状态」，随后自动拉取云端数据。

> 如果面板显示「凭据：暂无」，说明同步区里还没有数据：先在设备 A 登录一次（登录成功才会写入凭据），
> 再让浏览器完成一次同步。面板底部的「重新检查」可以手动刷新状态。

**Firefox 的两个硬性条件**（Chrome / Edge 同理，只是入口不同）：

- 「设置 → 同步」里必须勾选 **附加组件（Add-ons）**，否则扩展的 `storage.sync` 不参与同步；
- Firefox 每 **10 分钟**同步一次，或手动点「立即同步」；刚写入的数据不会立刻出现在另一台设备上。

同步区里只保存 AES-GCM 密文，明文 Token 与本机密码都不会上传；忘记密码时可在面板中「关闭浏览器同步」后重新开启。

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

## 🚀 自动发版与 Firefox 自动更新

推一个 tag 就能完成「构建 → 签名 → 发布 → 生成更新清单」，不需要本地打包。

### 发版

```bash
./scripts/release.sh          # 构建号自动 +1，例如 1.0.0.103 → 1.0.0.104
./scripts/release.sh 1.0.1.0  # 或指定版本号
```

脚本会写入三份 manifest（Chrome / Edge / Firefox）的版本号、提交、打 `v<版本>` tag 并推送。随后
`.github/workflows/release.yml` 自动执行：

1. `npm ci` + 构建 Firefox / Chromium 两个产物
2. `web-ext sign --channel unlisted` 调用 AMO 签名 Firefox 包
3. 打包 Chromium zip
4. 生成 `updates.json`（Firefox 更新清单，含 sha256 校验）与 `latest.json`（应用内更新检查用）
5. 创建 GitHub Release，附上四个文件

推送失败（网络抖动、`SSL_ERROR_SYSCALL` 等）时提交和 tag 已经在本地建好，
**直接重新运行 `./scripts/release.sh` 即可**：脚本会检测到 HEAD 上未推送的 tag，
跳过版本递增只做补推，不会白白消耗一个版本号。

### 首次配置（只需一次）

在仓库 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 值 |
| --- | --- |
| `WEB_EXT_API_KEY` | AMO 的 JWT issuer，形如 `user:12345:67` |
| `WEB_EXT_API_SECRET` | AMO 的 JWT secret |

> Fork 仓库需要在 Actions 页面点一次「I understand my workflows, go ahead and enable them」。

### Firefox 自动更新是怎么生效的

`manifest.firefox.json` 里声明了：

```json
"browser_specific_settings": {
  "gecko": {
    "id": "xxxx@xxx.com",
    "update_url": "https://github.com/AlexCat315/MugenNewTab/releases/latest/download/updates.json"
  }
}
```

Firefox 每 24 小时（`extensions.update.interval`，默认 86400 秒）拉取该 `updates.json`，
发现 `version` 高于已安装版本就静默下载并安装。

### Chrome / Edge 为什么没有自动更新

Chrome 和 Edge 只对**商店分发**的扩展做自动更新，自托管的包（开发者模式加载、拖入 zip）
永远不会自己升级——`update_url` 在 Chromium 系只有 Linux 或企业策略托管环境才生效。
Firefox 是唯一支持「自托管 + 自动更新」的浏览器。

所以 Chromium 侧退一步做**应用内更新提示**：`useUpdateCheck` 定时读
`releases/latest/download/latest.json`，比对扩展自身 manifest 版本，有新版本时在左下角
显示提示条，点「立即更新」直接下载对应安装包。

- 数据源优先用静态清单 `latest.json`，GitHub REST API 只作兜底
  （未认证接口限 60 次/小时/IP，共享出口容易被刷满）
- 检查结果缓存 6 小时，避免每开一个新标签页都发请求
- 忽略某个版本后不再提示，下一个版本发布后会重新提示
- 网络异常、限流一律静默失败，不会打扰用户

几个必须遵守的约束：

- **扩展 ID 必须固定**（`cyke0315@163.com`）。改 ID 等于换了一个扩展，老用户收不到更新。
- **版本号不能重复提交**。AMO 对同一版本只接受一次上传，重复会报
  `This upload has already been submitted`，必须升版本号重试。
- **`update_url` 一旦发布就尽量不要改**。已安装的扩展只会用自己 manifest 里写死的
  `update_url` 检查更新，改地址会导致老用户永远收不到更新（只能靠企业策略兜底）。
- **必须经 AMO 签名**。正式版 Firefox 只安装已签名的扩展，未签名的只能在
  Developer Edition / Nightly 里关掉 `xpinstall.signatures.required` 后使用。

### 安装方式

Firefox 桌面版：下载 Release 里的 `.xpi`，拖进 `about:addons` 页面，或直接用 Firefox 打开该文件。

> GitHub Releases 返回的 `Content-Type` 是 `application/octet-stream` 而非
> `application/x-xpinstall`，所以点链接不会自动触发安装，需要手动拖入或打开文件。
> 更新过程走 Firefox 自己的更新通道，不受这个限制影响。

### 本地调试更新

```bash
# about:config 里把检查间隔改短（最小 120 秒）
extensions.update.interval = 120
# 确认开关是打开的
extensions.update.enabled = true
```

然后打开「工具 → 浏览器工具 → 浏览器控制台」，按扩展名过滤即可看到更新请求日志。

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
