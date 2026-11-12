# TeXora 1.5.0

- 清理两份 Mac 同步冲突副本，历史验证脚本移至 `scripts/legacy/`，正式回归测试统一至 `tests/`，新增 Windows CI。
- AI API Key 使用 Electron 38 safeStorage 加密；首次运行自动迁移旧设置及 `.bak`，不再将明文密钥写入设置文件。加密不可用时拒绝持久化密钥，不回退到明文。
- Gemini 使用 `x-goog-api-key` 请求头，密钥不再进入 URL 查询串。
- 开启主窗口渲染器 sandbox 与 ASAR 打包，保持 contextIsolation 与禁用 Node 集成。
- 抽离预览指针/光标归属、关闭记忆及定位算法，补充行为单测；主进程协议处理拆入独立模块。
- 保留 1.4.3 的文档打开、PDF 阅读、构建诊断和 AI 历史改进。

## 安装与签名

Windows x64 安装包保留用户数据。当前发行未签名：项目尚未配置有效签名证书。发布流程支持 `WINDOWS_CSC_LINK` 和 `WINDOWS_CSC_KEY_PASSWORD` GitHub Secrets；配置证书后可自动签名。ASAR 是打包格式，不是加密或签名。

系统加密保护磁盘上的密钥，无法隔离同一 Windows 账户下的其他程序。密文不能直接迁移到另一台机器或账户；请在目标机器重新输入密钥。

## 验证

正式测试：`npm test`；渲染构建：`npm run build`；需要本地 TeX 的集成测试：`npm run test:integration`。

验证结果：正式回归测试及渲染构建通过；实际 Windows safeStorage 加密/解密与打包界面桥接测试通过。本次执行环境的 Chromium 沙箱在启动阶段崩溃（空 Electron 的 `--version` 亦失败），桌面实测使用临时 `--no-sandbox` 参数，因此完整沙箱运行仍需在正常 Windows 桌面或 CI 确认；发行配置保持 `sandbox: true`，未添加关闭沙箱的启动参数。

打包预览交互回归通过：鼠标无需点击即可切换公式，移出关闭，静止鼠标下输入保持实时预览，旧异步结果不会重新打开已关闭预览。
