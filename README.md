# TeXora 1.3.6 · 本地优先的 LaTeX 写作工作台

TeXora 是面向 Windows 的本地 LaTeX 编辑器，把源码、PDF、数学结构和可控 AI 放进同一个工作台。它着重解决写作过程中反复打断思路的小事：

- **受控 AI 赋能，主动权仍在自己**：选上下文、选 Skills、检查差异，再决定是否写入；检查与解释作为回答展示。
- **图片、表格、代码块省心插入**：粘贴图片、编辑表格、选择 listings / minted、点选伪代码流程组件；代码块所需宏包自动补入主文档。
- **归档闹心的中间文件**：编译产物集中在 `.latex_cache/`，主 PDF 可同步到项目目录。
- **整理闹心的格式不一**：一键整理缩进、段内硬回车、章节分隔与空行，同时保护公式、代码和注释边界。
- **真正的双向定位与关联跳转**：源码与 PDF 通过 SyncTeX 双向定位，标签、引用和文献可关联查看。
- **贯穿写作的多种预览**：全文 PDF、输入时持续更新的悬浮公式、图片、TikZ、表格、Markdown，按文档环境生成。
- **数学文章的结构一览**：大纲按行文顺序展开；定理、定义、引理、证明和公式可集中浏览、点击定位。
- **本地快照与 Git**：保存、编译快照和版本差异随手可查，也能查看项目 Git 状态与提交。
- **全文字体一键应用**：读取本机中英文字体，自动写入主文档字体配置，减少手工维护导言区。
- **适合长时间写作的外观**：默认夜间与蓝色，另有茶绿、晴空、日晷（Solarized 配套色）等强调色；编辑器高亮主题可独立切换。

[下载 Windows 安装包](https://github.com/Derek-Y-JQ/TeXora/releases/latest) · [项目主页](https://github.com/Derek-Y-JQ/TeXora)

> 文档编辑、编译与版本管理在本机完成。使用 AI 时，所选内容及已选 Skills 会发送至配置的模型服务商。软件不内置模型额度。

![TeXora 夜间蓝色工作台](docs/screenshots/133-workspace.png)

## 功能实景

以下图片截取自本版本的实际界面及隔离示例项目；AI 回答与改写内容为界面演示示例，不代表模型正确性保证。

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

### 日夜主题与编辑器高亮

日夜主题可跟随系统。茶绿、晴空、日晷三套新配色与已有强调色一起可选；日晷使用 Solarized 风格的青蓝底色及金色、青绿色搭配。代码高亮可在编辑区右上角直接切换。

![主题与配色](docs/screenshots/133-theme.png)

## 1.3.6 更新

- 输入 `\[` 或 `$$` 后按回车立即补齐结束符，光标进入公式内部；兼容 Windows 换行与已有配对。
- 行内公式的结束 `$` 用浅灰色提示，按 `$`、右箭头或 Tab 接受；未接受时不写入文件。
- 项目文件夹按钮右侧新增 Overleaf 入口，支持官方网页登录、项目列表与本地加载编辑。
- Overleaf 保存只写本地；检查上传、下载、删除列表并确认后，才同步原项目。同文件两端修改、只读权限及确认后内容变化均会阻止回传；支持失败后重试及本地替换备份。
- 修复 Electron 后台请求返回空 `Response.url` 时，将已登录会话误判为未登录的问题；使用实际响应状态与受控重定向判断登录状态，区分会话过期、项目权限和网页验证；项目下载时限延长至 5 分钟，下载失败不再提示退出重登。
- 已通过同步模拟测试、桌面键盘与界面测试、会话隔离及安装包运行检查。**已用本机保存的真实登录会话验证项目列表及项目下载加载；向云端回传尚未以真实账号实测**。其网页接口变化可能需要更新适配。

## 1.3.5 更新

- 公式悬浮预览跟随鼠标目标，移出公式或编辑区即关闭，移动到另一处公式无需点击即可切换；键盘输入时跟随当前公式持续更新，旧光标任务及本地编译结果不会重新弹出已关闭卡片。
- 公式使用持续显示的悬浮预览：可即时渲染的内容不调用本地 TeX；未知命令标红且保留周围公式排版，语法错误直接标红，仅不支持即时渲染的内容在停顿后尝试本地 TeX；仅移动光标不会重新加载或误报正在编辑。
- 删除编辑区的行间预览占位，公式、TikZ 和表格统一使用悬浮卡片，避免编辑区上下跳动。表格、tabular / tblr / longtable 和 TikZ 支持在环境正文触发，不限于 begin 行；修复自动滚动取消预览及旧异步结果回填。公式卡片避开输入行并支持关闭。
- 修复关于窗口图标，设置按钮左侧新增独立的检查更新按钮。
- “本地字体映射”改名为“文档排版字体”，明确其影响 PDF 字体；从子文件操作也会更新主文档，替换现有字体命令并选择兼容编译引擎。
- 编号样式支持在 enumerate 正文、嵌套列表中操作，合并既有列表选项，自动在主文档补齐 enumitem；中文编号补齐 CTeX 支持。

即时公式层使用本地打包的 [KaTeX](https://katex.org/docs/api)，复杂模板和宏定义继续使用本机 TeX 工具链；无需联网渲染公式。

![嵌套列表编号样式](docs/screenshots/135-enumerate.png)

## 1.3.4 更新

- 修复快速切换项目时旧 PDF 覆盖新项目、关闭后预览残留的问题；异步加载与编译结果按项目会话隔离。
- 重开项目自动匹配已有 PDF 与 SyncTeX，支持子目录主文档与用户缓存，无需重复编译即可恢复双向定位。
- 优先查找主文档对应的编译产物，按 PDF 指纹缓存页面与链接；未变动的 PDF 直接复用预览，修复源码旁 PDF 的渲染输出路径。

- 点击 Block AI 动作立即展开左侧 AI 助手，滚动到最新请求 / 消息。
- 改写与翻译增加替换正文格式约束和解包校验，清理兼容回复中的围栏说明，无法可靠分离时阻止进入 Diff；检查与解释仍保留自然语言回答。
- 更新默认润色提示词，移除“另附问题说明”的冲突要求，仅迁移旧默认值，保留自定义提示词。
- 数学环境、标签与引用新增本文件 / 整个项目标签页，支持未保存内容、来源路径、跨文件定位及项目引用校验。

## 1.3.3 更新

- 新增代码块与伪代码块弹窗、快捷栏入口、依赖检测安装、试编译验证与主文档宏包去重补齐。
- 更新全局提示词；四个默认动作为润色、检查、翻译、解释，检查与解释默认只展示回答。
- 新增系统提示词和 Block 动作恢复默认按钮，保留用户自定义提示词；Block 按钮悬浮仅显示名称。
- 默认夜间 / 蓝色，新增茶绿、晴空和日晷配色。
- 修复并发预览写权限探针引发的缓存误切换，增强 SyncTeX 使用实际编译产物的定位能力。
- 更新功能截图与 README，移除旧版更新记录。

## 安装与开始使用

1. 从 [Releases](https://github.com/Derek-Y-JQ/TeXora/releases/latest) 下载 `TeXora-Setup-1.3.6.exe`，退出旧程序后安装。安装程序可选择目录，保留用户数据。
2. 安装或配置 MiKTeX / TeX Live；在“设置 → 宏包与 TeX 环境”检查编译工具。PDF 预览需要 pdftoppm 或 pdftocairo，双向定位需要 SyncTeX。
3. 打开项目文件夹或内置 `samples/demo`、`samples/paper`、`samples/book`。在主文档中编译，也可编辑子文件。
4. 如需 AI，在设置中填写自己的服务商、模型、Base URL 与 API Key；自行选择上下文和 Skills。新安装的默认最大输出为 10000 Tokens。

默认在启动约 5 秒后检查 GitHub Releases；两次成功检查至少间隔 24 小时，也可在设置手动检查。更新提示打开安装包下载，不会静默安装。

## 使用边界

- 需要本机 TeX 发行版与相关字体；模板、宏包和 Python 工具能否安装取决于本机权限、网络及发行版状态。
- PDF 面板使用光栅化预览，当前不提供 PDF 文字选择与全文搜索；定位使用 SyncTeX。
- AI 检查结果需要自行核实，软件不声称完成了模型未实际执行的编译、计算或证明。
- Git 面板依赖系统 Git；未安装 Git 时仍可使用本地快照。Markdown 转换为基础实现，复杂语法需微调。

## 开发与验证

技术栈：Electron、Monaco Editor、Vite、系统 TeX 工具链。

```powershell
npm install
npm run build
npm test
npm run verify:134
npm run dist
```

`verify:134` 在隔离项目和本地模拟 AI 服务中验证新标签页、跨文件定位、最新消息滚动和改写正文校验，不调用付费模型。`verify:133` 在隔离项目中实际插入 listings、minted 与算法，验证宏包位置、完整 PDF 编译、提示词恢复及主题，并截取功能图片。首次运行可联网补齐代码高亮依赖。更多检查包括 `npm run verify:131`（本地模拟 AI，不调用付费模型）、`node scripts/verify-preview.cjs` 与 `node scripts/verify-code-tools.cjs`。

MIT License。依赖许可与致谢见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

### 公式输入与 Overleaf 项目

- 单独输入 `\[` 或 `$$` 后按回车，立即插入配对的结束符并将光标放到公式内部。
- 行内输入 `$` 后显示浅灰色的结束 `$` 提示；按 `$`、右箭头或 Tab 接受。未接受的提示不会写入文件。
- 项目文件夹右侧的 **Overleaf** 按钮打开账号与项目窗口。先在独立的官方网页窗口登录，关闭登录窗口后刷新项目，再选择“加载本地编辑”。本地副本保存在 TeXora 用户数据目录中，可离线编辑。
- 保存仅写本地。回传时点击 **检查并同步**，逐项查看上传、下载和删除，然后点击 **确认同步**。同步前后校验文件；同一文件两端都改变时阻止同步，需先手动合并。替换或删除的本地内容先备份到用户数据目录的 `overleaf/backups`。
- 这是手动文件同步，不提供协作者同时编辑时的实时合并。回传期间请暂停对相同文件的在线编辑。只读项目可以导入及拉取；没有写入权限时禁止上传。
- 登录 Cookie 仅保存在独立的本机浏览器会话中，不交给 AI 或应用渲染进程；“退出账号”清除该会话，本地副本保留。Overleaf 对接使用其网页登录与网页接口，网站接口变化、网络限制、验证码或登录策略可能要求重新登录或更新适配。当前实现面向官方 `www.overleaf.com`，不包含自托管实例。

接口依据：[Overleaf 项目列表](https://github.com/overleaf/overleaf/blob/main/services/web/app/src/Features/Project/ProjectController.mjs)、[文件上传](https://github.com/overleaf/overleaf/blob/main/services/web/app/src/Features/Uploads/ProjectUploadController.mjs)、[项目连接](https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/ide-react/connection/connection-manager.ts)。此接入不要求用户提供 Overleaf 密码给 TeXora，也不依赖付费项目的 Git 接入。
