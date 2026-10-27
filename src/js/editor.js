/**
 * Editor controller: Monaco setup, LaTeX/Markdown/BibTeX language support,
 * intelligent completions, hover previews, block mode, drag-reorder,
 * folding, inline math zones and editor commands.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { mathAtOffset, mathDefinitions } from './live-math.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.main';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { ctx } from './ctx.js';
import { debounce, escapeHtml, icon, baseName, relPath, extOf, openMenu } from './util.js';
import {
  COMMANDS, ENVIRONMENTS, SNIPPETS, ENUMITEM_OPTIONS, wrapCommandFor, splitLines,
  stripComment, detectBlocks, parseDocument
} from './latex.js';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

let langReady = false;

const MATH_HINTS = [
  ['\\frac{}{}', '分式'], ['\\sqrt{}', '根式'], ['\\sum', '求和'], ['\\int', '积分'], ['\\lim', '极限'],
  ['\\infty', '无穷'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\gamma', 'γ'], ['\\theta', 'θ'],
  ['\\lambda', 'λ'], ['\\mu', 'μ'], ['\\pi', 'π'], ['\\sigma', 'σ'], ['\\omega', 'ω'],
  ['\\Delta', 'Δ'], ['\\Omega', 'Ω'], ['\\partial', '偏导'], ['\\nabla', '梯度'],
  ['\\mathbb{R}', '实数集'], ['\\mathbb{N}', '自然数集'], ['\\mathbb{Z}', '整数集'],
  ['\\mathbf{}', '粗体'], ['\\mathcal{}', '花体'], ['\\operatorname{}', '算子'],
  ['\\left(', '左括号'], ['\\right)', '右括号'], ['\\begin{cases}', '分段函数'],
  ['\\begin{pmatrix}', '矩阵'], ['\\begin{aligned}', '对齐'], ['\\text{}', '文本']
];

const PACKAGE_HINTS = [
  'amsmath', 'amssymb', 'amsthm', 'mathtools', 'graphicx', 'booktabs', 'longtable', 'tabularx',
  'array', 'multirow', 'makecell', 'threeparttable', 'siunitx', 'geometry', 'hyperref',
  'cleveref', 'xcolor', 'tikz', 'pgfplots', 'algorithm2e', 'algorithmic', 'listings', 'minted',
  'biblatex', 'natbib', 'ctex', 'xeCJK', 'fontspec', 'unicode-math', 'enumitem', 'titlesec',
  'tocloft', 'fancyhdr', 'caption', 'subcaption', 'float', 'wrapfig', 'setspace', 'parskip',
  'microtype', 'polynom', 'physics', 'braket', 'bm', 'dsfont', 'cancel', 'ulem', 'soul',
  'todonotes', 'changes', 'lineno', 'lipsum', 'blindtext', 'pdfpages', 'standalone', 'ctexart',
  'bicaption', 'threeparttablex', 'makeidx', 'imakeidx', 'glossaries', 'acronym', 'appendix',
  'chngcntr', 'etoolbox', 'xparse', 'expl3', 'ifthen', 'calc', 'verbatim', 'fancyvrb'
];

const ENV_INFO = {
  theorem: '定理', lemma: '引理', proposition: '命题', corollary: '推论', definition: '定义',
  proof: '证明', remark: '注记', example: '例', assumption: '假设', axiom: '公理',
  equation: '公式', align: '对齐公式', gather: '多行公式', figure: '图', table: '表',
  'itemize': '无序列表', 'enumerate': '有序列表', 'description': '描述列表',
  tikzpicture: 'TikZ 绘图', tabular: '表格', longtable: '跨页表格'
};

/* ------------------------------------------------------------------ themes */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function defineThemes() {
  const accent = cssVar('--accent', '#8b7cf8');
  monaco.editor.defineTheme('texora-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'd7dfee' },
      { token: 'comment', foreground: '5d6980', fontStyle: 'italic' },
      { token: 'keyword.control', foreground: 'c9a0ff' },
      { token: 'keyword.env', foreground: 'ffb27a' },
      { token: 'keyword.env.name', foreground: 'ffcf9e' },
      { token: 'tag', foreground: 'ffb27a' },
      { token: 'string', foreground: '9fe0b0' },
      { token: 'string.math', foreground: '86d5fb' },
      { token: 'number', foreground: 'f3c477' },
      { token: 'number.math', foreground: 'f3c477' },
      { token: 'delimiter', foreground: '9fb0cc' },
      { token: 'delimiter.math', foreground: '6fc3e8' },
      { token: 'type', foreground: '7ec7ff' },
      { token: 'attribute.name', foreground: 'e9c46a' },
      { token: 'variable', foreground: 'e2b6ff' },
      { token: 'invalid', foreground: 'ff6b81' },
      { token: 'emphasis', fontStyle: 'italic' }
    ],
    colors: {
      'editor.background': '#0d1018',
      'editor.foreground': '#d7dfee',
      'editorLineNumber.foreground': '#454f68',
      'editorLineNumber.activeForeground': accent,
      'editor.lineHighlightBackground': '#141a29',
      'editor.selectionBackground': '#2b3454',
      'editor.inactiveSelectionBackground': '#1e2537',
      'editorCursor.foreground': accent,
      'editorIndentGuide.background1': '#1b2233',
      'editorIndentGuide.activeBackground1': '#2e3951',
      'editorBracketHighlight.foreground1': '#8b7cf8',
      'editorBracketHighlight.foreground2': '#56b6ff',
      'editorBracketHighlight.foreground3': '#f3c477',
      'editorHoverWidget.background': '#131826',
      'editorHoverWidget.border': '#2b3348',
      'editorSuggestWidget.background': '#131826',
      'editorSuggestWidget.border': '#2b3348',
      'editorSuggestWidget.selectedBackground': '#2a3255',
      'editorSuggestWidget.highlightForeground': accent,
      'editorWidget.background': '#131826',
      'editorWidget.border': '#2b3348',
      'editorGutter.background': '#0d1018',
      'editorError.foreground': '#ff6b81',
      'editorWarning.foreground': '#f2b544',
      'editorInfo.foreground': '#56b6ff',
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#ffffff18',
      'scrollbarSlider.hoverBackground': '#ffffff28',
      'scrollbarSlider.activeBackground': '#ffffff36',
      'editorBracketMatch.background': '#8b7cf826',
      'editorBracketMatch.border': '#8b7cf880',
      'editor.foldBackground': '#ffffff08',
      'editorStickyScroll.background': '#0d1018'
    }
  });
  monaco.editor.defineTheme('texora-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '1f2a44' },
      { token: 'comment', foreground: '8b97af', fontStyle: 'italic' },
      { token: 'keyword.control', foreground: '7c3aed' },
      { token: 'keyword.env', foreground: 'c2410c' },
      { token: 'keyword.env.name', foreground: '9a3412' },
      { token: 'tag', foreground: 'c2410c' },
      { token: 'string', foreground: '15803d' },
      { token: 'string.math', foreground: '0369a1' },
      { token: 'number', foreground: 'b45309' },
      { token: 'number.math', foreground: 'b45309' },
      { token: 'delimiter', foreground: '64748b' },
      { token: 'delimiter.math', foreground: '0e7490' },
      { token: 'type', foreground: '1d4ed8' },
      { token: 'attribute.name', foreground: 'a16207' },
      { token: 'variable', foreground: '9333ea' },
      { token: 'invalid', foreground: 'dc3a52' },
      { token: 'emphasis', fontStyle: 'italic' }
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1f2a44',
      'editorLineNumber.foreground': '#b3bdd0',
      'editorLineNumber.activeForeground': accent,
      'editor.lineHighlightBackground': '#f6f7fb',
      'editor.selectionBackground': '#ded9ff',
      'editor.inactiveSelectionBackground': '#ecebfa',
      'editorCursor.foreground': accent,
      'editorIndentGuide.background1': '#eceff6',
      'editorIndentGuide.activeBackground1': '#cfd6e6',
      'editorBracketHighlight.foreground1': '#6a56f0',
      'editorBracketHighlight.foreground2': '#1287f5',
      'editorBracketHighlight.foreground3': '#b45309',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#dbe1ee',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#dbe1ee',
      'editorSuggestWidget.selectedBackground': '#efecff',
      'editorSuggestWidget.highlightForeground': accent,
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#dbe1ee',
      'editorGutter.background': '#ffffff',
      'editorError.foreground': '#dc3a52',
      'editorWarning.foreground': '#c07a00',
      'editorInfo.foreground': '#1287f5',
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#17203a1c',
      'scrollbarSlider.hoverBackground': '#17203a30',
      'scrollbarSlider.activeBackground': '#17203a42',
      'editorBracketMatch.background': '#6a56f018',
      'editorBracketMatch.border': '#6a56f060'
    }
  });
  monaco.editor.defineTheme('texora-one-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '', foreground: 'abb2bf' }, { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd' }, { token: 'keyword.control', foreground: 'c678dd' },
      { token: 'string', foreground: '98c379' }, { token: 'string.math', foreground: '56b6c2' },
      { token: 'number', foreground: 'd19a66' }, { token: 'type', foreground: '61afef' },
      { token: 'variable', foreground: 'e06c75' }, { token: 'delimiter', foreground: 'abb2bf' }
    ],
    colors: { 'editor.background': '#282c34', 'editor.foreground': '#abb2bf', 'editorLineNumber.foreground': '#4b5263', 'editorLineNumber.activeForeground': '#61afef', 'editor.lineHighlightBackground': '#2c313c', 'editor.selectionBackground': '#3e4451', 'editorCursor.foreground': '#528bff', 'editorHoverWidget.background': '#21252b', 'editorHoverWidget.border': '#181a1f', 'editorSuggestWidget.background': '#21252b', 'editorSuggestWidget.selectedBackground': '#2c313a', 'editorWidget.background': '#21252b', 'editorWidget.border': '#181a1f' }
  });
  monaco.editor.defineTheme('texora-github', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '', foreground: 'c9d1d9' }, { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' }, { token: 'keyword.control', foreground: 'ff7b72' },
      { token: 'string', foreground: 'a5d6ff' }, { token: 'string.math', foreground: '79c0ff' },
      { token: 'number', foreground: '79c0ff' }, { token: 'type', foreground: 'd2a8ff' },
      { token: 'variable', foreground: 'ffa657' }, { token: 'delimiter', foreground: 'c9d1d9' }
    ],
    colors: { 'editor.background': '#0d1117', 'editor.foreground': '#c9d1d9', 'editorLineNumber.foreground': '#484f58', 'editorLineNumber.activeForeground': '#c9d1d9', 'editor.lineHighlightBackground': '#161b22', 'editor.selectionBackground': '#264f78', 'editorCursor.foreground': '#58a6ff', 'editorHoverWidget.background': '#161b22', 'editorHoverWidget.border': '#30363d', 'editorSuggestWidget.background': '#161b22', 'editorSuggestWidget.selectedBackground': '#1f6feb33', 'editorWidget.background': '#161b22', 'editorWidget.border': '#30363d' }
  });
  monaco.editor.defineTheme('texora-solarized', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '657b83' }, { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
      { token: 'keyword', foreground: '859900' }, { token: 'keyword.control', foreground: '859900' },
      { token: 'string', foreground: '2aa198' }, { token: 'string.math', foreground: '268bd2' },
      { token: 'number', foreground: 'b58900' }, { token: 'type', foreground: '268bd2' },
      { token: 'variable', foreground: 'd33682' }, { token: 'delimiter', foreground: '586e75' }
    ],
    colors: { 'editor.background': '#fdf6e3', 'editor.foreground': '#657b83', 'editorLineNumber.foreground': '#b3ad9e', 'editorLineNumber.activeForeground': '#268bd2', 'editor.lineHighlightBackground': '#eee8d5', 'editor.selectionBackground': '#d9e2e2', 'editorCursor.foreground': '#268bd2', 'editorHoverWidget.background': '#fdf6e3', 'editorHoverWidget.border': '#d9d2c2', 'editorSuggestWidget.background': '#fdf6e3', 'editorSuggestWidget.selectedBackground': '#eee8d5', 'editorWidget.background': '#fdf6e3', 'editorWidget.border': '#d9d2c2' }
  });
  monaco.editor.defineTheme('texora-monokai', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '', foreground: 'f8f8f2' }, { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f92672' }, { token: 'keyword.control', foreground: 'f92672' },
      { token: 'string', foreground: 'e6db74' }, { token: 'string.math', foreground: '66d9ef' },
      { token: 'number', foreground: 'ae81ff' }, { token: 'type', foreground: '66d9ef' },
      { token: 'variable', foreground: 'fd971f' }, { token: 'delimiter', foreground: 'f8f8f2' }
    ],
    colors: { 'editor.background': '#272822', 'editor.foreground': '#f8f8f2', 'editorLineNumber.foreground': '#75715e', 'editorLineNumber.activeForeground': '#f8f8f2', 'editor.lineHighlightBackground': '#3e3d32', 'editor.selectionBackground': '#49483e', 'editorCursor.foreground': '#f8f8f0', 'editorHoverWidget.background': '#1e1f1c', 'editorHoverWidget.border': '#34352f', 'editorSuggestWidget.background': '#1e1f1c', 'editorSuggestWidget.selectedBackground': '#414339', 'editorWidget.background': '#1e1f1c', 'editorWidget.border': '#34352f' }
  });
  monaco.editor.defineTheme('texora-github-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '24292f' }, { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cf222e' }, { token: 'keyword.control', foreground: 'cf222e' },
      { token: 'string', foreground: '0a3069' }, { token: 'string.math', foreground: '0550ae' },
      { token: 'number', foreground: '0550ae' }, { token: 'type', foreground: '8250df' },
      { token: 'variable', foreground: '953800' }, { token: 'delimiter', foreground: '57606a' }
    ],
    colors: { 'editor.background': '#ffffff', 'editor.foreground': '#24292f', 'editorLineNumber.foreground': '#8c959f', 'editorLineNumber.activeForeground': '#24292f', 'editor.lineHighlightBackground': '#f6f8fa', 'editor.selectionBackground': '#b6d7ff', 'editorCursor.foreground': '#0969da', 'editorHoverWidget.background': '#ffffff', 'editorHoverWidget.border': '#d0d7de', 'editorSuggestWidget.background': '#ffffff', 'editorSuggestWidget.selectedBackground': '#ddf4ff', 'editorWidget.background': '#ffffff', 'editorWidget.border': '#d0d7de' }
  });
  monaco.editor.defineTheme('texora-one-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '383a42' }, { token: 'comment', foreground: 'a0a1a7', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a626a4' }, { token: 'keyword.control', foreground: 'a626a4' },
      { token: 'string', foreground: '50a14f' }, { token: 'string.math', foreground: '0184bc' },
      { token: 'number', foreground: '986801' }, { token: 'type', foreground: 'c18401' },
      { token: 'variable', foreground: 'e45649' }, { token: 'delimiter', foreground: '383a42' }
    ],
    colors: { 'editor.background': '#fafafa', 'editor.foreground': '#383a42', 'editorLineNumber.foreground': '#9d9d9f', 'editorLineNumber.activeForeground': '#383a42', 'editor.lineHighlightBackground': '#f0f0f1', 'editor.selectionBackground': '#d7e6ff', 'editorCursor.foreground': '#526fff', 'editorHoverWidget.background': '#ffffff', 'editorHoverWidget.border': '#dbdbdc', 'editorSuggestWidget.background': '#ffffff', 'editorSuggestWidget.selectedBackground': '#e5e5e6', 'editorWidget.background': '#ffffff', 'editorWidget.border': '#dbdbdc' }
  });
  monaco.editor.defineTheme('texora-quiet-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '2f3b52' }, { token: 'comment', foreground: '8a94a6', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7c3aed' }, { token: 'keyword.control', foreground: '7c3aed' },
      { token: 'string', foreground: '2f7d4f' }, { token: 'string.math', foreground: '0e7490' },
      { token: 'number', foreground: 'b45309' }, { token: 'type', foreground: '1d4ed8' },
      { token: 'variable', foreground: 'be123c' }, { token: 'delimiter', foreground: '64748b' }
    ],
    colors: { 'editor.background': '#f7f9fc', 'editor.foreground': '#2f3b52', 'editorLineNumber.foreground': '#a6b0c3', 'editorLineNumber.activeForeground': '#2f3b52', 'editor.lineHighlightBackground': '#eef2f8', 'editor.selectionBackground': '#dbe7ff', 'editorCursor.foreground': '#4f46e5', 'editorHoverWidget.background': '#ffffff', 'editorHoverWidget.border': '#dbe1ee', 'editorSuggestWidget.background': '#ffffff', 'editorSuggestWidget.selectedBackground': '#e8edf7', 'editorWidget.background': '#ffffff', 'editorWidget.border': '#dbe1ee' }
  });
  // Refined light palettes: dark gray / deep blue body text, muted accents.
  const lightBg = { github: '#ffffff', one: '#fafafa', quiet: '#f7f9fc', solar: '#fdf6e3' };
  monaco.editor.defineTheme('texora-github-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '24292f' }, { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
      { token: 'keyword', foreground: '0550ae' }, { token: 'keyword.control', foreground: '0550ae' },
      { token: 'keyword.env', foreground: '0550ae' }, { token: 'keyword.env.name', foreground: '0a3069' },
      { token: 'tag', foreground: '0550ae' }, { token: 'string', foreground: '0a3069' },
      { token: 'string.math', foreground: '0a3069' }, { token: 'number', foreground: '0550ae' },
      { token: 'number.math', foreground: '0550ae' }, { token: 'delimiter', foreground: '57606a' },
      { token: 'delimiter.math', foreground: '57606a' }, { token: 'type', foreground: '6639ba' },
      { token: 'variable', foreground: '953800' }, { token: 'attribute.name', foreground: '0550ae' },
      { token: 'invalid', foreground: 'cf222e' }, { token: 'emphasis', fontStyle: 'italic' }
    ],
    colors: { 'editor.background': '#ffffff', 'editor.foreground': '#24292f', 'editorLineNumber.foreground': '#8c959f', 'editorLineNumber.activeForeground': '#24292f', 'editor.lineHighlightBackground': '#f6f8fa', 'editor.selectionBackground': '#b6d7ff', 'editor.inactiveSelectionBackground': '#eaeef2', 'editorCursor.foreground': '#0969da', 'editorIndentGuide.background1': '#eaeef2', 'editorHoverWidget.background': '#ffffff', 'editorHoverWidget.border': '#d0d7de', 'editorSuggestWidget.background': '#ffffff', 'editorSuggestWidget.border': '#d0d7de', 'editorSuggestWidget.selectedBackground': '#ddf4ff', 'editorWidget.background': '#ffffff', 'editorWidget.border': '#d0d7de' }
  });
  monaco.editor.defineTheme('texora-one-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '383a42' }, { token: 'comment', foreground: 'a0a1a7', fontStyle: 'italic' },
      { token: 'keyword', foreground: '4078f2' }, { token: 'keyword.control', foreground: '4078f2' },
      { token: 'keyword.env', foreground: '4078f2' }, { token: 'keyword.env.name', foreground: '2f5fbf' },
      { token: 'tag', foreground: '4078f2' }, { token: 'string', foreground: '50a14f' },
      { token: 'string.math', foreground: '2f7d4f' }, { token: 'number', foreground: '986801' },
      { token: 'number.math', foreground: '986801' }, { token: 'delimiter', foreground: '4b5263' },
      { token: 'delimiter.math', foreground: '4b5263' }, { token: 'type', foreground: '2f5fbf' },
      { token: 'variable', foreground: 'b45309' }, { token: 'attribute.name', foreground: '986801' },
      { token: 'invalid', foreground: 'ca1243' }, { token: 'emphasis', fontStyle: 'italic' }
    ],
    colors: { 'editor.background': '#fafafa', 'editor.foreground': '#383a42', 'editorLineNumber.foreground': '#9d9d9f', 'editorLineNumber.activeForeground': '#383a42', 'editor.lineHighlightBackground': '#f0f0f1', 'editor.selectionBackground': '#d7e6ff', 'editor.inactiveSelectionBackground': '#ececec', 'editorCursor.foreground': '#526fff', 'editorIndentGuide.background1': '#ececec', 'editorHoverWidget.background': '#ffffff', 'editorHoverWidget.border': '#dbdbdc', 'editorSuggestWidget.background': '#ffffff', 'editorSuggestWidget.selectedBackground': '#e5e5e6', 'editorWidget.background': '#ffffff', 'editorWidget.border': '#dbdbdc' }
  });
  monaco.editor.defineTheme('texora-quiet-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '1f2d3d' }, { token: 'comment', foreground: '7b8794', fontStyle: 'italic' },
      { token: 'keyword', foreground: '1d4ed8' }, { token: 'keyword.control', foreground: '1d4ed8' },
      { token: 'keyword.env', foreground: '1d4ed8' }, { token: 'keyword.env.name', foreground: '1e40af' },
      { token: 'tag', foreground: '1d4ed8' }, { token: 'string', foreground: '0f766e' },
      { token: 'string.math', foreground: '0e7490' }, { token: 'number', foreground: '9a3412' },
      { token: 'number.math', foreground: '9a3412' }, { token: 'delimiter', foreground: '475569' },
      { token: 'delimiter.math', foreground: '475569' }, { token: 'type', foreground: '3730a3' },
      { token: 'variable', foreground: '334155' }, { token: 'attribute.name', foreground: '9a3412' },
      { token: 'invalid', foreground: 'b91c1c' }, { token: 'emphasis', fontStyle: 'italic' }
    ],
    colors: { 'editor.background': '#f7f9fc', 'editor.foreground': '#1f2d3d', 'editorLineNumber.foreground': '#a6b0c3', 'editorLineNumber.activeForeground': '#1f2d3d', 'editor.lineHighlightBackground': '#eef2f8', 'editor.selectionBackground': '#dbe7ff', 'editor.inactiveSelectionBackground': '#e7edf5', 'editorCursor.foreground': '#4f46e5', 'editorIndentGuide.background1': '#e7edf5', 'editorHoverWidget.background': '#ffffff', 'editorHoverWidget.border': '#dbe1ee', 'editorSuggestWidget.background': '#ffffff', 'editorSuggestWidget.selectedBackground': '#e8edf7', 'editorWidget.background': '#ffffff', 'editorWidget.border': '#dbe1ee' }
  });
  monaco.editor.defineTheme('texora-solarized', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '3f4d55' }, { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
      { token: 'keyword', foreground: '1d4ed8' }, { token: 'keyword.control', foreground: '1d4ed8' },
      { token: 'keyword.env', foreground: '1d4ed8' }, { token: 'keyword.env.name', foreground: '1e40af' },
      { token: 'tag', foreground: '1d4ed8' }, { token: 'string', foreground: '2aa198' },
      { token: 'string.math', foreground: '268bd2' }, { token: 'number', foreground: 'b58900' },
      { token: 'number.math', foreground: 'b58900' }, { token: 'delimiter', foreground: '586e75' },
      { token: 'delimiter.math', foreground: '586e75' }, { token: 'type', foreground: '6c71c4' },
      { token: 'variable', foreground: 'b45309' }, { token: 'attribute.name', foreground: 'b58900' },
      { token: 'invalid', foreground: 'dc322f' }, { token: 'emphasis', fontStyle: 'italic' }
    ],
    colors: { 'editor.background': '#fdf6e3', 'editor.foreground': '#3f4d55', 'editorLineNumber.foreground': '#b3ad9e', 'editorLineNumber.activeForeground': '#268bd2', 'editor.lineHighlightBackground': '#eee8d5', 'editor.selectionBackground': '#d9e2e2', 'editor.inactiveSelectionBackground': '#eee8d5', 'editorCursor.foreground': '#268bd2', 'editorIndentGuide.background1': '#eee8d5', 'editorHoverWidget.background': '#fdf6e3', 'editorHoverWidget.border': '#d9d2c2', 'editorSuggestWidget.background': '#fdf6e3', 'editorSuggestWidget.selectedBackground': '#eee8d5', 'editorWidget.background': '#fdf6e3', 'editorWidget.border': '#d9d2c2' }
  });
}

/* --------------------------------------------------------------- languages */
function registerLanguages() {
  if (langReady) return;
  langReady = true;

  monaco.languages.register({ id: 'latex', extensions: ['.tex', '.ltx', '.sty', '.cls', '.dtx', '.ins'], aliases: ['LaTeX', 'latex', 'TeX'] });
  monaco.languages.setLanguageConfiguration('latex', {
    comments: { lineComment: '%' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' },
      { open: '`', close: "'" },
      { open: '"', close: '"' },
      { open: '%', close: '%' }
    ],
    surroundingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }, { open: '$', close: '$' }],
    folding: { markers: { start: /\\begin\{/, end: /\\end\{/ } },
    wordPattern: /(-?\d*\.\d\w*)|([^\\`~!@#$%^&*()\-=+\[\]{}|;:'",.<>/?\s]+)/g
  });

  monaco.languages.setMonarchTokensProvider('latex', {
    defaultToken: '',
    tokenPostfix: '.latex',
    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [/\\(?:begin|end)(?=\s*\{)/, 'keyword.control'],
        [/(?<=\\(?:begin|end)\s*\{)[a-zA-Z*]+(?=\})/, 'keyword.env.name'],
        [/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/, 'keyword.control'],
        [/\\(usepackage|documentclass|RequirePackage)\b/, 'keyword.control'],
        [/\\(cite[a-zA-Z]*|ref|eqref|label|autoref|cref|Cref|pageref)\b/, 'type'],
        [/\\(newcommand|renewcommand|providecommand|def|DeclareMathOperator|newtheorem)\b/, 'keyword.control'],
        [/\\(frac|dfrac|tfrac|sqrt|sum|prod|int|iint|iiint|oint|lim|sup|inf|max|min|log|ln|exp|sin|cos|tan|partial|nabla|infty|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|mathbf|mathrm|mathit|mathcal|mathbb|mathsf|mathtt|text|operatorname|left|right|big|Big|bigg|Bigg|quad|qquad|hspace|vspace|label|nonumber|begin|end)\b/, 'variable'],
        [/\\[a-zA-Z@]+\*?/, 'keyword.control'],
        [/\\[^a-zA-Z@]/, 'keyword.control'],
        [/\$\$/, { token: 'delimiter.math', next: '@displayMath' }],
        [/\$/, { token: 'delimiter.math', next: '@inlineMath' }],
        [/\\\[/, { token: 'delimiter.math', next: '@displayMathBracket' }],
        [/\\\(/, { token: 'delimiter.math', next: '@inlineMathParen' }],
        [/\d+(\.\d+)?/, 'number'],
        [/[{}()\[\]]/, '@brackets'],
        [/[&~^_]/, 'delimiter'],
        [/["“”]/, 'string'],
        [/\s+/, 'white']
      ],
      inlineMath: [
        [/\\[a-zA-Z@]+/, 'variable'],
        [/\\./, 'delimiter.math'],
        [/\$/, { token: 'delimiter.math', next: '@pop' }],
        [/\d+(\.\d+)?/, 'number.math'],
        [/[{}()\[\]]/, 'delimiter.math'],
        [/[+\-*/=<>^_&|!]/, 'string.math'],
        [/[a-zA-Z]/, 'string.math']
      ],
      displayMath: [
        [/\$\$/, { token: 'delimiter.math', next: '@pop' }],
        [/\\[a-zA-Z@]+/, 'variable'],
        [/\\./, 'delimiter.math'],
        [/[{}()\[\]]/, 'delimiter.math'],
        [/\d+(\.\d+)?/, 'number.math'],
        [/[+\-*/=<>^_&|!:,;']/, 'string.math'],
        [/[a-zA-Z]/, 'string.math'],
        [/\s+/, 'white']
      ],
      inlineMathParen: [
        [/\\\)/, { token: 'delimiter.math', next: '@pop' }],
        [/\\[a-zA-Z@]+/, 'variable'],
        [/[{}()\[\]]/, 'delimiter.math'],
        [/\d+(\.\d+)?/, 'number.math'],
        [/[+\-*/=<>^_&|!:,;']/, 'string.math'],
        [/[a-zA-Z]/, 'string.math'],
        [/\s+/, 'white']
      ],
      displayMathBracket: [
        [/\\\]/, { token: 'delimiter.math', next: '@pop' }],
        [/\\[a-zA-Z@]+/, 'variable'],
        [/\\./, 'delimiter.math'],
        [/[{}()\[\]]/, 'delimiter.math'],
        [/\d+(\.\d+)?/, 'number.math'],
        [/[+\-*/=<>^_&|!:,;']/, 'string.math'],
        [/[a-zA-Z]/, 'string.math'],
        [/\s+/, 'white']
      ]
    }
  });

  monaco.languages.register({ id: 'bibtex', extensions: ['.bib'], aliases: ['BibTeX', 'bibtex'] });
  monaco.languages.setLanguageConfiguration('bibtex', {
    comments: { lineComment: '%' },
    brackets: [['{', '}']],
    autoClosingPairs: [{ open: '{', close: '}' }, { open: '(', close: ')' }, { open: '"', close: '"' }]
  });
  monaco.languages.setMonarchTokensProvider('bibtex', {
    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [/@[a-zA-Z]+/, 'keyword.control'],
        [/[a-zA-Z0-9_-]+(?=\s*=)/, 'attribute.name'],
        [/"[^"]*"/, 'string'],
        [/\{[^{}]*\}/, 'string'],
        [/[{}=,]/, 'delimiter'],
        [/\d+/, 'number']
      ]
    }
  });

  monaco.languages.register({ id: 'latex-config', extensions: ['.latexmkrc'], aliases: ['latexmkrc'] });

  monaco.languages.register({ id: 'markdown', extensions: ['.md', '.markdown'], aliases: ['Markdown'] });
  monaco.languages.setMonarchTokensProvider('markdown', {
    tokenizer: {
      root: [
        [/^#{1,6}\s.*$/, 'keyword'],
        [/\*\*[^*]+\*\*/, 'strong'],
        [/\*[^*]+\*/, 'emphasis'],
        [/`[^`]+`/, 'string'],
        [/^\s*[-*+]\s/, 'keyword'],
        [/^\s*\d+[.)]\s/, 'keyword'],
        [/\[[^\]]*\]\([^)]*\)/, 'string'],
        [/^>.*$/, 'comment'],
        [/^\|.*\|$/, 'string']
      ]
    }
  });
  monaco.languages.setLanguageConfiguration('markdown', { comments: { blockComment: ['<!--', '-->'] }, brackets: [['[', ']'], ['(', ')']] });

  monaco.languages.register({ id: 'json', extensions: ['.json'], aliases: ['JSON'] });
  monaco.languages.setMonarchTokensProvider('json', {
    tokenizer: {
      root: [
        [/".*?"(?=\s*:)/, 'type'],
        [/".*?"/, 'string'],
        [/-?\d+(\.\d+)?([eE][-+]?\d+)?/, 'number'],
        [/true|false|null/, 'keyword'],
        [/[{}\[\],:]/, 'delimiter']
      ]
    }
  });

  registerFolding();
  registerCompletions();
  // Rich previews are rendered by a custom overlay (see buildHoverContent).
}

/* ---------------------------------------------------------------- folding */
function registerFolding() {
  monaco.languages.registerFoldingRangeProvider('latex', {
    provideFoldingRanges(model) {
      const text = model.getValue();
      const lines = splitLines(text);
      const ranges = [];
      const stack = [];
      for (let i = 0; i < lines.length; i++) {
        const line = stripComment(lines[i]);
        const beginRe = /\\begin\{([^}]+)\}/g;
        let m;
        while ((m = beginRe.exec(line))) stack.push({ env: m[1], line: i + 1 });
        const endRe = /\\end\{([^}]+)\}/g;
        while ((m = endRe.exec(line))) {
          const env = m[1];
          for (let s = stack.length - 1; s >= 0; s--) {
            if (stack[s].env === env) {
              const start = stack[s].line;
              const endLine = i > start ? i : start;
              if (endLine > start) ranges.push({ start, end: endLine, kind: 'region' });
              stack.length = s;
              break;
            }
          }
        }
      }
      // headings
      const heads = [];
      for (let i = 0; i < lines.length; i++) {
        const m = stripComment(lines[i]).match(/^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(\[[^\]]*\])?\s*\{/);
        if (m) heads.push({ level: ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph'].indexOf(m[1]), line: i + 1 });
      }
      heads.forEach((h, idx) => {
        for (let j = idx + 1; j < heads.length; j++) {
          if (heads[j].level <= h.level) {
            if (heads[j].line - h.line > 1) ranges.push({ start: h.line, end: heads[j].line - 1, kind: 'region' });
            return;
          }
        }
        if (lines.length - h.line > 1) ranges.push({ start: h.line, end: lines.length, kind: 'region' });
      });
      // preamble
      const docLine = lines.findIndex((l) => /\\begin\{document\}/.test(l));
      if (docLine > 2) ranges.push({ start: 1, end: docLine - 1, kind: 'region' });
      return ranges;
    }
  });
}

/* ------------------------------------------------------------- completions */
function lineBeforeCursor(model, position) {
  return model.getLineContent(position.lineNumber).slice(0, position.column - 1);
}

function registerCompletions() {
  monaco.languages.registerCompletionItemProvider('latex', {
    triggerCharacters: ['\\', '{', '['],
    async provideCompletionItems(model, position) {
      const before = lineBeforeCursor(model, position);
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column);
      const items = [];
      const cfg = ctx.state.settings?.editor || {};

      const mk = (label, insertText, kind, detail, extra = {}) => ({
        label,
        insertText,
        kind,
        detail,
        range,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        ...extra
      });
      // Monaco auto-inserts the closing brace for "{" — avoid doubling it.
      const nextChar = (model.getLineContent(position.lineNumber)[position.column - 1] || '');
      const ins = (txt) => (nextChar === '}' ? txt : txt + '}');

      // \begin{ | \end{
      let m = before.match(/\\begin\{([a-zA-Z*]*)$/);
      if (m) {
        const prefix = m[1].toLowerCase();
        for (const env of ENVIRONMENTS) {
          if (prefix && !env.toLowerCase().startsWith(prefix)) continue;
          items.push(mk(env, ins(env), monaco.languages.CompletionItemKind.Class, ENV_INFO[env] || '环境', {
            sortText: (ENV_INFO[env] ? '0' : '1') + env,
            documentation: { value: '自动补全 \\begin{' + env + '} … \\end{' + env + '}' }
          }));
        }
        return { suggestions: items };
      }
      m = before.match(/\\end\{([a-zA-Z*]*)$/);
      if (m) {
        const prefix = m[1].toLowerCase();
        const openStack = ctx.editor?.envStackAt(position.lineNumber, position.column) || [];
        const openEnv = openStack[openStack.length - 1] || '';
        const envs = Array.from(new Set([...(openEnv ? [openEnv] : []), ...(ctx.state.parsed?.environments?.map((e) => e.env) || []), ...ENVIRONMENTS]));
        for (const env of envs) {
          if (prefix && !env.toLowerCase().startsWith(prefix)) continue;
          items.push(mk(env, ins(env), monaco.languages.CompletionItemKind.Class, env === openEnv ? '当前打开的环境' : '环境结束', {
            sortText: (env === openEnv ? '0' : '1') + env
          }));
        }
        return { suggestions: items };
      }
      // enumitem options: \begin{enumerate}[
      m = before.match(/\\begin\{(enumerate|itemize)\}\s*\[([^\]]*)$/);
      if (m) {
        for (const [opt, desc] of ENUMITEM_OPTIONS) {
          items.push(mk(opt, opt + (opt.includes('}') ? ']' : ''), monaco.languages.CompletionItemKind.Property, desc, { detail: 'enumitem · ' + desc }));
        }
        return { suggestions: items };
      }
      // packages
      m = before.match(/\\usepackage\s*(\[[^\]]*\])?\{([^}]*)$/);
      if (m) {
        const typed = (m[2] || '').split(',').pop().trim().toLowerCase();
        const pkgRange = new monaco.Range(position.lineNumber, position.column - typed.length, position.lineNumber, position.column);
        const merged = Array.from(new Set([...(ctx.state.packages || []), ...PACKAGE_HINTS]));
        const filtered = merged.filter((p) => !typed || p.toLowerCase().includes(typed)).sort((a, b) => a.localeCompare(b));
        for (const pkg of filtered.slice(0, 400)) {
          items.push({
            label: pkg,
            insertText: ins(pkg),
            kind: monaco.languages.CompletionItemKind.Module,
            detail: (ctx.state.packages || []).includes(pkg) ? '已安装宏包' : '常用宏包',
            range: pkgRange,
            documentation: { value: `\\usepackage{${pkg}}` }
          });
        }
        return { suggestions: items };
      }
      // file inputs
      m = before.match(/\\(input|include|subfile)\{([^}]*)$/);
      if (m) {
        for (const f of (ctx.state.assets.tex || []).slice(0, 300)) {
          const name = f.replace(/\.(tex|ltx)$/i, '');
          items.push(mk(name, ins(name), monaco.languages.CompletionItemKind.File, 'TeX 文件'));
        }
        return { suggestions: items };
      }
      // graphics
      m = before.match(/\\includegraphics\s*(\[[^\]]*\])?\{([^}]*)$/);
      if (m) {
        for (const f of (ctx.state.assets.images || []).slice(0, 300)) {
          items.push(mk(f, ins(f), monaco.languages.CompletionItemKind.File, '图片资源'));
        }
        return { suggestions: items };
      }
      // bibliography
      m = before.match(/\\(bibliography|addbibresource)\{([^}]*)$/);
      if (m) {
        for (const f of (ctx.state.assets.bib || [])) items.push(mk(f, ins(f), monaco.languages.CompletionItemKind.File, 'BibTeX 文献库'));
        return { suggestions: items };
      }
      // refs
      m = before.match(/\\(ref|eqref|autoref|cref|Cref|pageref|nameref)\{([^}]*)$/);
      if (m) {
        const seen = new Set();
        for (const label of ctx.state.parsed?.labels || []) {
          seen.add(label.name);
          items.push({
            label: label.name,
            insertText: ins(label.name),
            kind: monaco.languages.CompletionItemKind.Reference,
            detail: `${label.env || 'label'} · 第 ${label.line} 行`,
            range,
            documentation: { value: `\\\\label{${label.name}}` }
          });
        }
        for (const [name, info] of Object.entries(ctx.state.labelIndex || {})) {
          if (seen.has(name)) continue;
          const rel = String(info.file || '').replace(ctx.state.project.root + '\\', '').split('\\').join('/');
          items.push({
            label: name,
            insertText: ins(name),
            kind: monaco.languages.CompletionItemKind.Reference,
            detail: `项目标签 · ${rel} : ${info.line}`,
            range,
            sortText: '1' + name,
            documentation: { value: `\\\\label{${name}}` }
          });
        }
        return { suggestions: items };
      }
      // citations
      m = before.match(/\\(cite[a-zA-Z]*|parencite|textcite|autocite|footcite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]*)$/);
      if (m) {
        for (const entry of ctx.state.bibEntries || []) {
          items.push({
            label: entry.key,
            insertText: ins(entry.key),
            kind: monaco.languages.CompletionItemKind.Value,
            detail: `${entry.authorShort || entry.author || ''} ${entry.year || ''}`.trim() || '文献',
            documentation: { value: `**${escapeHtml(entry.title || entry.key)}**\n\n${escapeHtml(entry.author || '')}\n\n_${escapeHtml(entry.journal || entry.booktitle || '')}_ ${entry.year || ''}` },
            range: new monaco.Range(position.lineNumber, position.column - (m[2] || '').length, position.lineNumber, position.column)
          });
        }
        return { suggestions: items };
      }

      // commands
      m = before.match(/(\\[a-zA-Z@]*)$/);
      if (m && m[1].length >= 1) {
        const prefix = m[1];
        const cmdRange = new monaco.Range(position.lineNumber, position.column - prefix.length, position.lineNumber, position.column);
        for (const [label, body, detail] of COMMANDS) {
          if (!label.startsWith(prefix)) continue;
          items.push({
            label,
            insertText: body.replace(/^\\([a-zA-Z]+\}\{)/, '$1'),
            kind: monaco.languages.CompletionItemKind.Function,
            detail,
            range: cmdRange,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: '0' + label
          });
        }
        for (const [tex, name] of MATH_HINTS) {
          const label = tex.split('{')[0];
          if (!label.startsWith(prefix)) continue;
          items.push({
            label: tex,
            insertText: tex,
            kind: monaco.languages.CompletionItemKind.Operator,
            detail: '数学 · ' + name,
            range: cmdRange,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          });
        }
        return { suggestions: items };
      }

      return { suggestions: items };
    }
  });

  monaco.languages.registerCompletionItemProvider('bibtex', {
    triggerCharacters: ['@', '{'],
    provideCompletionItems(model, position) {
      const line = lineBeforeCursor(model, position);
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column);
      if (/^@\w*$/.test(line.trim())) {
        return {
          suggestions: ['article', 'book', 'inproceedings', 'incollection', 'phdthesis', 'mastersthesis', 'techreport', 'misc', 'online', 'unpublished'].map((t) => ({
            label: '@' + t,
            insertText: t + '{${1:key},\n\ttitle = {${2:Title}},\n\tauthor = {${3:Author}},\n\tyear = {${4:2026}}\n}',
            kind: monaco.languages.CompletionItemKind.Class,
            range: new monaco.Range(position.lineNumber, word.startColumn - 1, position.lineNumber, position.column),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          }))
        };
      }
      if (/^\s*(author|title|journal|booktitle|year|volume|number|pages|publisher|address|doi|url|editor|month|note|school)\s*$/.test(line)) {
        return {
          suggestions: ['author', 'title', 'journal', 'booktitle', 'year', 'volume', 'number', 'pages', 'publisher', 'address', 'doi', 'url', 'editor', 'month', 'note', 'school'].map((f) => ({
            label: f,
            insertText: `${f} = {${1}}`,
            kind: monaco.languages.CompletionItemKind.Field,
            range,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          }))
        };
      }
      return { suggestions: [] };
    }
  });
}

/* ----------------------------------------------------------------- hovers */
const mathCache = new Map();
export function clearMathPreviewCache() { mathCache.clear(); }

async function renderMath(code, displayMode = false, kind = 'math') {
  const revisions = [...ctx.state.docs].map(([file, doc]) => file + ':' + doc.model?.getVersionId()).join('|');
  const key = [ctx.state.project.rootFile, ctx.state.settings.build.engine, revisions, kind, displayMode, code].join('|');
  if (mathCache.has(key)) return mathCache.get(key);
  const p = ctx.api.tex
    .snippet({ code, kind, displayMode, rootFile:ctx.state.project.rootFile, rootText:ctx.state.docs.get(ctx.state.project.rootFile)?.model?.getValue() })
    .then((res) => (res.ok ? { ok: true, url: ctx.api.assetUrl(res.png), width: res.width, height: res.height, dpi: res.dpi } : { ok: false, error: res.error }))
    .catch((err) => ({ ok: false, error: err.message }));
  mathCache.set(key, p);
  p.then(result => { if (!result.ok && mathCache.get(key) === p) mathCache.delete(key); });
  if (mathCache.size > 300) mathCache.delete(mathCache.keys().next().value);
  return p;
}

function envDescription(env) {
  const def = ctx.state.envDefs?.[env];
  if (def) return `定义于 ${def}`;
  if (ENV_INFO[env]) return ENV_INFO[env];
  return '本文档导言区或本地宏包中定义';
}

function wrappedDisplayBody(env, inner) {
  const name = String(env || '').replace(/\*$/, '');
  if (['align', 'alignat', 'flalign', 'eqnarray'].includes(name)) return `\\begin{aligned}${inner}\\end{aligned}`;
  if (name === 'gather') return `\\begin{gathered}${inner}\\end{gathered}`;
  if (name === 'multline') return `\\begin{aligned}${inner}\\end{aligned}`;
  return inner;
}

function mathAtPosition(model, position) {
  return mathAtOffset(model.getValue(), model.getOffsetAt(position));
}

async function labelTarget(labelName) {
  const active = ctx.state.parsed;
  let label = active?.labels.find((l) => l.name === labelName);
  let text = ctx.state.docs.get(ctx.state.activePath)?.model?.getValue() || '';
  let lines = splitLines(text);
  let parsed = active;
  let file = ctx.state.activePath;
  if (!label) {
    const hit = ctx.state.labelIndex?.[labelName];
    if (!hit) return null;
    file = hit.file;
    const res = await ctx.api.fs.read(file);
    if (!res.ok || !res.text) return null;
    text = res.text;
    lines = splitLines(text);
    parsed = parseDocument(text);
    label = parsed.labels.find((l) => l.name === labelName);
    if (!label) return null;
  }
  const envEntry = parsed?.environments.find((e) => e.line === label.envLine) || null;
  const contextStart = Math.max(0, label.line - 4);
  const context = lines.slice(contextStart, Math.min(lines.length, label.line + 2)).join('\n');
  return { label, lines, text, file, envEntry, context };
}

function registerHovers() {
  monaco.languages.registerHoverProvider('latex', {
    async provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const col = position.column;

      // images
      const cfgEd = ctx.state.settings?.editor || {};
      const imgMatch = line.match(/\\includegraphics\s*(?:\[[^\]]*\])?\{([^}]+)\}/);
      if (imgMatch && cfgEd.imagePreview !== false && col >= imgMatch.index && col <= imgMatch.index + imgMatch[0].length) {
        const file = imgMatch[1].trim();
        const abs = resolveAsset(file);
        let stat = null;
        if (abs) stat = await ctx.api.fs.stat(abs);
        if (abs && stat?.ok) {
          const html = `<div class="hover-card"><div class="hc-title">${icon('image')} 插图预览</div>
            <img class="hc-image" src="${ctx.api.assetUrl(abs)}" />
            <div class="hc-meta">${escapeHtml(file)} · ${Math.round(stat.size / 1024)} KB</div></div>`;
          return hoverResult(html, imgMatch.index, imgMatch[0].length);
        }
        return {
          contents: [{ value: `<div class="hover-card"><div class="hc-title">${icon('alert')} 未找到图片</div><div class="hc-text">${escapeHtml(file)}</div><div class="hc-meta">请检查相对路径或 figures/ 目录</div></div>`, isTrusted: true, supportHtml: true }]
        };
      }

      // refs
      const refMatch = line.match(/\\(ref|eqref|autoref|cref|Cref|pageref)\{([^}]+)\}/);
      if (refMatch && cfgEd.refPreview !== false && col >= refMatch.index && col <= refMatch.index + refMatch[0].length) {
        const name = refMatch[2].trim();
        const target = labelTarget(name);
        if (!target) {
          const html = `<div class="hover-card"><div class="hc-title">${icon('alert')} 未定义的引用</div><div class="hc-text">标签 <code>${escapeHtml(name)}</code> 在文档中不存在。</div></div>`;
          return { contents: [{ value: html, isTrusted: true, supportHtml: true }] };
        }
        const html = `<div class="hover-card"><div class="hc-title">${icon('target')} 引用目标 · ${escapeHtml(name)}</div>
          <div class="hc-text">${target.env ? `所在环境：<span class="hc-env">${escapeHtml(target.env)}</span> · ` : ''}第 ${target.label.line} 行</div>
          <pre class="hc-snippet">${escapeHtml(target.context.slice(0, 420))}</pre></div>`;
        return { contents: [{ value: html, isTrusted: true, supportHtml: true }] };
      }

      // citations
      const citeMatch = line.match(/\\(cite[a-zA-Z]*|parencite|textcite|autocite)\*?(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/);
      if (citeMatch && cfgEd.refPreview !== false && col >= citeMatch.index && col <= citeMatch.index + citeMatch[0].length) {
        const keys = citeMatch[2].split(',').map((k) => k.trim());
        const entries = keys.map((k) => (ctx.state.bibEntries || []).find((b) => b.key === k)).filter(Boolean);
        if (!entries.length) {
          return {
            contents: [{ value: `<div class="hover-card"><div class="hc-title">${icon('book')} 文献</div><div class="hc-text">未在项目中找到 ${keys.map((k) => `<code>${escapeHtml(k)}</code>`).join('、')} 的条目。</div></div>`, isTrusted: true, supportHtml: true }]
          };
        }
        const html = `<div class="hover-card"><div class="hc-title">${icon('book')} 参考文献</div>${entries
          .map(
            (e) => `<div class="hc-text"><strong>${escapeHtml(e.title || e.key)}</strong><br/>${escapeHtml(e.author || '')}${e.year ? ` · ${e.year}` : ''}${e.journal || e.booktitle ? `<br/><em>${escapeHtml(e.journal || e.booktitle)}</em>` : ''}</div>`
          )
          .join('<hr style="border:0;border-top:1px solid var(--border);margin:6px 0"/>')}</div>`;
        return { contents: [{ value: html, isTrusted: true, supportHtml: true }] };
      }

      // environment names
      const envMatch = line.match(/\\begin\{([^}]+)\}/);
      if (envMatch && col >= envMatch.index && col <= envMatch.index + envMatch[0].length) {
        const env = envMatch[1];
        const kind = envDescription(env);
        const parsed = ctx.state.parsed;
        const envEntry = parsed?.environments.find((e) => e.env === env && e.line === position.lineNumber);
        const html = `<div class="hover-card"><div class="hc-title">${icon('code')} ${escapeHtml(env)}</div>
          <div class="hc-text">${escapeHtml(kind)}${envEntry?.caption ? ` · <strong>${escapeHtml(envEntry.caption)}</strong>` : ''}</div>
          <div class="hc-meta">\\begin{${escapeHtml(env)}}${envEntry?.endLine ? ` … \\end{${escapeHtml(env)}} · ${envEntry.endLine - envEntry.line + 1} 行` : ''}</div></div>`;
        return { contents: [{ value: html, isTrusted: true, supportHtml: true }] };
      }

      // math
      if (cfgEd.inlineMathPreview !== false) {
        const math = mathAtPosition(model, position);
        if (math && math.code.length < 600) {
          const rendered = await renderMath(math.code, math.display, math.kind || 'math');
          const content = rendered.ok
            ? `<div class="hover-card"><div class="hc-title">${icon('sigma')} 公式预览</div><div class="hc-math"><img src="${rendered.url}" /></div><div class="hc-meta">${escapeHtml(math.code.slice(0, 200))}</div></div>`
            : `<div class="hover-card"><div class="hc-title">${icon('alert')} 公式渲染失败</div><pre class="hc-snippet">${escapeHtml(rendered.error || '')}</pre></div>`;
          return { contents: [{ value: content, isTrusted: true, supportHtml: true }] };
        }
      }
      return null;
    }
  });
}

function hoverResult(html, startIndex, length) {
  const position = ctx.editor.editor.getPosition();
  return {
    contents: [{ value: html, isTrusted: true, supportHtml: true }],
    range: position ? new monaco.Range(position.lineNumber, startIndex + 1, position.lineNumber, startIndex + length + 1) : undefined
  };
}

/** Build a styled hover card for math / images / refs / citations / environments. */
function regexMatchAt(line, re, col) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(line))) {
    if (col >= m.index && col <= m.index + m[0].length) return m;
    if (!m[0]) re.lastIndex++;
  }
  return null;
}

function tableSnippetBody(text) {
  const m = String(text).match(/\\begin\{(tabular\*?|tabularx|tblr|longtable)\}[\s\S]*?\\end\{\1\}/);
  return m ? m[0] : text;
}

async function renderTargetPreview(target) {
  const entry = target.envEntry;
  if (!entry || !entry.endLine) return '';
  const env = String(entry.env || '').replace(/\*$/, '');
  const lines = target.lines;
  const mathEnvs = ['equation', 'align', 'gather', 'multline', 'eqnarray', 'displaymath', 'alignat', 'flalign'];
  let kind = '';
  if (mathEnvs.includes(env)) kind = 'math';
  else if (env === 'table' || env === 'table*' || env === 'longtable') kind = 'table';
  else if (env === 'tikzpicture') kind = 'tikz';
  if (!kind) return '';
  let body = lines.slice(entry.line - 1, entry.endLine).join('\n');
  let renderKind = kind;
  if (kind === 'math') {
    const inner = lines.slice(entry.line, Math.max(entry.line, entry.endLine - 1)).join('\n');
    body = wrappedDisplayBody(entry.env, inner);
    renderKind = 'math';
  }
  if (kind === 'table') body = tableSnippetBody(body);
  const rendered = await renderMath(body, true, renderKind);
  if (!rendered.ok) {
    return '<div class="hc-text danger-text">局部预览失败：' + escapeHtml((rendered.error || '').slice(-160)) + '</div>';
  }
  return '<div class="hc-math"><img src="' + rendered.url + '" /></div>';
}

async function buildHoverContent(model, position) {
  const ed = ctx.state.settings?.editor || {};
  const line = model.getLineContent(position.lineNumber);
  const col = position.column;

  const imgMatch = line.match(/\\includegraphics\s*(?:\[[^\]]*\])?\{([^}]+)\}/);
  if (imgMatch && ed.imagePreview !== false && col >= imgMatch.index && col <= imgMatch.index + imgMatch[0].length) {
    const file = imgMatch[1].trim();
    const abs = resolveAsset(file);
    const stat = abs ? await ctx.api.fs.stat(abs) : null;
    if (abs && stat?.ok) {
      return '<div class="hover-card"><div class="hc-title">' + icon('image') + ' 插图预览</div>' +
        '<img class="hc-image" src="' + ctx.api.assetUrl(abs) + '" />' +
        '<div class="hc-meta">' + escapeHtml(file) + ' · ' + Math.round(stat.size / 1024) + ' KB</div></div>';
    }
    return '<div class="hover-card"><div class="hc-title">' + icon('alert') + ' 未找到图片</div><div class="hc-text">' + escapeHtml(file) + '</div></div>';
  }

  // table / tikz environment preview
  const envBlock = line.match(/\\begin\{(table\*?|tikzpicture)\}/);
  if (envBlock && col >= envBlock.index && col <= envBlock.index + envBlock[0].length) {
    const env = envBlock[1];
    const enabled = env === 'tikzpicture' ? ed.tikzPreview !== false : ed.tablePreview !== false;
    if (enabled) {
      const parsed = ctx.state.parsed;
      const entry = parsed?.environments.find((e) => e.env === env && e.line === position.lineNumber);
      if (entry && entry.endLine) {
        const lines = splitLines(model.getValue());
        let body = lines.slice(entry.line - 1, entry.endLine).join('\n');
        const kind = env === 'tikzpicture' ? 'tikz' : 'table';
        if (kind === 'table') body = tableSnippetBody(body);
        const rendered = await renderMath(body, true, kind);
        const head = '<div class="hover-card"><div class="hc-title">' + icon(env === 'tikzpicture' ? 'image' : 'table') + ' ' + escapeHtml(env) + ' 预览</div>';
        if (rendered.ok) {
          return head + '<div class="hc-math"><img src="' + rendered.url + '" /></div><div class="hc-meta">' + env + ' · 局部编译</div></div>';
        }
        return head + '<div class="hc-text danger-text">局部编译失败</div><pre class="hc-snippet">' + escapeHtml((rendered.error || '').slice(-500)) + '</pre></div>';
      }
    }
  }

  const refMatch = regexMatchAt(line, /\\(ref|eqref|autoref|cref|Cref|pageref|namecref|nameref)\{([^}]+)\}/g, col);
  if (refMatch && ed.refPreview !== false && col >= refMatch.index && col <= refMatch.index + refMatch[0].length) {
    const names = refMatch[2].split(',').map((x) => x.trim()).filter(Boolean);
    const targets = [];
    const missing = [];
    for (const name of names.slice(0, 3)) {
      const t = await labelTarget(name);
      if (t) targets.push({ name, ...t });
      else missing.push(name);
    }
    if (!targets.length) {
      return '<div class="hover-card"><div class="hc-title">' + icon('alert') + ' 未定义的引用</div><div class="hc-text">' +
        missing.map((n) => '<code>' + escapeHtml(n) + '</code>').join('、') + ' 不在项目标签中。</div></div>';
    }
    let html = '<div class="hover-card"><div class="hc-title">' + icon('target') + ' 引用目标</div>';
    for (const t of targets) {
      const preview = await renderTargetPreview(t);
      html += '<div class="hc-text"><strong>' + escapeHtml(t.name) + '</strong>' +
        (t.envEntry ? ' · <span class="hc-env">' + escapeHtml(t.envEntry.env) + '</span>' : '') +
        ' · 第 ' + t.label.line + ' 行</div>' + preview +
        '<pre class="hc-snippet">' + escapeHtml((t.context || '').slice(0, 360)) + '</pre>';
    }
    if (missing.length) html += '<div class="hc-meta">未找到：' + missing.map(escapeHtml).join('、') + '</div>';
    return html + '</div>';
  }

  const citeMatch = regexMatchAt(line, /\\(cite[a-zA-Z]*|parencite|textcite|autocite|footcite)\*?(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g, col);
  if (citeMatch && ed.refPreview !== false && col >= citeMatch.index && col <= citeMatch.index + citeMatch[0].length) {
    const keys = citeMatch[2].split(',').map((k) => k.trim()).filter(Boolean);
    const entries = keys.map((k) => (ctx.state.bibEntries || []).find((b) => b.key === k)).filter(Boolean);
    if (!entries.length) {
      return '<div class="hover-card"><div class="hc-title">' + icon('book') + ' 文献</div><div class="hc-text">未在项目中找到 ' +
        keys.slice(0, 4).map((k) => '<code>' + escapeHtml(k) + '</code>').join('、') + ' 的条目。</div></div>';
    }
    return '<div class="hover-card"><div class="hc-title">' + icon('book') + ' 参考文献</div>' + entries
      .map((e) => '<div class="hc-text"><strong>' + escapeHtml(e.title || e.key) + '</strong><br/>' + escapeHtml(e.author || '') +
        (e.year ? ' · ' + e.year : '') + (e.journal || e.booktitle ? '<br/><em>' + escapeHtml(e.journal || e.booktitle) + '</em>' : '') + '</div>')
      .join('<hr style="border:0;border-top:1px solid var(--border);margin:6px 0"/>') + '</div>';
  }

  const envMatch = line.match(/\\begin\{([^}]+)\}/);
  if (envMatch && col >= envMatch.index && col <= envMatch.index + envMatch[0].length) {
    const env = envMatch[1];
    const parsed = ctx.state.parsed;
    const entry = parsed?.environments.find((e) => e.env === env && e.line === position.lineNumber);
    const mathName = String(env).replace(/\*$/, '');
    if (['equation', 'align', 'gather', 'multline', 'eqnarray', 'displaymath', 'alignat', 'flalign'].includes(mathName) && entry?.endLine) {
      const lines = splitLines(model.getValue());
      const inner = lines.slice(entry.line, Math.max(entry.line, entry.endLine - 1)).join('\n');
      const rendered = await renderMath(wrappedDisplayBody(env, inner), true, 'math');
      if (rendered.ok) {
        return '<div class="hover-card"><div class="hc-title">' + icon('sigma') + ' ' + escapeHtml(env) + ' · 公式预览</div>' +
          '<div class="hc-math"><img src="' + rendered.url + '" /></div><div class="hc-meta">' + escapeHtml(env) + ' · 第 ' + entry.line + '–' + entry.endLine + ' 行</div></div>';
      }
    }
    return '<div class="hover-card"><div class="hc-title">' + icon('code') + ' ' + escapeHtml(env) + '</div>' +
      '<div class="hc-text">' + escapeHtml(envDescription(env)) + (entry?.caption ? ' · <strong>' + escapeHtml(entry.caption) + '</strong>' : '') + '</div>' +
      '<div class="hc-meta">' + (entry?.endLine ? (entry.endLine - entry.line + 1) + ' 行 · 至第 ' + entry.endLine + ' 行' : '环境开始') + '</div></div>';
  }

  if (ed.inlineMathPreview !== false) {
    const math = mathAtPosition(model, position);
    if (math && math.code.length < 900) {
      const rendered = await renderMath(math.code, math.display, math.kind || 'math');
      if (rendered.ok) {
        return '<div class="hover-card"><div class="hc-title">' + icon('sigma') + ' 公式预览' + (math.display ? ' · 行间公式' : '') + '</div>' +
          '<div class="hc-math"><img src="' + rendered.url + '" /></div><div class="hc-meta">' + escapeHtml(math.code.slice(0, 220)) + '</div></div>';
      }
      return '<div class="hover-card"><div class="hc-title">' + icon('alert') + ' 公式渲染失败</div><pre class="hc-snippet">' + escapeHtml((rendered.error || '').slice(-600)) + '</pre></div>';
    }
  }
  return null;
}

function resolveAsset(rel) {
  const root = ctx.state.project.root;
  if (!root) return '';
  const active = ctx.state.docs.get(ctx.state.activePath);
  const parts = String(rel).replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(parts)) return parts;
  const clean = parts.replace(/^\.\//, '');
  return `${root}\\${clean}`;
}

/* --------------------------------------------------------------- controller */
export class EditorController {
  constructor() {
    this.editor = null;
    this.model = null;
    this.decorations = null;
    this.blocks = [];
    this.railEl = null;
    this.aiBar = null;
    this.dropIndicator = null;
    this.ghost = null;
    this.hoveredBlock = null;
    this.mathZones = [];
    this.zoneGen = 0;
    this.drag = null;
    this.lastCursor = { line: 1, col: 1 };
    this.statsTimer = null;
    this.hoverEl = null;
    this.hoverTimer = null;
    this.hoverState = null;
  }

  init(host) {
    registerLanguages();
    defineThemes();
    host.innerHTML = '<div id="blockRail" class="block-rail"></div><div id="monaco"></div>';
    this.railEl = host.querySelector('#blockRail');
    const monacoHost = host.querySelector('#monaco');

    this.editor = monaco.editor.create(monacoHost, this.editorOptions());
    this.syncWrapClass();
    try { window.__monaco = monaco; } catch {}
    monaco.editor.setTheme(this.themeName());
    this.decorations = this.editor.createDecorationsCollection([]);
    this.hoverDecoration = this.editor.createDecorationsCollection([]);

    this.aiBar = document.createElement('div');
    this.aiBar.className = 'block-ai-bar';
    host.appendChild(this.aiBar);
    this.aiBar.addEventListener('mouseenter', () => clearTimeout(this._aiHideTimer));
    this.aiBar.addEventListener('mouseleave', () => this.scheduleHideAiBar(240));
    // Track the pointer on the stable host, not Monaco's regenerated line nodes.
    host.addEventListener('pointermove', (e) => {
      this.blockPointer = { x: e.clientX, y: e.clientY };
      this.refreshBlockHover();
    });
    host.addEventListener('pointerleave', () => {
      this.blockPointer = null;
      this.scheduleHideAiBar(240);
    });

    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'block-drop-indicator hidden';
    host.appendChild(this.dropIndicator);

    this.editor.onDidChangeCursorPosition((e) => {
      this.lastCursor = { line: e.position.lineNumber, col: e.position.column };
      this.updateBlocks();
      this.updateSelectionBar();
      ctx.emit('cursor', this.lastCursor);
      this.scheduleLiveMath();
    });
    this.editor.onDidChangeCursorSelection(() => this.updateSelectionBar());
    this.editor.onContextMenu((ev) => this.onEditorContextMenu(ev));
    this.editor.onDidScrollChange(() => {
      this.updateBlocks();
      if (this.liveMath) this.positionLiveMath(); else this.hideHover();
      // Scrolling moves blocks beneath a stationary pointer.
      cancelAnimationFrame(this._blockHoverFrame);
      this._blockHoverFrame = requestAnimationFrame(() => this.refreshBlockHover());
    });
    this.editor.onDidLayoutChange(() => {
      this.updateBlocks();
      if (this.hoveredBlock) this.positionAiBar(this.hoveredBlock);
      if (this.liveMath) this.positionLiveMath();
    });
    this.editor.onDidChangeModelContent((e) => {
      this.onContentChange(e);
    });
    this.editor.onMouseMove((e) => {
      this.scheduleHover(e);
    });
    this.editor.onMouseLeave(() => {
      if (!this.liveMath) this.hideHover();
    });
    this.editor.onMouseDown((e) => this.onMouseDown(e));

    monaco.editor.addKeybindingRules?.([
      { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, command: 'texora.bold' },
      { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, command: 'texora.italic' },
      { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, command: 'texora.underline' },
      { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, command: 'texora.emph' }
    ]);

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => ctx.app.openFind(false));
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => ctx.app.openFind(true));
    this.editor.addAction({ id: 'texora.bold', label: '加粗', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB], run: () => this.wrapSelection('bold') });
    this.editor.addAction({ id: 'texora.italic', label: '斜体', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI], run: () => this.wrapSelection('italic') });
    this.editor.addAction({ id: 'texora.underline', label: '下划线', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU], run: () => this.wrapSelection('underline') });
    this.editor.addAction({ id: 'texora.emph', label: '强调', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE], run: () => this.wrapSelection('emph') });
    this.editor.addAction({
      id: 'texora.insertEndEnv',
      label: '补全环境结束标记',
      run: (_ed, env) => this.insertEndEnv(env)
    });

    // Enter / auto-completion behaviour
    this.editor.onKeyDown((e) => this.onKeyDown(e));

    // paste images
    this.editor.getDomNode()?.addEventListener('paste', (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const image = items.find((i) => i.type.startsWith('image/'));
      if (image) {
        e.preventDefault();
        const file = image.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => ctx.cmd('insert.imageData', reader.result, 'clipboard');
          reader.readAsDataURL(file);
        }
      }
    });

    ctx.on('project:opened', () => this.refreshMathZones());
  }

  editorOptions() {
    const ed = ctx.state.settings?.editor || {};
    const fontSize = Number(ed.fontSize) || 14.5;
    const ratio = Number(ed.lineHeight) || 1.72;
    const family = ed.editorFont || 'Cascadia Code';
    return {
      fontFamily: `"${family}", "Cascadia Code", "JetBrains Mono", Consolas, monospace`,
      fontSize,
      lineHeight: Math.round(fontSize * ratio),
      letterSpacing: 0.15,
      fontLigatures: ed.ligatures === false ? false : '"calt", "liga"',
      fontFeatureSettings: ed.ligatures === false ? '"liga" 0' : '',
      lineNumbers: ed.lineNumbers === false ? 'off' : ed.relativeLineNumbers ? 'relative' : 'on',
      lineNumbersMinChars: 3,
      minimap: { enabled: !!ed.minimap, renderCharacters: false, maxColumn: 70 },
      wordWrap: ed.wordWrap ? 'on' : 'off',
      // Browser measurements handle Windows fallback fonts and mixed CJK text.
      wrappingStrategy: 'advanced',
      wordWrapBreakAfterCharacters: ' \\t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣\\$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      scrollBeyondLastColumn: ed.wordWrap ? 0 : 5,
      renderWhitespace: 'selection',
      renderControlCharacters: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      cursorWidth: 2,
      padding: { top: 12, bottom: 120 },
      folding: ed.folding !== false,
      foldingHighlight: true,
      foldingStrategy: 'auto',
      showFoldingControls: 'mouseover',
      unfoldOnClickAfterEndOfLine: true,
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      guides: { bracketPairs: 'active', indentation: true, highlightActiveIndentation: true },
      stickyScroll: { enabled: false },
      scrollBeyondLastLine: true,
      automaticLayout: true,
      tabSize: Number(ed.tabSize) || 2,
      insertSpaces: ed.insertSpaces !== false,
      detectIndentation: false,
      renderLineHighlight: 'all',
      renderLineHighlightOnlyWhenFocus: false,
      fixedOverflowWidgets: true,
      suggestSelection: 'first',
      quickSuggestions: { other: true, comments: false, strings: false },
      wordBasedSuggestions: 'off',
      quickSuggestionsDelay: 120,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'smart',
      tabCompletion: 'on',
      hover: { delay: 260, sticky: true },
      contextmenu: false,
      mouseWheelZoom: true,
      multiCursorModifier: 'alt',
      unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false, nonBasicASCII: false },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 11,
        horizontalScrollbarSize: 11,
        horizontal: ed.wordWrap ? 'hidden' : 'auto',
        useShadows: false,
        alwaysConsumeMouseWheel: false
      },
      glyphMargin: false,
      links: true,
      colorDecorators: true,
      selectionHighlight: true,
      occurrencesHighlight: 'singleFile',
      semanticHighlighting: { enabled: false },
      largeFileOptimizations: true,
      bracketPairGuides: true,
      formatOnPaste: false,
      formatOnType: false,
      autoClosingBrackets: ed.autoCloseBrackets === false ? 'never' : 'languageDefined',
      autoClosingQuotes: ed.autoCloseQuotes === false ? 'never' : 'languageDefined',
      autoSurround: 'languageDefined',
      autoIndent: 'full',
      tabFocusMode: false,
      accessibilitySupport: 'off',
      lineDecorationsWidth: 10
    };
  }

  themeName() {
    const preset = ctx.state.settings?.appearance?.codeTheme || 'auto';
    if (preset === 'auto') return ctx.state.theme === 'light' ? 'texora-light' : 'texora-dark';
    return 'texora-' + preset;
  }

  applyTheme() {
    defineThemes();
    monaco.editor.setTheme(this.themeName());
  }

  applySettings() {
    if (!this.editor) return;
    this.editor.updateOptions(this.editorOptions());
    this.syncWrapClass();
    this.applyTheme();
    this.setProblems(ctx.state.problems || []);
    this.refreshMathZones();
    this.updateBlocks();
  }

  syncWrapClass() {
    const host = document.getElementById('monaco');
    host?.parentElement?.classList.toggle('has-block-actions', this.blockAiVisible());
    this.editor?.layout();
    if (ctx.state.settings?.editor?.wordWrap) this.editor?.setScrollLeft(0);
  }

  /* ------------------------------------------------------------- documents */
  languageFor(path) {
    const ext = extOf(path);
    if (['tex', 'ltx', 'sty', 'cls', 'dtx', 'ins'].includes(ext)) return 'latex';
    if (ext === 'bib') return 'bibtex';
    if (ext === 'md') return 'markdown';
    if (['json', 'jsonc'].includes(ext)) return 'plaintext';
    if (ext === 'latexmkrc' || baseName(path) === '.latexmkrc') return 'latex-config';
    return 'plaintext';
  }

  createModel(path, text) {
    const uri = monaco.Uri.file(path.replace(/\\/g, '/'));
    const existing = monaco.editor.getModel(uri);
    if (existing) existing.dispose();
    return monaco.editor.createModel(text, this.languageFor(path), uri);
  }

  attach(doc, viewState) {
    this.hideHover(true);
    if (!this.editor) return;
    if (this.model) this.saveViewState();
    this.model = doc.model;
    this.editor.setModel(doc.model);
    this.lastCursor = { line: 1, col: 1 };
    if (viewState) this.editor.restoreViewState(viewState);
    this.editor.updateOptions(this.editorOptions());
    this.syncWrapClass();
    this.refreshMathZones();
  }

  saveViewState() {
    const doc = ctx.state.docs.get(ctx.state.activePath);
    if (doc && this.editor && this.editor.getModel() === doc.model) {
      doc.viewState = this.editor.saveViewState();
    }
  }

  focus() {
    this.editor?.focus();
  }

  /* ------------------------------------------------------------- behaviour */
  onContentChange(e) {
    const doc = ctx.state.docs.get(ctx.state.activePath);
    if (!doc) return;
    doc.dirty = true;
    ctx.emit('doc:changed', { path: doc.path });
    this.scheduleParse();
    this.scheduleAutoClose(e);
    this.scheduleLiveMath();
    this.updateBlocks();
    if (this.model) this.markDirtyTab();
  }

  scheduleAutoClose(e) {
    const ed = ctx.state.settings?.editor || {};
    if (ed.autoCloseEnd === false) return;
    const change = e?.changes?.[0];
    if (!change) return;
    // A completion acceptance inserts the whole name at once; typed input
    // arrives character by character, so wait for the user to finish the word.
    const accepted = (change.text || '').length > 1;
    clearTimeout(this._autoCloseTimer);
    this._autoCloseTimer = setTimeout(() => this.autoInsertEndEnv(), accepted ? 20 : 700);
  }

  /** Insert a matching \end{env} after a freshly completed \begin{env}. */
  autoInsertEndEnv() {
    if (!this.model) return;
    const pos = this.editor.getPosition();
    if (!pos) return;
    const line = this.model.getLineContent(pos.lineNumber);
    const m = line.match(/^(\s*)\\begin\{([a-zA-Z*]+)\}\s*$/);
    if (!m) return;
    const env = m[2];
    const indent = m[1];
    // Only auto-close known / defined environments. Otherwise typing
    // "\begin{equation}" would close "equ", "equa", ... prematurely and
    // dismiss the completion list.
    const known = new Set(ENVIRONMENTS);
    const docLines = this.model.getValue().split(/\r?\n/);
    for (const line of docLines) {
      const def = line.match(/\\(?:newtheorem|newenvironment)\*?\{([^}]+)\}/);
      if (def) known.add(def[1]);
    }
    docLines.forEach((line, idx) => {
      if (idx === pos.lineNumber - 1) return; // ignore the environment currently being typed
      for (const mm of line.matchAll(/\\(?:begin|end)\{([a-zA-Z*]+)\}/g)) known.add(mm[1]);
    });
    if (!known.has(env)) return;
    const key = pos.lineNumber + ':' + env;
    if (this._lastAutoEnv && this._lastAutoEnv.key === key && Date.now() - this._lastAutoEnv.at < 1500) return;
    const total = this.model.getLineCount();
    for (let ln = pos.lineNumber + 1; ln <= Math.min(total, pos.lineNumber + 80); ln++) {
      if (this.model.getLineContent(ln).includes('\\end{' + env + '}')) return;
    }
    const inner = indent + (ctx.state.settings?.editor?.indentSize === 4 ? '    ' : '  ');
    const text = '\n' + inner + '\n' + indent + '\\end{' + env + '}';
    this.editor.executeEdits('texora-autoenv', [
      { range: new monaco.Range(pos.lineNumber, line.length + 1, pos.lineNumber, line.length + 1), text }
    ]);
    this.editor.setPosition({ lineNumber: pos.lineNumber + 1, column: inner.length + 1 });
    this._lastAutoEnv = { key, at: Date.now() };
    this.editor.focus();
  }

  /** \begin + Enter → braces + suggestion list; \end + Enter → matching env. */
  insertBeginBraces() {
    if (!this.model) return;
    const pos = this.editor.getPosition();
    this.editor.executeEdits('texora-begin', [
      { range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: '{}' }
    ]);
    this.editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + 1 });
    this.editor.focus();
    setTimeout(() => this.editor.trigger('texora', 'editor.action.triggerSuggest', {}), 40);
    setTimeout(() => {
      if (!document.querySelector('.suggest-widget.visible')) this.editor.trigger('texora', 'editor.action.triggerSuggest', {});
    }, 220);
  }

  insertEndBraces() {
    if (!this.model) return;
    const pos = this.editor.getPosition();
    const stack = this.envStackAt(pos.lineNumber, pos.column);
    const env = stack[stack.length - 1] || '';
    const nextIsBrace = (this.model.getLineContent(pos.lineNumber)[pos.column - 1] || '') === '}';
    if (!env) {
      const text = nextIsBrace ? '' : '{}';
      if (text) {
        this.editor.executeEdits('texora-end', [
          { range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text }
        ]);
      }
      this.editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + 1 });
      setTimeout(() => this.editor.trigger('texora', 'editor.action.triggerSuggest', {}), 40);
      return;
    }
    const text = '{' + env;
    this.editor.executeEdits('texora-end', [
      { range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: text + (nextIsBrace ? '' : '}') }
    ]);
    this.editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + text.length + 1 });
  }

  insertEndEnv(env) {
    if (!this.model) return;
    const pos = this.editor.getPosition();
    const line = this.model.getLineContent(pos.lineNumber);
    const indent = (line.match(/^\s*/) || [''])[0];
    const inner = indent + '  ';
    this.editor.executeEdits('texora-env', [
      { range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: `\n${inner}\n${indent}\\end{${env}}` }
    ]);
    this.editor.setPosition({ lineNumber: pos.lineNumber + 1, column: inner.length + 1 });
  }

  onKeyDown(e) {
    if (e.keyCode === monaco.KeyCode.Escape && this.liveMath) { this._dismissedMath=this.liveMath.key; this.hideHover(true); return; }
    const ed = ctx.state.settings?.editor || {};
    const model = this.model;
    if (!model) return;
    if (e.keyCode === monaco.KeyCode.Enter && !e.shiftKey && !e.altKey) {
      const pos = this.editor.getPosition();
      const line = model.getLineContent(pos.lineNumber);
      const beforeCursor = line.slice(0, pos.column - 1);
      if (/^\\(?:cref|Cref|ref|eqref|autoref|pageref|nameref|cite[a-zA-Z]*|parencite|textcite|autocite|footcite)\s*$/.test(beforeCursor)) {
        e.preventDefault();
        this.insertBeginBraces();
        return;
      }
      if (/\\begin\s*$/.test(beforeCursor)) {
        e.preventDefault();
        this.insertBeginBraces();
        return;
      }
      if (/\\end\s*$/.test(beforeCursor)) {
        e.preventDefault();
        this.insertEndBraces();
        return;
      }
      // Let the suggestion widget own Enter for \\begin{env}| completions.
      if (document.querySelector('.suggest-widget.visible')) return;
      const envStack = this.envStackAt(pos.lineNumber, pos.column);
      const inList = envStack.some((env) => env === 'enumerate' || env === 'itemize' || env === 'description');
      if (inList && ed.listItemAuto !== false) {
        const trimmed = line.trim();
        const itemMatch = trimmed.match(/^\\item(\[[^\]]*\])?(.*)$/);
        if (itemMatch) {
          const indent = line.match(/^\s*/)[0];
          if (!itemMatch[2].trim()) {
            // empty item → exit list
            e.preventDefault();
            const listEnv = [...envStack].reverse().find((x) => ['enumerate', 'itemize', 'description'].includes(x)) || 'itemize';
            const endLine = this.findEnvEndLine(listEnv, pos.lineNumber);
            this.editor.executeEdits('texora-list-exit', [
              { range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, line.length + 1), text: '' }
            ]);
            if (endLine) {
              this.editor.setPosition({ lineNumber: endLine, column: model.getLineContent(endLine).length + 1 });
            }
            this.editor.trigger('texora', 'type', { text: '\n' });
            return;
          }
          e.preventDefault();
          const insert = `\n${indent}\\item `;
          this.editor.executeEdits('texora-item', [
            { range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: insert }
          ]);
          this.editor.setPosition({ lineNumber: pos.lineNumber + 1, column: indent.length + '\\item '.length + 1 });
          return;
        }
      }
      // smart indent inside environments / after \begin{env}
      const trimmedLine = stripComment(line).trim();
      if (/\\begin\{[^}]+\}\s*$/.test(trimmedLine) && !/\\end\{/.test(trimmedLine)) {
        e.preventDefault();
        const indent = (line.match(/^\s*/) || [''])[0];
        const inner = indent + (ed.indentSize === 4 ? '    ' : '  ');
        const envMatch = trimmedLine.match(/\\begin\{([^}]+)\}/);
        const env = envMatch ? envMatch[1] : '';
        const insertion = env === 'itemize' || env === 'enumerate' ? `\n${inner}\\item ` : `\n${inner}`;
        this.editor.executeEdits('texora-indent', [
          { range: new monaco.Range(pos.lineNumber, line.length + 1, pos.lineNumber, line.length + 1), text: insertion }
        ]);
        this.editor.setPosition({ lineNumber: pos.lineNumber + 1, column: inner.length + (env === 'itemize' || env === 'enumerate' ? 7 : 1) });
      }
    }
    // Ctrl+Enter → build
    if (e.keyCode === monaco.KeyCode.Enter && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      ctx.cmd('build.run');
    }
  }

  findEnvEndLine(env, fromLine) {
    if (!this.model) return 0;
    const total = this.model.getLineCount();
    let depth = 0;
    for (let ln = fromLine; ln <= total; ln++) {
      const text = stripComment(this.model.getLineContent(ln));
      if (text.includes(`\\begin{${env}}`)) depth++;
      if (text.includes(`\\end{${env}}`)) {
        if (depth === 0) return ln;
        depth--;
      }
    }
    return 0;
  }

  envStackAt(line, column) {
    if (!this.model) return [];
    const maxLine = this.model.getLineCount();
    line = Math.max(1, Math.min(maxLine, line || 1));
    column = Math.max(1, Math.min(this.model.getLineContent(line).length + 1, column || 1));
    const text = this.model.getValue();
    const lines = splitLines(text).slice(0, line - 1);
    lines.push((this.model.getLineContent(line) || '').slice(0, column - 1));
    const stack = [];
    const re = /\\(begin|end)\{([^}]+)\}/g;
    const clean = lines.join('\n').replace(/(?<!\\)%.*$/gm, '');
    let m;
    while ((m = re.exec(clean))) {
      if (m[1] === 'begin') stack.push(m[2]);
      else {
        const idx = stack.lastIndexOf(m[2]);
        if (idx >= 0) stack.length = idx;
      }
    }
    return stack;
  }

  onMouseDown(e) {
    // gutter double-click → forward sync
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS && e.event.detail === 2) {
      ctx.cmd('synctex.forward', e.target.position?.lineNumber);
      return;
    }
    // ctrl/cmd + click on ref/cite
    if ((e.event.ctrlKey || e.event.metaKey) && e.target.position) {
      const line = this.model.getLineContent(e.target.position.lineNumber);
      const ref = line.match(/\\(?:ref|eqref|autoref|cref|Cref|pageref)\{([^}]+)\}/);
      const cite = line.match(/\\(?:cite[a-zA-Z]*|parencite|textcite|autocite)\*?(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/);
      const inc = line.match(/\\(?:input|include)\{([^}]+)\}/);
      if (ref) {
        const target = (ctx.state.parsed?.labels || []).find((l) => l.name === ref[1]);
        if (target) {
          this.revealLine(target.line, 1, true);
          e.event.preventDefault();
        }
      } else if (cite) {
        ctx.cmd('insert.cite', cite[1].split(',')[0]);
      } else if (inc) {
        const rel = inc[1].trim();
        const full = `${ctx.state.project.root}\\${rel}${/\.(tex|ltx)$/.test(rel) ? '' : '.tex'}`;
        ctx.cmd('doc.open', full);
      }
    }
  }

  /* ------------------------------------------------------------ blocks / rail */
  scheduleParse = debounce(() => this.doParse(), 260);
  scheduleMathZones = debounce(() => this.refreshMathZones(), 900);

  doParse() {
    if (!this.model) return;
    const text = this.model.getValue();
    const parsed = parseDocument(text);
    ctx.state.parsed = parsed;
    ctx.state.blocks = ctx.state.settings?.editor?.blockMode === false ? [] : detectBlocks(text);
    this.blocks = ctx.state.blocks;
    ctx.emit('doc:parsed', parsed);
    this.updateBlocks(true);
    if (this.blockPointer) this.refreshBlockHover();
    this.updateDecorations(parsed);
    this.updateEnvDiagnostics(parsed, text);
  }

  updateDecorations(parsed) {
    if (!this.editor) return;
    const decos = [];
    // subtle guide for top-level environments
    for (const block of this.blocks || []) {
      if (block.kind !== 'env') continue;
      decos.push({
        range: new monaco.Range(block.startLine, 1, block.endLine, 1),
        options: { isWholeLine: true, className: 'block-env-line', linesDecorationsClassName: 'block-guide' }
      });
    }
    this.decorations?.set(decos);
  }

  updateEnvDiagnostics(parsed, text) {
    if (!this.model || !this.editor) return;
    if (ctx.state.settings?.editor?.envErrorHint === false) {
      monaco.editor.setModelMarkers(this.model, 'texora-env', []);
      return;
    }
    const lines = splitLines(text);
    const defined = new Set();
    for (const line of lines) {
      const m = line.match(/\\(?:newtheorem|newenvironment|DeclareDocumentEnvironment|NewDocumentEnvironment)\*?\{([^}]+)\}/);
      if (m) defined.add(m[1].trim());
    }
    const known = new Set(ENVIRONMENTS);
    for (const name of Object.keys(ctx.state.envDefs || {})) known.add(name);
    const ignoreWarnings = !!ctx.state.settings?.editor?.ignoreWarnings;
    const markers = [];
    // unmatched begin environments: no \end{env} after the begin line
    for (const env of parsed.environments) {
      if (!env || lines[env.line - 1] === undefined) continue;
      if (!/\\begin\{/.test(lines[env.line - 1])) continue;
      let found = false;
      for (let ln = env.line - 1; ln < lines.length; ln++) {
        if (lines[ln].includes(`\\end{${env.env}}`)) { found = true; break; }
      }
      if (!found && !defined.has(env.env) && !ignoreWarnings) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          startLineNumber: env.line,
          startColumn: (lines[env.line - 1].indexOf('\\begin') + 1) || 1,
          endLineNumber: env.line,
          endColumn: (lines[env.line - 1].length || 1) + 1,
          message: `环境 \begin{${env.env}} 缺少匹配的 \\end{${env.env}}`,
          source: 'TeXora'
        });
      }
      if (!known.has(env.env) && !defined.has(env.env) && !env.env.includes('*') && env.env.length > 2) {
        markers.push({
          severity: monaco.MarkerSeverity.Info,
          startLineNumber: env.line,
          startColumn: (lines[env.line - 1].indexOf('\\begin') + 1) || 1,
          endLineNumber: env.line,
          endColumn: (lines[env.line - 1].length || 1) + 1,
          message: `未知环境名 “${env.env}”，请检查拼写或在导言区定义`,
          source: 'TeXora'
        });
      }
    }
    monaco.editor.setModelMarkers(this.model, 'texora-env', markers.slice(0, 60));
  }

  updateBlocks(force = false) {
    if (!this.railEl) return;
    const enabled = ctx.state.settings?.editor?.blockMode !== false;
    this.railEl.style.display = enabled ? '' : 'none';
    if (!enabled || !this.editor) {
      this.railEl.innerHTML = '';
      return;
    }
    this.blocks = ctx.state.blocks || [];
    this.renderRail();
  }

  renderRail() {
    if (!this.railEl || !this.editor) return;
    const scrollTop = this.editor.getScrollTop();
    const height = this.editor.getLayoutInfo().height;
    const visible = this.blocks.filter((b) => {
      const top = this.editor.getTopForLineNumber(b.startLine) - scrollTop;
      return top > -24 && top < height;
    });
    this.railEl.innerHTML = visible
      .map((b) => {
        const top = this.editor.getTopForLineNumber(b.startLine) - scrollTop;
        const active = this.hoveredBlock && this.hoveredBlock.startLine === b.startLine;
        return `<div class="block-handle ${active ? 'visible' : ''}" data-start="${b.startLine}" data-end="${b.endLine}" style="top:${Math.max(0, top + 3)}px" title="拖动以重排该块">${icon('more')}</div>`;
      })
      .join('');
    for (const handle of Array.from(this.railEl.children)) {
      handle.addEventListener('pointerdown', (e) => this.beginDrag(e, Number(handle.dataset.start), Number(handle.dataset.end)));
      handle.addEventListener('mouseenter', () => {
        const start = Number(handle.dataset.start);
        const block = this.blocks.find((b) => b.startLine === start);
        if (block) {
          this.hoveredBlock = block;
          this.showBlockAiBar(block);
          handle.classList.add('visible');
        }
      });
    }
  }

  refreshBlockHover() {
    const point = this.blockPointer;
    if (!point || !this.editor) return;
    const element = document.elementFromPoint(point.x, point.y);
    if (this.aiBar?.contains(element)) {
      clearTimeout(this._aiHideTimer);
      if (this.hoveredBlock) this.positionAiBar(this.hoveredBlock);
      return;
    }
    const handle = element?.closest('.block-handle');
    const position = handle
      ? { lineNumber: Number(handle.dataset.start) }
      : this.editor.getTargetAtClientPoint(point.x, point.y)?.position;
    this.onMouseMove({ target: { position } });
  }

  onMouseMove(e) {
    if (!this.editor) return;
    if (this.aiBar?.classList.contains('visible') && this.aiBar.matches(':hover')) return;
    const pos = e.target.position;
    if (!pos) {
      this.scheduleHideAiBar();
      return;
    }
    clearTimeout(this._aiHideTimer);
    const block = this.blocks.find((b) => pos.lineNumber >= b.startLine && pos.lineNumber <= b.endLine);
    if (block !== this.hoveredBlock) {
      this.hoveredBlock = block || null;
      this.renderRail();
      if (block) {
        const selNow = this.editor.getSelection();
        if (selNow && !selNow.isEmpty()) this.hideAiBar();
        else this.showBlockAiBar(block);
      } else if (!this.editor.getSelection()?.isEmpty()) this.updateSelectionBar();
      else this.scheduleHideAiBar(280);
    } else if (block) {
      if (!this.aiBar?.classList.contains('visible')) this.showBlockAiBar(block);
      else this.positionAiBar(block);
    }
  }

  blockAiVisible() {
    return ctx.state.settings?.editor?.blockMode !== false;
  }

  showBlockAiBar(block) {
    clearTimeout(this._aiHideTimer);
    if (!this.blockAiVisible() || !this.aiBar) return;
    const sel = this.editor?.getSelection();
    if (sel && !sel.isEmpty()) return;
    const actions = ctx.state.settings?.ai?.blockActions || [];
    if (!actions.length) return;
    this.aiBar.innerHTML =
      actions
        .map(
          (a) =>
            `<button data-action="${escapeHtml(a.id)}" title="${escapeHtml(a.label)}">${icon(a.id === 'translate' ? 'translate' : a.id === 'ask' ? 'message' : 'wand')}<span class="ai-label">${escapeHtml(a.label)}</span></button>`
        )
        .join('') + `<button data-action="custom" title="自定义指令">${icon('sparkles')}<span class="ai-label">自定义</span></button>`;
    this.aiBar.classList.add('visible');
    this.aiBarBlock = block;
    this.hoverDecoration?.set([
      { range: new monaco.Range(block.startLine, 1, block.endLine, 1), options: { isWholeLine: true, className: 'block-hover-line' } }
    ]);
    const targetBlock = this.aiBarBlock || block;
    for (const btn of Array.from(this.aiBar.children)) {
      btn.onclick = (e) => {
        e.stopPropagation();
        const actionId = btn.dataset.action;
        let text = targetBlock.text || '';
        try {
          const last = this.model.getLineMaxColumn(targetBlock.endLine);
          text = this.model.getValueInRange(new monaco.Range(targetBlock.startLine, 1, targetBlock.endLine, last));
        } catch {}
        ctx.cmd(actionId === 'custom' ? 'ai.custom' : 'ai.blockAction', {
          actionId,
          block: { ...targetBlock, text }
        });
      };
    }
    this.positionAiBar(block);
  }

  positionAiBar(block) {
    if (!this.aiBar || !this.editor) return;
    const top = this.editor.getTopForLineNumber(block.startLine) - this.editor.getScrollTop();
    const barH = this.aiBar.offsetHeight;
    const localTop = Math.max(0, Math.min(this.editor.getLayoutInfo().height - barH - 2, top + 2));
    this.aiBar.style.top = localTop + 'px';
    this.aiBar.style.right = '4px';
  }

  scheduleHideAiBar(delay = 260) {
    clearTimeout(this._aiHideTimer);
    this._aiHideTimer = setTimeout(() => {
      if (this.aiBar && this.aiBar.matches(':hover')) return;
      this.hoveredBlock = null;
      this.hideAiBar();
      this.renderRail();
    }, delay);
  }

  hideAiBar() {
    clearTimeout(this._aiHideTimer);
    this.aiBar?.classList.remove('visible');
    this.hoverDecoration?.set([]);
    this.aiBarBlock = null;
    this.hoveredBlock = null;
  }

  scheduleHover(e) {
    if (this.liveMath) return;
    const pos = e.target.position;
    if (!pos || e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      this.hideHover();
      return;
    }
    if (this.hoverState && this.hoverState.line === pos.lineNumber && this.hoverState.col === pos.column) return;
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => {
      this.showHoverAt(pos, e.event?.posx, e.event?.posy);
    }, 300);
  }

  async showHoverAt(pos, x, y) {
    if (!this.model) return;
    const model = this.model, version = model.getVersionId();
    const math = mathAtPosition(model, pos);
    if (math && ctx.state.settings.editor.inlineMathPreview !== false) { this.showLiveMath(pos, math); return; }
    let html = null;
    try {
      html = await buildHoverContent(this.model, pos);
    } catch (err) {
      console.warn('[hover]', err.message);
    }
    if (this.liveMath || this.model !== model || model.getVersionId() !== version) return;
    if (!html) {
      this.hideHover();
      return;
    }
    const host = document.querySelector('#editorHost');
    if (!this.hoverEl) {
      this.hoverEl = document.createElement('div');
      this.hoverEl.className = 'texora-hover';
      host.appendChild(this.hoverEl);
    }
    this.hoverState = { line: pos.lineNumber, col: pos.column };
    this.hoverEl.innerHTML = html;
    this.hoverEl.style.display = 'block';
    const hostRect = host.getBoundingClientRect();
    let left;
    let top;
    if (typeof x === 'number' && typeof y === 'number') {
      left = x - hostRect.left + 16;
      top = y - hostRect.top + 18;
    } else {
      const p = this.editor.getScrolledVisiblePosition(pos);
      left = (p ? p.left : 240) + 24;
      top = (p ? p.top : 120) + 24;
    }
    const w = this.hoverEl.offsetWidth;
    const h = this.hoverEl.offsetHeight;
    if (left + w > hostRect.width - 10) left = Math.max(8, hostRect.width - w - 10);
    if (top + h > hostRect.height - 10) top = Math.max(8, hostRect.height - h - 10);
    this.hoverEl.style.left = Math.max(8, left) + 'px';
    this.hoverEl.style.top = Math.max(8, top) + 'px';
  }

  hideHover(force = false) {
    if (this.liveMath && !force) return;
    this.liveMath = null;
    this._liveSequence = (this._liveSequence || 0) + 1;
    clearTimeout(this._nativeMathTimer);
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverState = null;
    this.hoverEl?.classList.remove('live-math');
    if (this.hoverEl) { this.hoverEl.style.visibility=''; this.hoverEl.style.maxHeight=''; }
    if (this.hoverEl) this.hoverEl.style.display = 'none';
  }

  updateSelectionBar() {
    if (!this.editor || !this.aiBar) return;
    const sel = this.editor.getSelection();
    if (sel && !sel.isEmpty()) {
      // Selection actions live in the right-click menu; no floating bar.
      this.hideAiBar();
      return;
    }
    if (this.hoveredBlock) this.showBlockAiBar(this.hoveredBlock);
    else this.hideAiBar();
  }

  onEditorContextMenu(ev) {
    if (!this.editor || !this.model) return;
    const native = ev.event;
    const selection = this.editor.getSelection();
    const pos = ev.target?.position;
    let inside = !!selection && !selection.isEmpty();
    if (inside && pos && typeof selection.containsPosition === 'function') {
      inside = selection.containsPosition(pos);
    }
    native?.preventDefault?.();
    native?.stopPropagation?.();
    if (!inside) {
      this.hideAiBar();
      return;
    }
    const browser = native?.browserEvent || native || {};
    const hostRect = this.editor.getDomNode().getBoundingClientRect();
    const x = typeof browser.clientX === 'number' ? browser.clientX : hostRect.left + (native?.posx ?? 200);
    const y = typeof browser.clientY === 'number' ? browser.clientY : hostRect.top + (native?.posy ?? 120);
    const anchor = {
      getBoundingClientRect: () => ({ left: x, top: y, right: x, bottom: y, width: 0, height: 0 }),
      contains: () => false
    };
    const selected = this.model.getValueInRange(selection);
    const items = [
      { label: '剪切', key: 'Ctrl+X', onClick: async () => {
        await ctx.api.clipboard.writeText(selected);
        this.editor.executeEdits('ctx-cut', [{ range: selection, text: '' }]);
        this.editor.focus();
      } },
      { label: '复制', key: 'Ctrl+C', onClick: async () => {
        await ctx.api.clipboard.writeText(selected);
        this.editor.focus();
      } },
      { label: '粘贴', key: 'Ctrl+V', onClick: async () => {
        const res = await ctx.api.clipboard.readText();
        if (res?.ok && res.text) this.editor.executeEdits('ctx-paste', [{ range: selection, text: res.text }]);
        this.editor.focus();
      } },
      { separator: true },
      { group: 'AI' }
    ];
    for (const action of (ctx.state.settings?.ai?.blockActions || [])) {
      items.push({ label: action.label, icon: action.id === 'ask' ? 'message' : action.id === 'translate' ? 'code' : 'wand', onClick: () => ctx.cmd('ai.selectionAction', { actionId: action.id }) });
    }
    items.push({ label: '自定义 AI 指令…', icon: 'sparkles', onClick: () => ctx.cmd('ai.customSelection') });
    items.push({ separator: true });
    items.push({ label: '查找选中内容', icon: 'search', key: 'Ctrl+F', onClick: () => ctx.app.openFind(false) });
    items.push({ label: '全选', key: 'Ctrl+A', onClick: () => this.editor.trigger('texora', 'editor.action.selectAll') });
    openMenu(anchor, items, { minWidth: 190, align: 'left' });
  }

  /* ---------------------------------------------------------------- drag */
  beginDrag(event, startLine, endLine) {
    if (ctx.state.settings?.editor?.blockDrag === false) return;
    event.preventDefault();
    if (!this.model) return;
    const lines = splitLines(this.model.getValue());
    const blockText = lines.slice(startLine - 1, endLine).join('\n');
    this.ghost = document.createElement('div');
    this.ghost.className = 'block-drag-ghost';
    this.ghost.textContent = blockText.slice(0, 220) + (blockText.length > 220 ? '…' : '');
    document.body.appendChild(this.ghost);
    this.drag = { startLine, endLine, targetLine: startLine, moved: false };
    const move = (e) => {
      this.ghost.style.left = e.clientX + 18 + 'px';
      this.ghost.style.top = e.clientY + 8 + 'px';
      const target = this.editor.getTargetAtClientPoint(e.clientX, e.clientY);
      if (target?.position) {
        let line = target.position.lineNumber;
        if (line >= startLine && line <= endLine) line = startLine;
        this.drag.targetLine = line;
        this.drag.moved = Math.abs(this.drag.targetLine - startLine) > 0;
        const top = this.editor.getTopForLineNumber(line) - this.editor.getScrollTop();
        this.dropIndicator.style.top = top + 'px';
        this.dropIndicator.classList.remove('hidden');
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      this.ghost?.remove();
      this.ghost = null;
      this.dropIndicator.classList.add('hidden');
      if (this.drag && this.drag.moved && this.drag.targetLine !== startLine) {
        this.moveBlock(this.drag.startLine, this.drag.endLine, this.drag.targetLine);
      }
      this.drag = null;
      this.updateBlocks();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  moveBlock(startLine, endLine, targetLine) {
    if (!this.model) return;
    if (targetLine >= startLine && targetLine <= endLine) return;
    const lines = splitLines(this.model.getValue());
    const blockLines = lines.slice(startLine - 1, endLine);
    const rest = lines.slice();
    rest.splice(startLine - 1, endLine - startLine + 1);
    let insertAt = targetLine - 1;
    if (targetLine > endLine) insertAt = targetLine - (endLine - startLine + 1) - 1;
    insertAt = Math.max(0, Math.min(rest.length, insertAt));
    rest.splice(insertAt, 0, ...blockLines);
    const newText = rest.join('\n');
    this.editor.pushUndoStop();
    this.model.pushEditOperations(
      [],
      [{ range: this.model.getFullModelRange(), text: newText, forceMoveMarkers: true }],
      () => null
    );
    this.editor.pushUndoStop();
    this.editor.setPosition({ lineNumber: insertAt + 1, column: 1 });
    ctx.cmd('doc.markDirty');
  }

  /* Formula/table/TikZ previews use overlays; never insert editor view zones. */
  refreshMathZones() {
    this.zoneGen++;
    this.clearMathZones();
    this.scheduleLiveMath();
  }

  scheduleLiveMath = debounce(() => {
    const pos = this.editor?.getPosition();
    const math = this.model && pos && ctx.state.settings.editor.inlineMathPreview !== false ? mathAtPosition(this.model, pos) : null;
    if (!math) { this.hideHover(true); this._dismissedMath = null; return; }
    if (this._dismissedMath === this.model.uri.toString()+':'+math.start) return;
    this.showLiveMath(pos, math);
  }, 70);

  showLiveMath(pos, math) {
    const model = this.model;
    const key = model.uri.toString()+':'+math.start;
    const changed = this.liveMath?.key !== key;
    if (!this.hoverEl) {
      this.hoverEl = document.createElement('div');
      this.hoverEl.className = 'texora-hover';
      document.querySelector('#editorHost').appendChild(this.hoverEl);
    }
    if (changed) {
      this.hoverEl.innerHTML = '<div class="hover-card"><div class="hc-title">'+icon('sigma')+' 公式预览 <button class="live-math-close" title="关闭预览">×</button></div><div class="hc-math live-math-body">正在预览…</div><div class="hc-meta live-math-status"></div></div>';
      this.hoverEl.querySelector('button').onclick = () => { this._dismissedMath = key; this.hideHover(true); this.editor.focus(); };
    }
    const sequence = this._liveSequence = (this._liveSequence || 0)+1;
    this.liveMath = { key, math, pos, model, version:model.getVersionId(), sequence };
    this.hoverEl.classList.add('live-math');
    this.hoverEl.style.display = 'block';
    const body=this.hoverEl.querySelector('.live-math-body'), status=this.hoverEl.querySelector('.live-math-status');
    try {
      const rootModel=ctx.state.docs.get(ctx.state.project.rootFile)?.model || model;
      const macros={};
      const definitions=mathDefinitions(rootModel.getValue());
      if(definitions) { try { katex.renderToString(definitions,{macros,globalGroup:true,throwOnError:true,trust:false,maxExpand:1000}); } catch {} }
      const html=katex.renderToString(math.code.replace(/\\label\s*\{[^}]*\}/g,''),{displayMode:math.display,throwOnError:true,trust:false,macros,maxExpand:1000,strict:'ignore'});
      body.innerHTML=html;status.textContent='实时预览';
    } catch {
      if(changed)body.textContent='公式输入中…';
      status.textContent='输入中，保留上次预览；停顿后使用本地 TeX 更新';
    }
    this.positionLiveMath();
    clearTimeout(this._nativeMathTimer);
    this._nativeMathTimer=setTimeout(()=>this.renderNativeMath(),650);
  }

  async renderNativeMath() {
    if(!this.liveMath)return;
    if(this._nativeMathBusy){this._nativeMathTimer=setTimeout(()=>this.renderNativeMath(),250);return;}
    const state=this.liveMath;
    if(!state.math.code.trim())return;
    this._nativeMathBusy=true;
    try {
      const rendered=await renderMath(state.math.code,state.math.display,'math');
      if(this.liveMath!==state || this.model!==state.model || state.model.getVersionId()!==state.version)return;
      const status=this.hoverEl.querySelector('.live-math-status');
      if(rendered.ok){
        const image=new Image();image.src=rendered.url;
        await image.decode().catch(()=>{});
        if(this.liveMath!==state || this.model!==state.model || state.model.getVersionId()!==state.version)return;
        this.hoverEl.querySelector('.live-math-body').replaceChildren(image);
        status.textContent='本地 TeX 预览';this.positionLiveMath();
      }else status.textContent='本次公式暂未编译通过，保留上次预览';
    } finally {this._nativeMathBusy=false;}
  }

  positionLiveMath() {
    if(!this.liveMath || !this.hoverEl)return;
    const p=this.editor.getScrolledVisiblePosition(this.liveMath.pos);
    if(!p){this.hoverEl.style.visibility='hidden';return;}
    this.hoverEl.style.visibility='visible';
    const host=document.querySelector('#editorHost').getBoundingClientRect();
    const width=this.hoverEl.offsetWidth;
    this.hoverEl.style.left=Math.max(8,Math.min(p.left,host.width-width-12))+'px';
    // Fit above the current input line. When near the top, use space beneath it.
    const above=p.top-12, below=host.height-p.top-p.height-12;
    const useAbove=above>=100 || above>=below;
    this.hoverEl.style.maxHeight=Math.max(48,Math.min(300,useAbove?above:below))+'px';
    this.hoverEl.style.top=(useAbove?Math.max(0,p.top-this.hoverEl.offsetHeight-10):p.top+p.height+10)+'px';
  }

  clearMathZones() {
    if (!this.editor || !this.mathZones.length) {
      this.mathZones = [];
      return;
    }
    const ids = this.mathZones.slice();
    this.mathZones = [];
    this.editor.changeViewZones((accessor) => ids.forEach((id) => accessor.removeZone(id)));
  }

  /* ------------------------------------------------------------- utilities */
  markDirtyTab() {
    ctx.emit('doc:changed', { path: ctx.state.activePath });
  }

  setProblems(problems) {
    if (!this.model) return;
    const maxLine = this.model.getLineCount();
    const ignoreWarnings = !!ctx.state.settings?.editor?.ignoreWarnings;
    const markers = (problems || [])
      .filter((p) => p.file && (p.line || 0) > 0 && namesEqual(p.file, ctx.state.activePath))
      .filter((p) => !(ignoreWarnings && p.severity === 'warning'))
      .map((p) => ({
        severity: p.severity === 'error' ? monaco.MarkerSeverity.Error : p.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
        startLineNumber: Math.min(maxLine, Math.max(1, p.line || 1)),
        startColumn: Math.max(1, p.column || 1),
        endLineNumber: Math.min(maxLine, Math.max(1, p.line || 1)),
        endColumn: Math.max(2, (p.column || 1) + 40),
        message: p.message + (p.detail ? `\n${p.detail}` : ''),
        source: p.source || 'LaTeX'
      }));
    monaco.editor.setModelMarkers(this.model, 'texora', markers);
  }

  revealLine(line, column = 1, flash = false) {
    if (!this.editor) return;
    this.editor.revealLineInCenter(Math.max(1, line));
    this.editor.setPosition({ lineNumber: Math.max(1, line), column: Math.max(1, column) });
    this.editor.focus();
    if (flash) {
      const deco = this.editor.createDecorationsCollection([
        {
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className: 'synctex-line-flash' }
        }
      ]);
      setTimeout(() => deco.clear(), 1800);
    }
  }

  revealRange(startLine, endLine) {
    if (!this.editor) return;
    const model = this.editor.getModel();
    const start = new monaco.Range(startLine, 1, endLine, (model?.getLineContent(endLine)?.length || 1) + 1);
    this.editor.setSelection(start);
    this.editor.revealRangeInCenter(start);
    const deco = this.editor.createDecorationsCollection([
      { range: start, options: { isWholeLine: true, className: 'synctex-line-flash' } }
    ]);
    setTimeout(() => deco.clear(), 1800);
  }

  getSelectionText() {
    const sel = this.editor?.getSelection();
    if (!sel || sel.isEmpty()) return '';
    return this.model.getValueInRange(sel);
  }

  getCurrentParagraph() {
    if (!this.editor || !this.model) return { text: '', startLine: 1, endLine: 1 };
    const pos = this.editor.getPosition();
    const block = this.blocks.find((b) => pos.lineNumber >= b.startLine && pos.lineNumber <= b.endLine);
    if (block) return { text: block.text || '', startLine: block.startLine, endLine: block.endLine, env: block.env, kind: block.kind };
    return { text: this.model.getLineContent(pos.lineNumber), startLine: pos.lineNumber, endLine: pos.lineNumber, kind: 'paragraph' };
  }

  wrapSelection(cmd) {
    if (!this.editor || !this.model) return;
    const sel = this.editor.getSelection();
    if (!sel) return;
    const stack = this.envStackAt(sel.startLineNumber, sel.startColumn);
    const cmdName = wrapCommandFor(cmd, stack);
    const text = sel.isEmpty() ? '' : this.model.getValueInRange(sel);
    const snippet = `${cmdName}{${text}}`;
    this.editor.executeEdits('texora-format', [{ range: sel, text: snippet }]);
    if (sel.isEmpty()) {
      this.editor.setPosition({ lineNumber: sel.startLineNumber, column: sel.startColumn + cmdName.length + 1 });
    }
    this.editor.focus();
    // collapse cursor into place
    this.editor.trigger('texora', 'editor.action.triggerSuggest', {});
  }

  insertText(text, { selectOffset } = {}) {
    if (!this.editor) return;
    const sel = this.editor.getSelection();
    this.editor.executeEdits('texora-insert', [{ range: sel, text, forceMoveMarkers: true }]);
    if (selectOffset) {
      const pos = this.editor.getPosition();
      const model = this.model;
      const idx = text.indexOf(selectOffset);
      if (idx >= 0) {
        const before = text.slice(0, idx);
        const lines = before.split('\n');
        const line = pos.lineNumber + lines.length - 1;
        const column = lines.length === 1 ? pos.column + before.length : lines[lines.length - 1].length + 1;
        this.editor.setPosition({ lineNumber: line, column });
      }
    }
    this.editor.focus();
  }

  replaceAll(text) {
    if (!this.model) return;
    this.model.pushEditOperations([], [{ range: this.model.getFullModelRange(), text, forceMoveMarkers: true }], () => null);
  }

  selectionOrLine() {
    const sel = this.editor.getSelection();
    if (!sel) return { range: null, text: '', isSelection: false };
    if (!sel.isEmpty()) return { range: sel, text: this.model.getValueInRange(sel), isSelection: true };
    const line = sel.startLineNumber;
    return {
      range: new monaco.Range(line, 1, line, this.model.getLineContent(line).length + 1),
      text: this.model.getLineContent(line),
      isSelection: false
    };
  }

  gotoBibKey(key) {
    ctx.cmd('insert.cite', key);
  }

  resize() {
    this.editor?.layout();
  }
}

function namesEqual(a, b) {
  if (!a || !b) return false;
  const norm = (p) => String(p).replace(/\//g, '\\').toLowerCase();
  return norm(a) === norm(b);
}

export { monaco, defineThemes };
