import * as monaco from 'monaco-editor/esm/vs/editor/editor.main';
import { endfieldEditorChrome } from './endfield-editor.js';
import { CODE_THEME_SPECS, buildMonacoTheme } from './editor-theme-data.js';

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const THEME_SURFACES = new Map();

export function getThemeSurface(name) {
  return THEME_SURFACES.get(name) || null;
}

export function defineThemes() {
  const accent = cssVar('--accent', '#8b7cf8');
  const chrome = endfieldEditorChrome();
  const defineTheme = (name, theme) => {
    const baseColors = { ...theme.colors };
    if (baseColors['editor.background']) {
      if (!baseColors['editorGutter.background']) baseColors['editorGutter.background'] = baseColors['editor.background'];
      if (!baseColors['editorStickyScroll.background']) baseColors['editorStickyScroll.background'] = baseColors['editor.background'];
    }
    let nextColors = baseColors;
    if (chrome) {
      const automatic = name === 'texora-light' || name === 'texora-dark';
      nextColors = {
        ...baseColors,
        ...chrome.colors,
        'editorCursor.foreground': theme.base === 'vs-dark' ? cssVar('--ef-signal') : '#161616',
        ...(automatic ? {
          'editor.background': chrome.panel, 'editor.foreground': chrome.ink,
          'editorGutter.background': chrome.panel, 'editorStickyScroll.background': chrome.panel,
          'editorLineNumber.foreground': chrome.muted, 'editorLineNumber.activeForeground': chrome.ink,
          'editor.lineHighlightBackground': chrome.inset,
          'editorIndentGuide.background1': chrome.border, 'editorIndentGuide.activeBackground1': chrome.muted
        } : {})
      };
    }
    const bg = nextColors['editor.background'] || '';
    const gutter = nextColors['editorGutter.background'] || bg;
    if (bg) THEME_SURFACES.set(name, { bg, gutter });
    monaco.editor.defineTheme(name, { ...theme, colors: nextColors });
  };

  defineTheme('texora-dark', {
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

  defineTheme('texora-light', {
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
      'editorBracketMatch.border': '#6a56f060',
      'editorStickyScroll.background': '#ffffff'
    }
  });

  for (const [id, spec] of Object.entries(CODE_THEME_SPECS)) {
    defineTheme('texora-' + id, buildMonacoTheme(spec));
  }
}
