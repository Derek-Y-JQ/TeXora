# TeXora 2.1.5 · 本地优先的 LaTeX 写作工作台

TeXora 是面向 Windows 和 macOS 的本地 LaTeX 编辑器，把源码、PDF、数学结构和可控 AI 放进同一个工作台。它着重解决写作过程中反复打断思路的小事：

- **受控 AI 赋能，主动权仍在自己**：选上下文、选 Skills、检查差异，再决定是否写入；检查与解释作为回答展示。本软件也支持设备安装好的 harness，例如 codex，claude code，dsh 作为 agent。
- **图片、表格、代码块省心插入**：粘贴图片、编辑表格、选择 listings / minted、点选伪代码流程组件；代码块所需宏包自动补入主文档。
- **归档闹心的中间文件**：编译产物集中在 `.latex_cache/`，主 PDF 可同步到项目目录。
- **整理闹心的格式不一**：一键整理缩进、段内硬回车、章节分隔与空行，同时保护公式、代码和注释边界。
- **真正的双向定位与关联跳转**：源码与 PDF 通过 SyncTeX 双向定位，标签、引用和文献可关联查看。
- **贯穿写作的多种预览**：全文 PDF、输入时持续更新的悬浮公式、图片、TikZ、表格、Markdown，按文档环境生成。
- **数学文章的结构一览**：大纲按行文顺序展开；定理、定义、引理、证明和公式可集中浏览、点击定位。
- **本地快照与 Git**：保存、编译快照和版本差异随手可查，也能查看项目 Git 状态与提交。
- **全文字体一键应用**：读取本机中英文字体，自动写入主文档字体配置，减少手工维护导言区。
- **适合长时间写作的外观**：默认白天与蓝色，另有茶绿、晴空、日晷（Solarized 配套色）等强调色；编辑器高亮主题可独立切换。

[下载 Windows 和 Mac 安装包](https://github.com/Derek-Y-JQ/TeXora/releases/latest) · [项目主页](https://derek-y-jq.github.io/TeXora/)


![TeXora 夜间蓝色工作台](docs/screenshots/133-workspace.png)

## Ask 与 Agent

Ask 保留上下文选择、OCR 和修改确认。打开项目，在 AI 侧栏选择 Agent 和本机安装的 Codex 或 Claude Code，点击登录并在服务商浏览器页面完成授权。已有登录状态会自动识别。可在底部输入框直接发送消息，Shift+Enter 换行；「最近对话」按项目和服务商保存，并可恢复上下文。DeepSeek Harness 通过「打开 DeepSeek」进入该工具自带的图形界面。

## macOS 安装与构建

支持 macOS 12 及以上。Apple 芯片选 `arm64`，Intel 芯片选 `x64`。打开对应架构的 DMG，将 TeXora.app 拖入「应用程序」。签名类型见对应 Release。

编译文档需要本机 TeX 发行版。安装 [MacTeX](https://tug.org/mactex/) 后，从 Finder 打开 TeXora 即可识别 `/Library/TeX/texbin`。也可在「设置 → 宏包与 TeX 环境」指定引擎目录。中文文档可用 XeLaTeX 编译。局部预览可使用 Ghostscript 或 Poppler。编辑器支持 ⌘S 保存、⌘⇧O 打开文件、⌘⌥B 编译。

## 功能实景
### 受控 AI：先看，再决定

侧栏提供选中内容、当前文件、Skills、其他文件四个上下文入口，读取范围受设置约束，不会自动发送整个项目。Block 提供润色、检查、翻译、解释四个默认动作，名称与提示词均可自定义、恢复默认。

点击 Block AI 动作会立即展开 AI 侧栏并定位到最新消息。改写结果只提取可替换正文；附带说明或含糊的多代码块结果不会直接混入文稿。改写与翻译展示逐处差异，可切换 Diff 高亮；确认后才替换或插入。检查与解释展示独立回答，不提供覆盖正文按钮。全局提示词不再把 AI 限定为排版助手，允许数学纠错、论证检查、翻译和一般问答。历史结果可重新打开，已应用的结果显示“已修改”。

![受控 AI 改写与差异确认](docs/screenshots/133-ai.png)

<details><summary>检查回答与默认提示词设置</summary>

![独立检查回答](docs/screenshots/133-check.png)
![四个动作与恢复默认](docs/screenshots/133-ai-settings.png)

</details>

### 图片、表格、代码和伪代码，用弹窗完成

- 图片支持本地选择和剪贴板粘贴，设置尺寸、标题、标签及浮动位置后插入。
- 表格支持可视网格、Excel / CSV 粘贴、三线表和长表格，实时显示将插入的 LaTeX。
- 代码支持语言选择、行号、标题、标签以及 listings / minted 两种方案，插入前自动检测依赖、补齐缺失工具并实际试编译。
- 伪代码提供 For、For Each、While、If / Else、Else If、Repeat / Until、函数、过程、返回值和注释组件，点击插入光标处后可继续编辑。
- 代码与伪代码需要的宏包只在缺少时加入主文档导言区；在子文件中插入也不会把宏包写入正文。

![代码块编辑器](docs/screenshots/133-code.png)
![点选算法流程组件](docs/screenshots/133-algorithm.png)

<details><summary>图片、表格和 minted 编辑窗口</summary>

![图片插入](docs/screenshots/133-image.png)
![表格编辑与 CSV 导入](docs/screenshots/133-table.png)
![minted 语言与依赖检测](docs/screenshots/133-minted.png)

</details>

listings 不需要 Python。对 listings 未内置的语言会明确提示纯文本模式，可改选 minted 获取 Pygments 高亮。minted 会按需配置 TeX 宏包与高亮工具；需要 Python 时使用应用独立环境，缺少 Python 时尝试通过 Windows 包管理器安装。网络、安装权限或包管理策略阻止安装时会保留编辑内容并显示原因，可重试或切换 listings。minted 的外部程序调用仅为主动选择配置的项目开启，不改其他项目的编译权限。

依赖依据：[minted 官方项目](https://github.com/gpoore/minted)、[MiKTeX 包管理说明](https://docs.miktex.org/manual/mpm.html)。

### 公式、绘图和全文预览

本地预览优先使用原文档类、宏包、定义及编译引擎，不扫描并拼接无关类文件的内部宏。对复杂模板保留分层回退；缓存区分项目、编译引擎、导言区与内容，失败可以重试。

![输入时实时更新的悬浮公式](docs/screenshots/135-live-math.png)

### 双向 SyncTeX 与数学结构导航

双击源码行号可定位 PDF；双击 PDF 可回到源码。标签与引用面板便于查看目标，定理、定义、引理、证明和数学环境集中在数学面板，大纲按主文档 `input / include` 的实际顺序展开。数学环境和标签引用各自提供“本文件 / 整个项目”两个标签页，项目视图显示来源并可跨文件跳转，尚未保存的编辑也会纳入索引。跨文件引用按项目范围检查，避免误报未定义。

<details><summary>本文件与整个项目范围</summary>

![项目数学环境](docs/screenshots/134-math-project.png)
![项目标签与引用](docs/screenshots/134-labels-project.png)

</details>

![源码到 PDF 的实际定位](docs/screenshots/133-synctex.png)
![数学环境一览](docs/screenshots/133-math.png)

### 中间文件归档与原稿整理

`.aux / .log / .synctex / .bbl` 等过程文件集中到缓存目录。原稿整理规则可分别开关，保护 `\[ ... \]` 公式闭合处、代码环境和注释，所有编辑支持撤销。

<details><summary>缓存目录与整理规则</summary>

![编译缓存设置](docs/screenshots/133-cache.png)
![原稿整理选项](docs/screenshots/133-format.png)

</details>

### 本地快照、Git 与字体

保存及编译通过后可生成本地快照，支持差异查看和恢复；Git 面板可查看工作区变化、提交历史并提交。字体选择器读取本机字体，按中文、英文、等宽分类，可写入 fontspec / xeCJK 配置（需兼容的 TeX 引擎与已安装字体）。

<details><summary>查看快照、Git 与字体界面</summary>

![本地快照](docs/screenshots/133-history.png)
![真实示例仓库的 Git 状态](docs/screenshots/133-git.png)
![本机字体选择](docs/screenshots/133-fonts.png)

</details>

### 主题
- 夜间模式和日间模式随心换
- 多颜色搭配的 TeXora 精细工作台 UI
- 支持 Endfield 工业风主题 UI

![主题与配色](docs/screenshots/133-theme.png)


## 开始使用

1. 安装或配置 MiKTeX / TeX Live；在“设置 → 宏包与 TeX 环境”检查编译工具。PDF 预览需要 pdftoppm 或 pdftocairo，双向定位需要 SyncTeX。
2. 打开项目文件夹或内置 `samples/demo`、`samples/paper`、`samples/book`。在主文档中编译，也可编辑子文件。
3. 如需 AI，在设置中填写自己的服务商、模型、Base URL 与 API Key；自行选择上下文和 Skills。新安装的默认最大输出为 10000 Tokens。
4. 默认在启动约 5 秒后检查 GitHub Releases；两次成功检查至少间隔 24 小时，也可在设置手动检查。更新提示打开安装包下载，不会静默安装。

## 使用边界

- 需要本机 TeX 发行版与相关字体；模板、宏包和 Python 工具能否安装取决于本机权限、网络及发行版状态。
- 全文预览使用 PDF.js 渲染，可选择复制文字；扫描版 PDF 不会自动生成 OCR 文字层。双向定位依赖 SyncTeX。
- AI 检查结果需要自行核实，软件不声称完成了模型未实际执行的编译、计算或证明。
- Git 面板依赖系统 Git；未安装 Git 时仍可使用本地快照。

## 开发与验证

技术栈：Electron、Monaco Editor、Vite、系统 TeX 工具链。

```powershell
npm install
npm run build
npm test
npm run dist
```

MIT License。依赖许可与致谢见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

### 公式输入与 Overleaf 项目

- 单独输入 `\[` 或 `$$` 后按回车，立即插入配对的结束符并将光标放到公式内部。
- 行内输入 `$` 后显示浅灰色的结束 `$` 提示；按 `$`、右箭头或 Tab 接受。未接受的提示不会写入文件。
- 项目文件夹右侧的 **Overleaf** 按钮打开账号与项目窗口。先在独立的官方网页窗口登录，关闭登录窗口后刷新项目，再选择“加载本地编辑”。本地副本保存在 TeXora 用户数据目录中，可离线编辑。
- 保存仅写本地。回传时点击 **检查并同步**，逐项查看上传、下载和删除，然后点击 **确认同步**。同步前后校验文件；同一文件两端都改变时阻止同步，需先手动合并。替换或删除的本地内容先备份到用户数据目录的 `overleaf/backups`。
- 这是手动文件同步，不提供协作者同时编辑时的实时合并。回传期间请暂停对相同文件的在线编辑。只读项目可以导入及拉取；没有写入权限时禁止上传。
- 登录 Cookie 仅保存在独立的本机浏览器会话中，不交给 AI 或应用渲染进程；“退出账号”清除该会话，本地副本保留。Overleaf 对接使用其网页登录与网页接口，网站接口变化、网络限制、验证码或登录策略可能要求重新登录或更新适配。当前实现面向官方 `www.overleaf.com`，不包含自托管实例。

![Overleaf 下载进度界面示例（测试数据）](docs/screenshots/136-overleaf-progress.png)

接口依据：[Overleaf 项目列表](https://github.com/overleaf/overleaf/blob/main/services/web/app/src/Features/Project/ProjectController.mjs)、[文件上传](https://github.com/overleaf/overleaf/blob/main/services/web/app/src/Features/Uploads/ProjectUploadController.mjs)、[项目连接](https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/ide-react/connection/connection-manager.ts)。此接入不要求用户提供 Overleaf 密码给 TeXora，也不依赖付费项目的 Git 接入。
