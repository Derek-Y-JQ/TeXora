import * as monaco from 'monaco-editor/esm/vs/editor/editor.main';
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function defineThemes() {
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

