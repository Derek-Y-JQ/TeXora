/**
 * Settings dialog — six categories matching the product spec:
 * editor/block, build & preview, packages & TeX, AI, appearance & keys, files.
 */
import { ctx } from './ctx.js';
import { $, $$, icon, escapeHtml, toast, formatBytes, debounce } from './util.js';

const PROVIDER_PRESETS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o4-mini'] },
  anthropic: { label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'] },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  moonshot: { label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k2-0905-preview', 'moonshot-v1-128k'] },
  custom: { label: '自定义（OpenAI 兼容）', baseUrl: '', models: [] }
};

const MIRRORS = [
  ['https://mirrors.tuna.tsinghua.edu.cn/CTAN/', '清华大学 TUNA'],
  ['https://mirrors.ustc.edu.cn/CTAN/', '中国科学技术大学'],
  ['https://mirrors.aliyun.com/CTAN/', '阿里云'],
  ['https://mirror.ctan.org/', 'CTAN 官方（自动选择）'],
  ['', '不指定镜像']
];

const SECTIONS = [
  { id: 'editor', title: '编辑器与交互', icon: 'code', group: '工作区' },
  { id: 'build', title: '编译与预览', icon: 'play', group: '工作区' },
  { id: 'tex', title: '宏包与 TeX 环境', icon: 'layers', group: '工作区' },
  { id: 'ai', title: 'AI 助手', icon: 'sparkles', group: '智能' },
  { id: 'appearance', title: '外观与主题', icon: 'palette', group: '个性化' },
  { id: 'keys', title: '快捷键', icon: 'keyboard', group: '个性化' },
  { id: 'files', title: '文件与备份', icon: 'files', group: '数据' },
  { id: 'about', title: '关于与环境', icon: 'info', group: '数据' }
];

export function createSettingsUI() {
  let currentSection = 'editor';
  let wrap = null;

  function settingValue(path) {
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), ctx.state.settings);
  }

  function switchRow(path, name, desc) {
    const on = !!settingValue(path);
    return `<div class="setting-row">
      <div class="setting-main"><div class="setting-name">${escapeHtml(name)}</div>${desc ? `<div class="setting-desc">${escapeHtml(desc)}</div>` : ''}</div>
      <div class="setting-control"><button class="switch ${on ? 'on' : ''}" data-setting="${path}" data-type="bool" role="switch" aria-checked="${on}"></button></div>
    </div>`;
  }

  function selectRow(path, name, desc, options, extra = '') {
    const val = String(settingValue(path) ?? '');
    return `<div class="setting-row">
      <div class="setting-main"><div class="setting-name">${escapeHtml(name)}</div>${desc ? `<div class="setting-desc">${escapeHtml(desc)}</div>` : ''}</div>
      <div class="setting-control ${extra.includes('wide') ? 'wide' : ''}">
        <select class="input" data-setting="${path}" data-type="string">
          ${options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${String(v) === val ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }

  function inputRow(path, name, desc, { type = 'text', placeholder = '', width = '', mono = false } = {}) {
    const val = settingValue(path) ?? '';
    return `<div class="setting-row">
      <div class="setting-main"><div class="setting-name">${escapeHtml(name)}</div>${desc ? `<div class="setting-desc">${escapeHtml(desc)}</div>` : ''}</div>
      <div class="setting-control" style="${width ? `width:${width}px` : 'width:240px'}">
        <input class="input ${mono ? 'input-mono' : ''}" type="${type}" data-setting="${path}" data-type="${type === 'number' ? 'number' : 'string'}" value="${escapeHtml(String(val))}" placeholder="${escapeHtml(placeholder)}" />
      </div>
    </div>`;
  }

  function textAreaRow(path, name, desc, rows = 4) {
    const val = escapeHtml(String(settingValue(path) ?? ''));
    return `<div class="setting-row" style="align-items:flex-start">
      <div class="setting-main"><div class="setting-name">${escapeHtml(name)}</div>${desc ? `<div class="setting-desc">${escapeHtml(desc)}</div>` : ''}</div>
      <div class="setting-control" style="width:360px"><textarea class="input" rows="${rows}" data-setting="${path}" data-type="string">${val}</textarea></div>
    </div>`;
  }

  const group = (title) => `<div class="setting-group">${escapeHtml(title)}</div>`;

  function renderEditor() {
    const s = ctx.state.settings;
    return `
      <h2 class="settings-section-title">编辑器与交互</h2>
      <p class="settings-section-desc">控制 Block 化编辑、自动补全、内联预览与源码整理规则。所有改动即时生效。</p>
      ${group('Block 模块化模式')}
      <div class="setting-card">
        ${switchRow('editor.blockMode', 'Block 模块化模式', '将独立段落与最外层环境识别为可拖拽的视觉块（类 Notion 体验）')}
        ${switchRow('editor.blockDrag', 'Block 拖拽重排', '按住块左侧手柄上下拖动，实时调整源码位置')}
        ${switchRow('editor.folding', '环境折叠', '在所有 \\begin 环境与章节左侧提供折叠按钮')}
      </div>
      ${group('编辑器基础')}
      <div class="setting-card">
        ${switchRow('editor.lineNumbers', '显示行号', '')}
        ${switchRow('editor.relativeLineNumbers', '相对行号', '以当前光标行为基准显示相对行号')}
        ${selectRow('editor.indentSize', '自动缩进格数', '环境内容自动缩进的空格数', [['2', '2 空格'], ['4', '4 空格']])}
        ${switchRow('editor.wordWrap', '自动换行', '长段落按窗口宽度软换行')}
        ${switchRow('editor.ignoreWarnings', '忽略警告波浪线', '编辑区不显示黄色警告线，底部问题栏仍保留全部警告')}
        ${switchRow('editor.minimap', '显示代码缩略图', '右侧 minimap 概览')}
        ${switchRow('editor.ligatures', '编程连字（Ligatures）', '启用 Cascadia Code / Fira Code 的连字特性')}
        ${inputRow('editor.fontSize', '源码区字号（px）', '', { type: 'number', width: 100 })}
        ${inputRow('editor.lineHeight', '行高倍数', '默认 1.72', { type: 'number', width: 100 })}
      </div>
      ${group('自动补全与闭合')}
      <div class="setting-card">
        ${switchRow('editor.autoCloseEnv', '\\begin 自动生成 \\end', '输入 \\begin{env} 后回车自动补全结束标记并缩进光标')}
        ${switchRow('editor.envErrorHint', '环境错误提示', '未知环境名或首尾不匹配时在 \\begin 处显示波浪线')}
        ${switchRow('editor.listItemAuto', '列表回车自动 \\item', '在 itemize / enumerate 内按回车自动续写 \\item，空项回车则退出列表')}
        ${switchRow('editor.autoCloseBrackets', '括号自动配对', '')}
        ${switchRow('editor.autoCloseQuotes', '引号自动配对', '')}
      </div>
      ${group('内联与悬浮预览')}
      <div class="setting-card">
        ${switchRow('editor.inlineMathPreview', '数学公式预览', '悬浮或行间公式实时渲染卡片（由本地 pdftocairo 渲染）')}
        ${switchRow('editor.imagePreview', '插图预览', '悬浮 \\includegraphics 显示缩略图与文件大小')}
        ${switchRow('editor.tikzPreview', 'TikZ 示意图预览', '独立局部编译 tikzpicture 环境')}
        ${switchRow('editor.tablePreview', '表格预览', '局部渲染 tabular / tblr 环境')}
        ${switchRow('editor.refPreview', '引用与文献预览', '悬浮 \\ref / \\cite 显示目标内容')}
      </div>
      ${group('格式整理规则')}
      <div class="setting-card">
        ${switchRow('editor.formatter.mergeParagraphLines', '合并段内硬回车', '把同一自然段内被硬回车截断的多行合并为单行')}
        ${switchRow('editor.formatter.beautifyEnvironments', '环境缩进规范化', '按 begin / end 层级对齐缩进')}
        ${switchRow('editor.formatter.sectionBanners', '章节分界注释块', '在章节命令前插入注释分隔线')}
        ${switchRow('editor.formatter.preambleDivider', '导言区与正文分界线', '自动维护 “Preamble / Document body” 注释线')}
        ${switchRow('editor.formatter.collapseBlankLines', '压缩多余空行', '连续空行最多保留一行')}
        ${switchRow('editor.formatter.cjkPunct', '默认启用中英文标点替换', '整理文档时同时修复中文标点')}
        ${switchRow('editor.formatter.displaystyle', '整理时行内公式 \\displaystyle 化', '')}
      </div>
      ${group('保存与检查')}
      <div class="setting-card">
        ${switchRow('editor.autosave', '自动保存', '编辑停止后自动写盘')}
        ${inputRow('editor.autosaveDelay', '自动保存延迟（ms）', '', { type: 'number', width: 110 })}
        ${switchRow('editor.chktex', 'ChkTeX 静态检查', '编译后自动运行 ChkTeX 语法规范检查')}
      </div>`;
  }

  function renderBuild() {
    return `
      <h2 class="settings-section-title">编译与预览</h2>
      <p class="settings-section-desc">编译引擎、文献工具链、自动编译、过程文件隔离与 SyncTeX 交互方式。</p>
      ${group('引擎与工具链')}
      <div class="setting-card">
        ${switchRow('build.autoEngine', '根据项目自动选择引擎', '打开项目时识别中文/ctex/fontspec：中文项目用 XeLaTeX，纯英文项目用 pdfLaTeX')}
        ${selectRow('build.engine', '默认编译引擎', '全局默认，可在工具栏临时切换', [['xelatex', 'XeLaTeX（推荐，中文友好）'], ['pdflatex', 'pdfLaTeX'], ['lualatex', 'LuaLaTeX'], ['latexmk', 'latexmk（自动多遍）']])}
        ${selectRow('build.bibliography', '文献引擎', '', [['biber', 'Biber（biblatex）'], ['bibtex', 'BibTeX（传统）']])}
        ${selectRow('build.recipe', '编译方式', '', [['auto', '自动（按引擎多遍编译）'], ['latexmk', 'latexmk 统一调度'], ['xelatex', '固定 XeLaTeX'], ['pdflatex', '固定 pdfLaTeX'], ['lualatex', '固定 LuaLaTeX']])}
        ${inputRow('build.maxRuns', '最大编译遍数', '用于交叉引用稳定', { type: 'number', width: 100 })}
        ${inputRow('build.timeout', '单次编译超时（秒）', '', { type: 'number', width: 100 })}
        ${inputRow('build.extraArgs', '附加编译参数', '例如 -shell-escape，留空则不添加', { placeholder: '-shell-escape' })}
      </div>
      ${group('自动编译')}
      <div class="setting-card">
        ${switchRow('build.livePreview', '自动编译（Auto Build）', '停止输入后自动增量编译并刷新 PDF')}
        ${inputRow('build.liveDelay', '实时触发延迟（ms）', '默认 900ms', { type: 'number', width: 110 })}
        ${switchRow('build.buildOnSave', '保存时自动编译', '')}
        ${switchRow('build.autoDetectRoot', '自动识别主文档', '在子文件中编译时自动从含 \\documentclass 的主文档发起')}
      </div>
      ${group('过程文件与清理')}
      <div class="setting-card">
        ${inputRow('build.cacheDir', '隐藏缓存目录', '相对于项目根目录，存放 .aux/.log/.synctex 等过程文件', { mono: true })}
        ${switchRow('build.pdfInRoot', '在项目根目录同步一份 PDF', '便于分享与外部打开')}
        ${switchRow('build.cleanOnExit', '退出时自动清理过程文件', '')}
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">手动清理</div><div class="setting-desc">清除缓存目录中的过程文件，解决因缓存损坏导致的编译卡死</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="setClean">${icon('broom')}清理过程文件</button></div>
        </div>
      </div>
      ${group('SyncTeX 双向定位')}
      <div class="setting-card">
        ${selectRow('build.forwardTrigger', '正向搜索（源码 → PDF）', '', [['line-dblclick', '双击行号'], ['ctrl-enter', 'Ctrl + Enter'], ['manual', '仅菜单命令']])}
        ${selectRow('build.inverseTrigger', '反向搜索（PDF → 源码）', '', [['pdf-dblclick', '双击 PDF 内容'], ['alt-click', 'Alt + 单击'], ['manual', '仅菜单命令']])}
        ${inputRow('build.highlightColor', '定位高亮颜色', 'CSS 颜色值', { mono: true, width: 160 })}
      </div>`;
  }

  function renderTex() {
    const info = ctx.state.texInfo || {};
    return `
      <h2 class="settings-section-title">宏包与 TeX 环境</h2>
      <p class="settings-section-desc">自动探测本地 TeX 发行版，管理宏包安装策略、CTAN 镜像与本地字体映射。</p>
      ${group('TeX 发行版')}
      <div class="setting-card">
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">当前发行版</div><div class="setting-desc">${escapeHtml(info.version || '尚未检测到版本信息')}</div></div>
          <div class="setting-control"><span class="chip accent">${escapeHtml((info.distro || 'none').toUpperCase())}</span></div>
        </div>
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">可执行工具</div><div class="setting-desc">编译 / 定位 / 预览所需的命令行工具</div></div>
          <div class="setting-control" style="flex-wrap:wrap;justify-content:flex-end;max-width:420px">
            ${Object.entries(info.engines || {})
              .map(([k, ok]) => `<span class="chip ${ok ? 'accent' : ''}" title="${ok ? '可用' : '未找到'}">${k}</span>`)
              .join('')}
          </div>
        </div>
        ${inputRow('tex.binPath', 'TeX 可执行文件目录', '留空则自动在 PATH 与常见安装位置中探测', { mono: true, placeholder: 'C:\\...\\MiKTeX\\miktex\\bin\\x64', width: 360 })}
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">重新探测</div><div class="setting-desc">修改安装路径或新装宏包后刷新环境信息</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="setDetectTex">${icon('refresh')}检测 TeX 环境</button></div>
        </div>
      </div>
      ${group('缺失宏包自动安装')}
      <div class="setting-card">
        ${selectRow('build.autoInstallMissing', '安装策略', '', [['ask', '安装前询问'], ['auto', '自动下载安装并重连编译'], ['never', '仅提示不安装']])}
        ${selectRow('build.mirror', 'CTAN 镜像源', '国内网络建议使用清华或中科大镜像', MIRRORS)}
      </div>
      ${group('宏包查询与安装')}
      <div class="setting-card" style="padding:12px 16px">
        <div class="row" style="margin-bottom:8px">
          <div class="search-input-wrap" style="flex:1">${icon('search')}<input class="input input-sm" id="pkgSearch" placeholder="搜索已安装宏包，或输入名称直接安装…" /></div>
          <button class="btn btn-sm" id="pkgInstall">${icon('download')}安装</button>
        </div>
        <div class="pkg-result" id="pkgResult"><div class="field-hint">已安装宏包：${(ctx.state.packages || []).length} 个</div></div>
      </div>
      ${group('本地字体映射')}
      <div class="setting-card">
        ${['latin', 'cjk', 'mono']
          .map((kind) => {
            const label = { latin: '英文主字体', cjk: '中文主字体', mono: '等宽字体' }[kind];
            const name = ctx.state.settings.tex.fonts[kind] || '';
            return `<div class="setting-row">
              <div class="setting-main"><div class="setting-name">${label}</div><div class="setting-desc">写入 ${kind === 'cjk' ? '\\setCJKmainfont' : kind === 'mono' ? '\\setmonofont' : '\\setmainfont'}（fontspec）</div></div>
              <div class="setting-control"><button class="btn btn-sm" data-font="${kind}">${icon('type')}<span style="font-family:'${escapeHtml(name)}'">${escapeHtml(name || '选择字体…')}</span></button></div>
            </div>`;
          })
          .join('')}
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">刷新系统字体缓存</div><div class="setting-desc">重新读取 Windows 本地字体列表（中英文分类）</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="setRefreshFonts">${icon('refresh')}刷新字体</button></div>
        </div>
      </div>`;
  }

  function renderAi() {
    const ai = ctx.state.settings.ai;
    const preset = PROVIDER_PRESETS[ai.provider] || PROVIDER_PRESETS.deepseek;
    return `
      <h2 class="settings-section-title">AI 助手</h2>
      <p class="settings-section-desc">支持 OpenAI、DeepSeek、Claude、Gemini 与任意 OpenAI 兼容接口。密钥仅保存在本机设置文件中。</p>
      ${group('模型服务商')}
      <div class="setting-card">
        ${selectRow('ai.provider', '服务商', '', Object.entries(PROVIDER_PRESETS).map(([id, p]) => [id, p.label]))}
        ${inputRow('ai.baseUrl', 'Base URL', 'OpenAI 兼容接口地址（Anthropic / Gemini 走各自原生协议）', { mono: true, width: 300 })}
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">API Key</div><div class="setting-desc">仅保存在本机，不会上传到除服务商外的任何地方</div></div>
          <div class="setting-control" style="width:300px">
            <input class="input input-mono" type="password" data-setting="ai.apiKey" data-type="string" value="${escapeHtml(ai.apiKey || '')}" placeholder="sk-..." />
            <button class="icon-btn" id="aiToggleKey" title="显示 / 隐藏">${icon('eye')}</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">模型名称</div><div class="setting-desc">可手动输入任意模型 ID</div></div>
          <div class="setting-control" style="width:260px">
            <input class="input input-mono" list="aiModels" data-setting="ai.model" data-type="string" value="${escapeHtml(ai.model || '')}" />
            <datalist id="aiModels">${(preset.models || []).map((m) => `<option value="${m}"></option>`).join('')}</datalist>
          </div>
        </div>
        ${inputRow('ai.temperature', 'Temperature', '0–1，学术场景建议 0.3–0.5', { type: 'number', width: 100 })}
        ${inputRow('ai.maxTokens', '最大输出 Tokens', '', { type: 'number', width: 110 })}
        ${inputRow('ai.timeout', '请求超时（秒）', '', { type: 'number', width: 110 })}
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">连接测试</div><div class="setting-desc">发送一条极短请求验证 Base URL / Key / 模型名</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="aiTest">${icon('send')}测试连接</button></div>
        </div>
      </div>
      ${group('全局系统提示词')}
      <div class="setting-card">${textAreaRow('ai.systemPrompt', 'System Prompt', '限定学术语气、禁止修改公式符号定义、输出语言偏好等', 5)}</div>
      ${group('上下文与 Skills')}
      <div class="setting-card">
        ${selectRow('ai.contextScope', '上下文读取范围', '', [['selection', '仅选中块'], ['file', '当前完整文件'], ['file-with-preamble', '当前文件 + 导言区'], ['project', '允许跨文件检索整个项目']])}
        ${switchRow('ai.crossFile', '允许跨文件读取（@文件名 / 自动检索）', '携带其他 .tex / .bib / .md 内容以保证术语一致')}
        ${switchRow('ai.includePreamble', '携带导言区自定义宏', '包含 \\newcommand 等定义，避免破坏符号体系')}
      </div>
      <div class="setting-card" style="padding:12px 16px">
        <div class="row" style="margin-bottom:8px">
          <div class="setting-name" style="flex:1">Skills 规则库</div>
          <button class="btn btn-sm" id="skillAdd">${icon('plus')}导入 Skill 文档</button>
        </div>
        <div id="skillList" class="skill-list"><div class="field-hint">正在加载…</div></div>
      </div>
      ${group('Block AI 快捷动作')}
      <div class="setting-card" style="padding:12px 16px">
        <div id="blockActions" class="block-actions"></div>
        <button class="btn btn-sm" id="blockActionAdd" style="margin-top:8px">${icon('plus')}新增动作</button>
      </div>
      ${group('多模态 OCR')}
      <div class="setting-card">
        ${inputRow('ai.ocrModel', 'OCR / 多模态模型', '用于截图转 LaTeX，留空则沿用当前模型（需支持图片输入）', { mono: true, width: 260 })}
      </div>`;
  }

  function editorFontSelect() {
    const current = ctx.state.settings?.editor?.editorFont || 'Cascadia Code';
    const list = Array.from(new Set([current, ...(ctx.state.systemFonts || []), 'Cascadia Code', 'JetBrains Mono', 'Consolas', 'Fira Code'])).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const opts = list.map((f) => '<option value="' + escapeHtml(f) + '"' + (f === current ? ' selected' : '') + '>' + escapeHtml(f) + '</option>').join('');
    return '<div class="setting-row"><div class="setting-main"><div class="setting-name">编辑区代码字体</div><div class="setting-desc">从本机已安装字体中选择（优先等宽字体）</div></div><div class="setting-control"><select class="input" data-setting="editor.editorFont" data-type="string">' + opts + '</select></div></div>';
  }

  function renderAppearance() {
    const s = ctx.state.settings;
    return `
      <h2 class="settings-section-title">外观与主题</h2>
      <p class="settings-section-desc">两套完整主题（Daylight / Midnight），可自定义强调色、界面缩放与 PDF 阅读配色。</p>
      ${group('主题')}
      <div class="theme-cards">
        <button class="theme-card ${s.appearance.theme === 'light' ? 'active' : ''}" data-theme-choice="light">
          <div class="theme-swatch light"><span></span><span></span><span></span></div>
          <div class="theme-name">${icon('sun')}Daylight · 白天</div>
          <div class="theme-desc">明亮通透，适合白天与投影</div>
        </button>
        <button class="theme-card ${s.appearance.theme === 'dark' ? 'active' : ''}" data-theme-choice="dark">
          <div class="theme-swatch dark"><span></span><span></span><span></span></div>
          <div class="theme-name">${icon('moon')}Midnight · 夜晚</div>
          <div class="theme-desc">低对比深色，长时间写作更舒适</div>
        </button>
        <button class="theme-card ${s.appearance.theme === 'system' ? 'active' : ''}" data-theme-choice="system">
          <div class="theme-swatch system"><span></span><span></span><span></span></div>
          <div class="theme-name">${icon('refresh')}跟随系统</div>
          <div class="theme-desc">自动匹配 Windows 应用模式</div>
        </button>
      </div>
      ${group('代码外观')}
      <div class="setting-card">
        ${editorFontSelect()}
        ${selectRow('appearance.codeTheme', '代码高亮主题', '预设配色；选「跟随日夜」时自动切换', [['auto', '跟随日夜（默认）'], ['one-dark', 'One Dark'], ['github', 'GitHub Dark'], ['monokai', 'Monokai'], ['solarized', 'Solarized Light'], ['github-light', 'GitHub Light'], ['one-light', 'One Light'], ['quiet-light', 'Quiet Light']])}
        ${textAreaRow('appearance.customCss', '自定义 CSS', '高级：覆盖界面或编辑器样式，保存后立即生效', 6)}
      </div>
      ${group('强调色')}
      <div class="accent-row">
        ${[['violet', '#8b7cf8'], ['blue', '#3b82f6'], ['emerald', '#10b981'], ['amber', '#f59e0b'], ['rose', '#f43f5e']]
          .map(
            ([id, color]) => `<button class="accent-dot ${s.appearance.accent === id ? 'active' : ''}" data-accent-choice="${id}" style="--dot:${color}" title="${id}"></button>`
          )
          .join('')}
      </div>
      ${group('界面')}
      <div class="setting-card">
        ${selectRow('appearance.uiScale', '界面缩放', '', [['90', '90%'], ['100', '100%'], ['110', '110%'], ['125', '125%']])}
        ${switchRow('appearance.compact', '紧凑模式', '压缩工具栏与列表间距，单屏显示更多内容')}
        ${switchRow('appearance.reduceMotion', '减少动效', '关闭大部分过渡与动画')}
      </div>
      ${group('PDF 阅读')}
      <div class="setting-card">
        ${switchRow('appearance.pdfInvertInDark', '暗色主题下 PDF 反色', '夜间阅读时柔和反色，保持图片可辨识')}
        ${selectRow('appearance.pdfZoom', '默认缩放模式', '', [['100', '适合宽度（100%）'], ['80', '缩小（80%）'], ['120', '放大（120%）']])}
      </div>`;
  }

  function renderKeys() {
    const keys = ctx.commands.list.filter((c) => !c.hidden);
    const groups = new Map();
    for (const c of keys) {
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push(c);
    }
    const custom = ctx.state.settings.keys.custom || {};
    return `
      <h2 class="settings-section-title">快捷键</h2>
      <p class="settings-section-desc">选择经典编辑器预设，或为任意命令自定义按键绑定（按下组合键后立即生效）。</p>
      ${group('预设方案')}
      <div class="setting-card">
        ${selectRow('keys.preset', '快捷键预设', '', [['vscode', 'VS Code 风格'], ['winedt', 'WinEdt 风格'], ['texifier', 'Texifier 风格'], ['vim', 'Vim 风格（部分）']])}
        <div class="field-hint" style="padding:8px 0">预设会调整编译、保存、加粗等主快捷键；自定义绑定拥有最高优先级。</div>
      </div>
      ${group('命令绑定')}
      <div class="setting-card keymap-card" style="max-height:420px;overflow:auto">
        ${Array.from(groups)
          .map(
            ([g, items]) => `<div class="keymap-group"><div class="section-label" style="padding-left:0">${escapeHtml(g)}</div>
          ${items
            .map(
              (c) => `<div class="keymap-row">
              <span>${escapeHtml(c.title)}</span>
              <input class="input input-sm input-mono keymap-input" data-cmd-id="${c.id}" value="${escapeHtml(custom[c.id] ?? c.keys ?? '')}" placeholder="点击后按键" />
            </div>`
            )
            .join('')}</div>`
          )
          .join('')}
      </div>`;
  }

  function renderFiles() {
    return `
      <h2 class="settings-section-title">文件与备份</h2>
      <p class="settings-section-desc">自动保存、本地快照保留策略、图片粘贴路径与系统文件关联。</p>
      ${group('保存')}
      <div class="setting-card">
        ${switchRow('editor.autosave', '编辑自动保存', '停止输入后自动写盘，不弹提示')}
        ${inputRow('editor.autosaveDelay', '自动保存延迟（ms）', '', { type: 'number', width: 110 })}
        ${inputRow('files.imageDir', '图片粘贴保存目录', '相对于项目根目录', { mono: true })}
        ${inputRow('files.defaultDocClass', '新建文档默认文档类', '', { mono: true })}
      </div>
      ${group('本地历史')}
      <div class="setting-card">
        ${switchRow('files.historyEnabled', '启用本地时间轴快照', '无需 Git，保存与编译成功时记录轻量快照')}
        ${inputRow('files.historyMaxDays', '快照保留天数', '', { type: 'number', width: 110 })}
        ${switchRow('files.snapshotOnBuild', '编译成功后创建快照', '')}
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">快照存储位置</div><div class="setting-desc">保存在用户数据目录，不污染项目文件夹</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="openHistoryDir">${icon('external')}打开目录</button></div>
        </div>
      </div>
      ${group('系统文件关联')}
      <div class="setting-card">
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">默认打开方式</div><div class="setting-desc">将 .tex / .sty / .cls / .bib / .md 关联到 TeXora（Windows 设置 → 默认应用）</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="openDefaultApps">${icon('external')}打开系统设置</button></div>
        </div>
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">启动时恢复上次项目</div><div class="setting-desc">重新打开应用时自动载入最近的文件夹</div></div>
          <div class="setting-control"><button class="switch ${ctx.state.settings.general.reopenLastProject ? 'on' : ''}" data-setting="general.reopenLastProject" data-type="bool"></button></div>
        </div>
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">启动时检查软件更新</div><div class="setting-desc">每天最多检查一次 GitHub Releases</div></div>
          <div class="setting-control"><button class="switch ${ctx.state.settings.general.autoCheckUpdates !== false ? 'on' : ''}" data-setting="general.autoCheckUpdates" data-type="bool"></button></div>
        </div>
      </div>
      ${group('危险操作')}
      <div class="setting-card">
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">恢复当前分类默认值</div><div class="setting-desc">仅重置当前面板的设置项</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="resetSection">${icon('refresh')}恢复默认</button></div>
        </div>
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">恢复全部设置</div><div class="setting-desc">重置所有分类，不影响项目文件</div></div>
          <div class="setting-control"><button class="btn btn-sm btn-danger" id="resetAll">${icon('trash')}全部重置</button></div>
        </div>
      </div>`;
  }

  function renderAbout() {
    const info = ctx.state.texInfo || {};
    return `
      <h2 class="settings-section-title">关于与环境</h2>
      <p class="settings-section-desc">TeXora 是本机运行的 LaTeX 写作工作台。以下信息用于排查环境问题。</p>
      <div class="about-grid">
        <div class="about-item"><span>应用版本</span><strong>${escapeHtml(ctx.state.capture?.version || '')} <span class="chip accent">Beta</span></strong></div>
        <div class="about-item"><span>TeX 发行版</span><strong>${escapeHtml(info.distro || '未检测到')}</strong></div>
        <div class="about-item"><span>TeX 版本</span><strong>${escapeHtml(info.version || '—')}</strong></div>
        <div class="about-item"><span>可执行目录</span><strong class="mono">${escapeHtml(info.binDir || '—')}</strong></div>
        <div class="about-item"><span>SyncTeX</span><strong>${info.tools?.synctex ? '可用' : '不可用'}</strong></div>
        <div class="about-item"><span>pdftocairo</span><strong>${info.tools?.pdftocairo ? '可用' : '不可用'}</strong></div>
        <div class="about-item"><span>ChkTeX</span><strong>${info.tools?.chktex ? '可用' : '不可用'}</strong></div>
        <div class="about-item"><span>Git</span><strong>${ctx.state.settings ? '见 Git 面板' : '—'}</strong></div>
      </div>
      <div class="setting-card" style="margin-top:12px">
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">检查 TeX 环境</div><div class="setting-desc">重新探测引擎、宏包管理器、字体与辅助工具</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="aboutCheck">${icon('shield')}运行检查</button></div>
        </div>
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">软件更新</div><div class="setting-desc">检查 GitHub Releases 中的最新版本</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="aboutUpdate">${icon('download')}检查更新</button></div>
        </div>
        <div class="setting-row">
          <div class="setting-main"><div class="setting-name">关于 TeXora</div><div class="setting-desc">版本、组件与隐私说明</div></div>
          <div class="setting-control"><button class="btn btn-sm" id="aboutOpen">${icon('info')}查看</button></div>
        </div>
      </div>`;
  }

  function render() {
    const body = wrap.root.querySelector('.settings-content');
    const nav = wrap.root.querySelector('.settings-nav');
    nav.innerHTML =
      `<div class="settings-nav-label">设置</div>` +
      SECTIONS.map(
        (s) => `<button class="settings-nav-item ${s.id === currentSection ? 'active' : ''}" data-section="${s.id}">${icon(s.icon)}<span>${s.title}</span></button>`
      ).join('');
    for (const btn of $$('.settings-nav-item', nav)) {
      btn.addEventListener('click', () => {
        currentSection = btn.dataset.section;
        render();
      });
    }
    const map = { editor: renderEditor, build: renderBuild, tex: renderTex, ai: renderAi, appearance: renderAppearance, keys: renderKeys, files: renderFiles, about: renderAbout };
    body.innerHTML = (map[currentSection] || renderEditor)();
    body.scrollTop = 0;
    bind(body);
  }

  function renderSection() {
    render();
  }

  function bind(body) {
    // generic settings controls
    for (const node of $$('[data-setting]', body)) {
      const path = node.dataset.setting;
      const type = node.dataset.type || 'string';
      if (node.classList.contains('switch')) {
        node.addEventListener('click', () => {
          const next = !node.classList.contains('on');
          node.classList.toggle('on', next);
          node.setAttribute('aria-checked', String(next));
          set(path, next);
        });
      } else if (node.tagName === 'SELECT') {
        node.addEventListener('change', () => set(path, coerce(node.value, path)));
      } else if (node.tagName === 'TEXTAREA') {
        node.addEventListener('change', () => set(path, node.value));
      } else if (node.tagName === 'INPUT') {
        node.addEventListener(type === 'number' ? 'change' : 'input', debounce(() => set(path, coerce(node.value, path)), type === 'number' ? 0 : 260));
      }
    }

    // theme cards
    for (const card of $$('[data-theme-choice]', body)) {
      card.addEventListener('click', () => {
        ctx.app.setTheme(card.dataset.themeChoice);
        for (const c of $$('[data-theme-choice]', body)) c.classList.toggle('active', c === card);
      });
    }
    for (const dot of $$('[data-accent-choice]', body)) {
      dot.addEventListener('click', () => {
        ctx.app.setAccent(dot.dataset.accentChoice);
        for (const d of $$('[data-accent-choice]', body)) d.classList.toggle('active', d === dot);
      });
    }

    // specific buttons
    body.querySelector('#setClean')?.addEventListener('click', () => ctx.cmd('build.clean', false));
    body.querySelector('#setDetectTex')?.addEventListener('click', () => ctx.app.checkTexEnvironment());
    body.querySelector('#setRefreshFonts')?.addEventListener('click', async () => {
      const res = await ctx.api.tex.fonts(true);
      ctx.state.fonts = res.fonts || [];
      toast({ type: 'success', title: '字体缓存已刷新', body: `${ctx.state.fonts.length} 个字体` });
    });
    for (const btn of $$('[data-font]', body)) {
      btn.addEventListener('click', () => ctx.dialogs.openFontPicker(btn.dataset.font));
    }
    body.querySelector('#aiToggleKey')?.addEventListener('click', () => {
      const input = body.querySelector('[data-setting="ai.apiKey"]');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    body.querySelector('#aiTest')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `${icon('loader', 'spin')}测试中…`;
      const res = await ctx.api.ai.test();
      btn.disabled = false;
      btn.innerHTML = `${icon('send')}测试连接`;
      if (res.ok) toast({ type: 'success', title: '连接成功', body: `${res.provider} · ${res.model} · ${String(res.text || '').slice(0, 60)}` });
      else toast({ type: 'error', title: '连接失败', body: res.error || '' , timeout: 8000 });
    });
    body.querySelector('#skillAdd')?.addEventListener('click', async () => {
      const res = await ctx.api.dialog.openFiles({ filters: [{ name: 'Skills', extensions: ['md', 'txt', 'markdown'] }] });
      if (!res.ok) return;
      const added = await ctx.api.ai.addSkill(res.paths[0]);
      if (added.ok) {
        renderSkills(body);
        toast({ type: 'success', title: 'Skill 已导入' });
      } else toast({ type: 'error', title: '导入失败', body: added.error });
    });
    if (currentSection === 'ai') {
      renderSkills(body);
      renderBlockActions(body);
    }
    if (currentSection === 'tex') initPackageSearch(body);
    if (currentSection === 'keys') initKeyCapture(body);
    body.querySelector('#openHistoryDir')?.addEventListener('click', async () => {
      const info = await ctx.api.info();
      ctx.api.showItemInFolder(info.userData + '\\history');
    });
    body.querySelector('#openDefaultApps')?.addEventListener('click', () => ctx.api.openExternal('ms-settings:defaultapps'));
    body.querySelector('#resetSection')?.addEventListener('click', async () => {
      const ok = await ctx.dialogs.confirm({ title: '恢复默认', message: '重置当前分类的所有设置项？', confirmText: '重置', danger: true });
      if (!ok) return;
      await ctx.api.settings.reset(currentSection === 'keys' ? 'keys' : currentSection);
      render();
      toast({ type: 'success', title: '已恢复默认设置' });
    });
    body.querySelector('#resetAll')?.addEventListener('click', async () => {
      const ok = await ctx.dialogs.confirm({ title: '恢复全部设置', message: '将所有设置恢复为出厂默认值？此操作不影响项目文件。', confirmText: '全部重置', danger: true });
      if (!ok) return;
      await ctx.api.settings.reset(null);
      render();
      toast({ type: 'success', title: '已恢复全部默认设置' });
    });
    body.querySelector('#aboutCheck')?.addEventListener('click', () => ctx.app.checkTexEnvironment());
    body.querySelector('#aboutUpdate')?.addEventListener('click', () => ctx.app.checkUpdates(true));
    body.querySelector('#aboutOpen')?.addEventListener('click', () => ctx.dialogs.openAbout());
    body.querySelector('#pkgInstall')?.addEventListener('click', async () => {
      const name = body.querySelector('#pkgSearch').value.trim();
      if (!name) return;
      const result = body.querySelector('#pkgResult');
      result.innerHTML = `<div class="field-hint">${icon('loader', 'spin')}正在安装 ${escapeHtml(name)}…</div>`;
      const res = await ctx.api.tex.installPackage(name);
      result.innerHTML = res.ok
        ? `<div class="issue"><span class="success-text">✓ ${escapeHtml(name)} 安装成功</span></div>`
        : `<div class="issue">${icon('alert')}<span>${escapeHtml(res.error || '安装失败')}</span></div>`;
      if (res.ok) ctx.app.loadPackages();
    });
  }

  function coerce(value, path) {
    if (/\.(fontSize|lineHeight|autosaveDelay|uiScale|liveDelay|maxRuns|timeout|maxTokens|temperature|historyMaxDays)$/.test(path)) {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    if (/^appearance\.uiScale$/.test(path)) return Number(value);
    return value;
  }

  function set(path, value) {
    if (path === 'ai.provider') {
      const preset = PROVIDER_PRESETS[value];
      if (preset) {
        ctx.api.settings.set('ai.baseUrl', preset.baseUrl);
        ctx.api.settings.set('ai.model', preset.models[0] || '');
        ctx.state.settings.ai.baseUrl = preset.baseUrl;
        ctx.state.settings.ai.model = preset.models[0] || '';
        setTimeout(() => render(), 80);
      }
    }
    const parts = path.split('.');
    let cur = ctx.state.settings;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    ctx.api.settings.set(path, value);
    if (path === 'editor.wordWrap') {
      ctx.editor?.editor?.updateOptions({
        wordWrap: value ? 'on' : 'off',
        scrollBeyondLastColumn: value ? 0 : 5,
        scrollbar: { horizontal: value ? 'hidden' : 'auto' }
      });
    } else if (path.startsWith('editor.')) {
      ctx.editor?.applySettings();
    }
    if (path.startsWith('appearance.')) ctx.app.applyAppearance();
  }

  async function renderSkills(body) {
    const box = body.querySelector('#skillList');
    if (!box) return;
    const res = await ctx.api.ai.skills();
    const skills = res.skills || [];
    box.innerHTML =
      skills
        .map(
          (s) => `<div class="skill-row">
        <button class="switch ${s.enabled ? 'on' : ''}" data-skill-toggle="${s.id}" title="启用 / 禁用"></button>
        <div class="skill-main"><div class="skill-name">${escapeHtml(s.name)}</div><div class="skill-path">${escapeHtml(s.path)} · ${formatBytes(s.size)}</div></div>
        ${s.builtin ? '<span class="chip accent">内置 · 润色</span>' : ''}
        <button class="icon-btn sm" data-skill-open="${s.id}" title="查看内容">${icon('eye')}</button>
        ${s.builtin ? '' : `<button class="icon-btn sm" data-skill-remove="${s.id}" title="移除">${icon('trash')}</button>`}
      </div>`
        )
        .join('') || `<div class="field-hint">尚未导入 Skills。可导入期刊排版规范、个人宏习惯或学科写作指南（Markdown / TXT）。</div>`;
    for (const btn of $$('[data-skill-toggle]', box)) {
      btn.addEventListener('click', async () => {
        const next = !btn.classList.contains('on');
        btn.classList.toggle('on', next);
        await ctx.api.ai.toggleSkill(btn.dataset.skillToggle, next);
      });
    }
    for (const btn of $$('[data-skill-remove]', box)) {
      btn.addEventListener('click', async () => {
        await ctx.api.ai.removeSkill(btn.dataset.skillRemove);
        renderSkills(body);
      });
    }
    for (const btn of $$('[data-skill-open]', box)) {
      btn.addEventListener('click', async () => {
        const res2 = await ctx.api.ai.readSkill(btn.dataset.skillOpen);
        if (res2.ok) ctx.dialogs.showText({ title: res2.skill.name, subtitle: res2.skill.path, text: res2.content });
      });
    }
  }

  function renderBlockActions(body) {
    const box = body.querySelector('#blockActions');
    if (!box) return;
    const actions = ctx.state.settings.ai.blockActions || [];
    box.innerHTML = actions
      .map(
        (a, i) => `<div class="block-action-row">
        <input class="input input-sm" data-action-label="${i}" value="${escapeHtml(a.label)}" placeholder="按钮名称" />
        <input class="input input-sm" data-action-prompt="${i}" value="${escapeHtml(a.prompt)}" placeholder="提示词" />
        <button class="icon-btn sm" data-action-remove="${i}">${icon('trash')}</button>
      </div>`
      )
      .join('');
    for (const input of $$('[data-action-label]', box)) {
      input.addEventListener('change', () => saveAction(Number(input.dataset.actionLabel), 'label', input.value));
    }
    for (const input of $$('[data-action-prompt]', box)) {
      input.addEventListener('change', () => saveAction(Number(input.dataset.actionPrompt), 'prompt', input.value));
    }
    for (const btn of $$('[data-action-remove]', box)) {
      btn.addEventListener('click', () => {
        const actions2 = ctx.state.settings.ai.blockActions.filter((_, i) => i !== Number(btn.dataset.actionRemove));
        ctx.api.settings.set('ai.blockActions', actions2);
        setTimeout(() => renderBlockActions(body), 60);
      });
    }
    body.querySelector('#blockActionAdd')?.addEventListener('click', () => {
      const actions2 = [...(ctx.state.settings.ai.blockActions || []), { id: 'custom-' + Date.now().toString(36), label: '新动作', prompt: '请处理下面的 LaTeX 内容：' }];
      ctx.api.settings.set('ai.blockActions', actions2);
      setTimeout(() => renderBlockActions(body), 60);
    });
  }

  function saveAction(index, key, value) {
    const actions = (ctx.state.settings.ai.blockActions || []).map((a, i) => (i === index ? { ...a, [key]: value } : a));
    ctx.api.settings.set('ai.blockActions', actions);
  }

  function initPackageSearch(body) {
    const input = body.querySelector('#pkgSearch');
    const result = body.querySelector('#pkgResult');
    if (!input) return;
    const run = debounce(async () => {
      const q = input.value.trim();
      if (!q) {
        result.innerHTML = `<div class="field-hint">已安装宏包：${(ctx.state.packages || []).length} 个</div>`;
        return;
      }
      result.innerHTML = `<div class="field-hint">${icon('loader', 'spin')} 查询中…</div>`;
      const res = await ctx.api.tex.packages(q, 60);
      const items = res.items || [];
      result.innerHTML = items.length
        ? `<div class="pkg-list">${items
            .map((name) => `<div class="pkg-item"><span class="mono">${escapeHtml(name)}</span><span class="chip ok">已安装</span></div>`)
            .join('')}</div>`
        : `<div class="field-hint">未找到已安装的同名宏包。可点击右上角「安装」尝试从 CTAN 下载。</div>`;
    }, 240);
    input.addEventListener('input', run);
  }

  function initKeyCapture(body) {
    for (const input of $$('.keymap-input', body)) {
      input.addEventListener('focus', () => {
        input.value = '';
        input.placeholder = '请按下组合键…';
      });
      input.addEventListener('keydown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        const key = e.key;
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
        parts.push(key.length === 1 ? key.toUpperCase() : key);
        const combo = parts.join('+');
        input.value = combo;
        const cmdId = input.dataset.cmdId;
        const custom = { ...(ctx.state.settings.keys.custom || {}), [cmdId]: combo };
        ctx.api.settings.set('keys.custom', custom);
        toast({ type: 'success', title: '快捷键已更新', body: `${cmdId} → ${combo}` });
      });
      input.addEventListener('blur', () => {
        if (!input.value) {
          const custom = { ...(ctx.state.settings.keys.custom || {}) };
          delete custom[input.dataset.cmdId];
          ctx.api.settings.set('keys.custom', custom);
          const cmd = ctx.commands.map.get(input.dataset.cmdId);
          input.value = cmd?.keys || '';
        }
      });
    }
  }

  function open(section) {
    if (section) currentSection = section;
    const layer = $('#modalLayer');
    layer.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal settings-modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">${icon('sliders')} 设置</div>
            <div class="modal-sub">TeXora · 本地优先的 LaTeX 写作工作台</div>
          </div>
          <button class="icon-btn modal-close" title="关闭">${icon('close')}</button>
        </div>
        <div class="modal-body" style="padding:0;overflow:hidden">
          <div class="settings-grid">
            <div class="settings-nav"></div>
            <div class="settings-content"></div>
          </div>
        </div>
        <div class="modal-foot">
          <span class="field-hint">${icon('shield')} 所有设置保存在本机 · 修改即时生效</span>
          <span class="spacer"></span>
          <button class="btn btn-sm" id="settingsClose">完成</button>
        </div>
      </div>`;
    layer.classList.add('open');
    const root = layer.querySelector('.settings-modal');
    wrap = { root };
    root.querySelector('.modal-close').addEventListener('click', closeSettings);
    root.querySelector('#settingsClose').addEventListener('click', closeSettings);
    layer.querySelector('.modal-backdrop').addEventListener('click', closeSettings);
    document.addEventListener('keydown', escHandler);
    render();
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeSettings();
  }

  function closeSettings() {
    const layer = $('#modalLayer');
    if (!layer) return;
    layer.innerHTML = '';
    layer.classList.remove('open');
    wrap = null;
    document.removeEventListener('keydown', escHandler);
  }

  async function resetAll() {
    const ok = await ctx.dialogs.confirm({ title: '恢复默认设置', message: '重置所有设置？', confirmText: '重置', danger: true });
    if (!ok) return;
    await ctx.api.settings.reset(null);
    renderSection();
  }

  return { open, close: closeSettings, resetAll, renderSection };
}
