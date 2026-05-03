# AiCodeMirror Balance Tray

跨平台（Windows / macOS）的状态栏余额工具，基于 Electron。

作者：**Cute-chen**

## 功能

- 托盘/菜单栏常驻显示余额状态
- 登录窗口（站内登录，复用会话）
- 余额展示（综合余额 + 分项余额）
- 订阅信息（当前订阅、剩余天数）
- 账号信息（手机号/邮箱）
- 邀请码展示 + 一键复制邀请链接
- API Key 名称与总消耗展示
- 刷新频率可配置（秒，最大 3600）
- 清除登录态后自动打开登录页
- 退出二次确认（防误触）

## 技术框架

- 框架：Electron（主进程 + BrowserWindow + Tray）
- 网络请求：Electron `session.fetch`（同容器会话）
- 打包：electron-builder
- 安装包格式：
  - Windows：NSIS `.exe`
  - macOS：`.dmg`

## 目录结构

```text
windows-balance-demo/
  main.js
  package.json
  tray.ico
  trayTemplate.png
  icon.ico
  icon.icns
```

## 本地运行

```bash
npm install
npm start
```

## 打包

```bash
# Windows 安装包（NSIS .exe）
npm run build:win

# macOS 安装包（.dmg）
npm run build:mac
```

打包产物在 `dist/` 目录。

## 图标说明

- 运行时托盘图标：
  - Windows 使用 `tray.ico`
  - macOS 使用 `trayTemplate.png`（模板图标）
- 安装包 / 应用图标：
  - Windows 使用 `icon.ico`
  - macOS 使用 `icon.icns`

## 安装包体积说明（为什么看起来较大）

这是 Electron 应用的常见现象，主要原因是：

- Electron 会打包完整运行时（Chromium + Node.js）
- 每个平台都要带一套对应平台运行时
- 安装包还包含应用资源与依赖

所以 Electron 安装包通常明显大于原生应用或 Tauri 应用。

如需进一步减小体积，可考虑：

- 只打单架构（例如仅 `x64` 或仅 `arm64`）
- 精简 `build.files` 中不必要文件
- 使用更高压缩配置
- 迁移到 Tauri（依赖系统 WebView，包体通常更小）

## 注意事项

- 本项目依赖目标站点当前接口结构，若站点改版可能需要同步更新。
- 登录态是否长期有效由服务端控制，可能因风控/会话过期失效。
- macOS 下若遇到 WebView 登录风控问题，建议优先在 Windows 使用。

## 安全建议

- 不要在日志或 issue 中贴出 Cookie、Token、完整 HAR。
- 开源前确认未提交敏感测试数据。

## License

建议使用 MIT（可按你的仓库实际情况调整）。
