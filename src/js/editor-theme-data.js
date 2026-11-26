/**
 * Pure code syntax highlighting theme specifications (no Monaco import)
 * so both the renderer and Node unit tests can inspect and validate them.
 */

export const CODE_THEME_SPECS = {
  // ------------------------------------------------------------------- Dark
  'one-dark': {
    base: 'vs-dark',
    bg: '#282c34', fg: '#abb2bf', lineNum: '#4b5263', lineNumActive: '#61afef',
    lineHl: '#2c313c', sel: '#3e4451', selInactive: '#323842', cursor: '#528bff',
    indent: '#353b45', widgetBg: '#21252b', widgetBorder: '#181a1f', suggestSel: '#2c313a',
    tokens: {
      comment: '5c6370', kw: 'c678dd', env: 'e06c75', envName: 'e5c07b',
      str: '98c379', math: '56b6c2', num: 'd19a66', delim: 'abb2bf',
      type: '61afef', attr: 'd19a66', var: 'e06c75', invalid: 'f44747'
    }
  },
  'github': {
    base: 'vs-dark',
    bg: '#0d1117', fg: '#c9d1d9', lineNum: '#484f58', lineNumActive: '#c9d1d9',
    lineHl: '#161b22', sel: '#264f78', selInactive: '#1c2d42', cursor: '#58a6ff',
    indent: '#21262d', widgetBg: '#161b22', widgetBorder: '#30363d', suggestSel: '#1f6feb33',
    tokens: {
      comment: '8b949e', kw: 'ff7b72', env: 'ffa657', envName: 'd2a8ff',
      str: 'a5d6ff', math: '79c0ff', num: '79c0ff', delim: 'c9d1d9',
      type: 'd2a8ff', attr: '79c0ff', var: 'ffa657', invalid: 'f85149'
    }
  },
  'dracula': {
    base: 'vs-dark',
    bg: '#282a36', fg: '#f8f8f2', lineNum: '#6272a4', lineNumActive: '#f8f8f2',
    lineHl: '#343746', sel: '#44475a', selInactive: '#383b4c', cursor: '#f8f8f2',
    indent: '#3b3e4f', widgetBg: '#21222c', widgetBorder: '#191a21', suggestSel: '#44475a',
    tokens: {
      comment: '6272a4', kw: 'ff79c6', env: 'bd93f9', envName: '50fa7b',
      str: 'f1fa8c', math: '8be9fd', num: 'bd93f9', delim: 'f8f8f2',
      type: '8be9fd', attr: '50fa7b', var: 'ffb86c', invalid: 'ff5555'
    }
  },
  'dracula-deep': {
    base: 'vs-dark',
    bg: '#171923', fg: '#f4f4f8', lineNum: '#566185', lineNumActive: '#f4f4f8',
    lineHl: '#202331', sel: '#343952', selInactive: '#272b3f', cursor: '#ff79c6',
    indent: '#272b3d', widgetBg: '#12141c', widgetBorder: '#282c3f', suggestSel: '#343952',
    tokens: {
      comment: '5c678f', kw: 'ff6ac1', env: 'a98bff', envName: '5af78e',
      str: 'f3f99d', math: '78e8fc', num: 'bd93f9', delim: 'd7dce8',
      type: '78e8fc', attr: '5af78e', var: 'ffb86c', invalid: 'ff5c57'
    }
  },
  'night-owl': {
    base: 'vs-dark',
    bg: '#011627', fg: '#d6deeb', lineNum: '#4b6479', lineNumActive: '#c5e4fd',
    lineHl: '#0b253a', sel: '#1d3b53', selInactive: '#122d42', cursor: '#80a4c2',
    indent: '#122d42', widgetBg: '#01111d', widgetBorder: '#1d3b53', suggestSel: '#1d3b53',
    tokens: {
      comment: '637777', kw: 'c792ea', env: '7fdbca', envName: 'addb67',
      str: 'ecc48d', math: '82aaff', num: 'f78c6c', delim: 'd6deeb',
      type: '82aaff', attr: 'addb67', var: 'ff5874', invalid: 'ef5350'
    }
  },
  'monokai': {
    base: 'vs-dark',
    bg: '#272822', fg: '#f8f8f2', lineNum: '#75715e', lineNumActive: '#f8f8f2',
    lineHl: '#3e3d32', sel: '#49483e', selInactive: '#3b3a32', cursor: '#f8f8f0',
    indent: '#3b3a32', widgetBg: '#1e1f1c', widgetBorder: '#34352f', suggestSel: '#414339',
    tokens: {
      comment: '75715e', kw: 'f92672', env: 'a6e22e', envName: '66d9ef',
      str: 'e6db74', math: '66d9ef', num: 'ae81ff', delim: 'f8f8f2',
      type: '66d9ef', attr: 'a6e22e', var: 'fd971f', invalid: 'f92672'
    }
  },
  'monokai-pro': {
    base: 'vs-dark',
    bg: '#2d2a2e', fg: '#fcfcfa', lineNum: '#5b595c', lineNumActive: '#c1c0c0',
    lineHl: '#383539', sel: '#4a464c', selInactive: '#3c393e', cursor: '#fcfcfa',
    indent: '#403e41', widgetBg: '#221f22', widgetBorder: '#403e41', suggestSel: '#4a464c',
    tokens: {
      comment: '727072', kw: 'ff6188', env: 'a9dc76', envName: 'fc9867',
      str: 'ffd866', math: '78dce8', num: 'ab9df2', delim: '939293',
      type: '78dce8', attr: 'a9dc76', var: 'fc9867', invalid: 'ff6188'
    }
  },
  'cobalt2': {
    base: 'vs-dark',
    bg: '#193549', fg: '#ffffff', lineNum: '#5c829e', lineNumActive: '#ffc600',
    lineHl: '#1f4662', sel: '#0050a4', selInactive: '#174166', cursor: '#ffc600',
    indent: '#234c6b', widgetBg: '#15232d', widgetBorder: '#0d3a58', suggestSel: '#0050a4',
    tokens: {
      comment: '0088ff', kw: 'ff9d00', env: 'ffc600', envName: '80ffbb',
      str: '3ad900', math: '80ffbb', num: 'ff628c', delim: 'e1efff',
      type: '9effff', attr: 'ffc600', var: 'fb94ff', invalid: 'ff628c'
    }
  },
  'catppuccin-macchiato': {
    base: 'vs-dark',
    bg: '#24273a', fg: '#cad3f5', lineNum: '#6e738d', lineNumActive: '#b7bdf8',
    lineHl: '#2c3047', sel: '#494d64', selInactive: '#363a4f', cursor: '#f4dbd6',
    indent: '#363a4f', widgetBg: '#1e2030', widgetBorder: '#363a4f', suggestSel: '#494d64',
    tokens: {
      comment: '6e738d', kw: 'c6a0f6', env: 'f5a97f', envName: '8aadf4',
      str: 'a6da95', math: '8bd5ca', num: 'eed49f', delim: '939ab7',
      type: '8aadf4', attr: 'eed49f', var: 'ed8796', invalid: 'ed8796'
    }
  },
  'catppuccin-mocha': {
    base: 'vs-dark',
    bg: '#1e1e2e', fg: '#cdd6f4', lineNum: '#6c7086', lineNumActive: '#b4befe',
    lineHl: '#26263a', sel: '#45475a', selInactive: '#313244', cursor: '#f5e0dc',
    indent: '#313244', widgetBg: '#181825', widgetBorder: '#313244', suggestSel: '#45475a',
    tokens: {
      comment: '6c7086', kw: 'cba6f7', env: 'fab387', envName: '89b4fa',
      str: 'a6e3a1', math: '94e2d5', num: 'f9e2af', delim: '9399b2',
      type: '89b4fa', attr: 'f9e2af', var: 'f38ba8', invalid: 'f38ba8'
    }
  },
  'ayu-mirage': {
    base: 'vs-dark',
    bg: '#1f2430', fg: '#cbccc6', lineNum: '#5c6773', lineNumActive: '#ffcc66',
    lineHl: '#262c3a', sel: '#33415e', selInactive: '#293246', cursor: '#ffcc66',
    indent: '#2d3444', widgetBg: '#191e2a', widgetBorder: '#2d3444', suggestSel: '#33415e',
    tokens: {
      comment: '5c6773', kw: 'ffa759', env: '5ccfe6', envName: 'ffd580',
      str: 'bae67e', math: 'd4bfff', num: 'ffcc66', delim: '95a0ad',
      type: '73d0ff', attr: 'ffd580', var: 'f28779', invalid: 'ff3333'
    }
  },
  'blk-theme': {
    base: 'vs-dark',
    bg: '#0a0a0c', fg: '#e6e6eb', lineNum: '#4b4b56', lineNumActive: '#e6e6eb',
    lineHl: '#141418', sel: '#2b2b38', selInactive: '#1e1e26', cursor: '#b392f0',
    indent: '#1c1c22', widgetBg: '#101014', widgetBorder: '#24242c', suggestSel: '#252532',
    tokens: {
      comment: '63636e', kw: 'b392f0', env: '56d4dd', envName: 'ffa657',
      str: '7ee787', math: '79c0ff', num: 'ffa657', delim: '9c9ca8',
      type: '79c0ff', attr: 'f5b971', var: 'ff7b72', invalid: 'ff6b6b'
    }
  },
  'minimal-kiwi': {
    base: 'vs-dark',
    bg: '#181c1a', fg: '#d8e2dc', lineNum: '#526159', lineNumActive: '#95d5b2',
    lineHl: '#202623', sel: '#2d3f36', selInactive: '#24312b', cursor: '#95d5b2',
    indent: '#262e2a', widgetBg: '#131715', widgetBorder: '#2a342f', suggestSel: '#2d3f36',
    tokens: {
      comment: '66756d', kw: '74c69d', env: 'e9c46a', envName: '95d5b2',
      str: 'a3d977', math: '56cfe1', num: 'f4a261', delim: '8f9e96',
      type: '8ecae6', attr: 'e9c46a', var: 'ff758f', invalid: 'e76f51'
    }
  },

  // ------------------------------------------------------------------ Light
  'github-light': {
    base: 'vs',
    bg: '#ffffff', fg: '#24292f', lineNum: '#8c959f', lineNumActive: '#24292f',
    lineHl: '#f6f8fa', sel: '#b6d7ff', selInactive: '#eaeef2', cursor: '#0969da',
    indent: '#eaeef2', widgetBg: '#ffffff', widgetBorder: '#d0d7de', suggestSel: '#ddf4ff',
    tokens: {
      comment: '6e7781', kw: 'cf222e', env: '0550ae', envName: '8250df',
      str: '0a3069', math: '116329', num: '0550ae', delim: '57606a',
      type: '8250df', attr: '0550ae', var: '953800', invalid: 'cf222e'
    }
  },
  'one-light': {
    base: 'vs',
    bg: '#fafafa', fg: '#383a42', lineNum: '#9d9d9f', lineNumActive: '#383a42',
    lineHl: '#f0f0f1', sel: '#d7e6ff', selInactive: '#ececec', cursor: '#526fff',
    indent: '#ececec', widgetBg: '#ffffff', widgetBorder: '#dbdbdc', suggestSel: '#e5e5e6',
    tokens: {
      comment: 'a0a1a7', kw: 'a626a4', env: '4078f2', envName: 'e45649',
      str: '50a14f', math: '0184bc', num: '986801', delim: '4b5263',
      type: 'c18401', attr: '986801', var: 'e45649', invalid: 'ca1243'
    }
  },
  'quiet-light': {
    base: 'vs',
    bg: '#f7f9fc', fg: '#1f2d3d', lineNum: '#a6b0c3', lineNumActive: '#1f2d3d',
    lineHl: '#eef2f8', sel: '#dbe7ff', selInactive: '#e7edf5', cursor: '#4f46e5',
    indent: '#e7edf5', widgetBg: '#ffffff', widgetBorder: '#dbe1ee', suggestSel: '#e8edf7',
    tokens: {
      comment: '7b8794', kw: '7c3aed', env: '1d4ed8', envName: 'b45309',
      str: '0f766e', math: '0e7490', num: '9a3412', delim: '475569',
      type: '3730a3', attr: '9a3412', var: 'be123c', invalid: 'b91c1c'
    }
  },
  'solarized': {
    base: 'vs',
    bg: '#fdf6e3', fg: '#586e75', lineNum: '#b3ad9e', lineNumActive: '#268bd2',
    lineHl: '#eee8d5', sel: '#d9e2e2', selInactive: '#eee8d5', cursor: '#268bd2',
    indent: '#eee8d5', widgetBg: '#fdf6e3', widgetBorder: '#d9d2c2', suggestSel: '#eee8d5',
    tokens: {
      comment: '93a1a1', kw: '859900', env: '268bd2', envName: 'cb4b16',
      str: '2aa198', math: 'd33682', num: 'b58900', delim: '657b83',
      type: '6c71c4', attr: 'b58900', var: 'cb4b16', invalid: 'dc322f'
    }
  },
  'light-owl': {
    base: 'vs',
    bg: '#fbfbfb', fg: '#403f53', lineNum: '#90a7b2', lineNumActive: '#403f53',
    lineHl: '#f0f0f0', sel: '#e0e0e0', selInactive: '#ececec', cursor: '#90a7b2',
    indent: '#e8e8e8', widgetBg: '#ffffff', widgetBorder: '#d9d9d9', suggestSel: '#e6eff8',
    tokens: {
      comment: '989fb1', kw: '994cc3', env: '0c969b', envName: '4876d6',
      str: 'c96765', math: 'aa0982', num: 'aa0982', delim: '5f6672',
      type: '4876d6', attr: '0c969b', var: 'd97706', invalid: 'de3d3b'
    }
  },
  'xcode-light': {
    base: 'vs',
    bg: '#ffffff', fg: '#262626', lineNum: '#a6a6a6', lineNumActive: '#262626',
    lineHl: '#ecf5ff', sel: '#b4d8fd', selInactive: '#e5e5e5', cursor: '#000000',
    indent: '#ebebeb', widgetBg: '#ffffff', widgetBorder: '#d4d4d4', suggestSel: '#d9ebff',
    tokens: {
      comment: '5d6c79', kw: '9b2393', env: '0f68a0', envName: '3900a0',
      str: 'c41a16', math: '1c00cf', num: '1c00cf', delim: '5c5c5c',
      type: '3900a0', attr: '836c28', var: '6c36a9', invalid: 'c41a16'
    }
  },
  'catppuccin-latte': {
    base: 'vs',
    bg: '#eff1f5', fg: '#4c4f69', lineNum: '#8c8fa1', lineNumActive: '#7287fd',
    lineHl: '#e6e9ef', sel: '#ccd0da', selInactive: '#dce0e8', cursor: '#dc8a78',
    indent: '#dce0e8', widgetBg: '#e6e9ef', widgetBorder: '#ccd0da', suggestSel: '#ccd0da',
    tokens: {
      comment: '8c8fa1', kw: '8839ef', env: 'fe640b', envName: '1e66f5',
      str: '40a02b', math: '179299', num: 'df8e1d', delim: '6c6f85',
      type: '1e66f5', attr: 'df8e1d', var: 'd20f39', invalid: 'd20f39'
    }
  },
  'ayu-light': {
    base: 'vs',
    bg: '#fafafa', fg: '#5c6166', lineNum: '#8a9199', lineNumActive: '#5c6166',
    lineHl: '#f0f2f4', sel: '#d1e4f4', selInactive: '#e6edf3', cursor: '#ff9940',
    indent: '#e8eaed', widgetBg: '#ffffff', widgetBorder: '#dfe2e6', suggestSel: '#e1eef9',
    tokens: {
      comment: '8a9199', kw: 'fa8d3e', env: '399ee6', envName: 'a37acc',
      str: '86b300', math: '4cbf99', num: 'a37acc', delim: '787b80',
      type: '399ee6', attr: 'f2ae49', var: 'f07171', invalid: 'e65050'
    }
  },
  'gruvbox-light': {
    base: 'vs',
    bg: '#fbf1c7', fg: '#3c3836', lineNum: '#a89984', lineNumActive: '#3c3836',
    lineHl: '#f2e5bc', sel: '#d5c4a1', selInactive: '#ebdbb2', cursor: '#3c3836',
    indent: '#ebdbb2', widgetBg: '#f9f5d7', widgetBorder: '#d5c4a1', suggestSel: '#ebdbb2',
    tokens: {
      comment: '928374', kw: '9d0006', env: 'b57614', envName: '427b58',
      str: '79740e', math: '076678', num: '8f3f71', delim: '665c54',
      type: '427b58', attr: 'b57614', var: 'af3a03', invalid: 'cc241d'
    }
  },
  'rose-pine-dawn': {
    base: 'vs',
    bg: '#faf4ed', fg: '#575279', lineNum: '#9893a5', lineNumActive: '#575279',
    lineHl: '#f2e9e1', sel: '#dfdad9', selInactive: '#ede4dc', cursor: '#575279',
    indent: '#ece4dc', widgetBg: '#fffaf3', widgetBorder: '#dfdad9', suggestSel: '#f2e9e1',
    tokens: {
      comment: '9893a5', kw: '286983', env: 'b4637a', envName: '907aa9',
      str: 'ea9d34', math: '56949f', num: 'd7827e', delim: '797593',
      type: '907aa9', attr: 'd7827e', var: 'b4637a', invalid: 'b4637a'
    }
  },
  'overleaf-light': {
    base: 'vs',
    bg: '#ffffff', fg: '#2c3645', lineNum: '#8c97a8', lineNumActive: '#138a07',
    lineHl: '#f3f7f2', sel: '#cce8c9', selInactive: '#e8f0e7', cursor: '#138a07',
    indent: '#eaeef2', widgetBg: '#ffffff', widgetBorder: '#d5dce4', suggestSel: '#e3f3e1',
    tokens: {
      comment: '7b8794', kw: '005cc5', env: '138a07', envName: '0e6b05',
      str: '0b7a75', math: '9333ea', num: 'b35900', delim: '5c6773',
      type: '005cc5', attr: 'b35900', var: 'c23b22', invalid: 'd73a49'
    }
  },
  'winter-is-coming-light': {
    base: 'vs',
    bg: '#ffffff', fg: '#236ebf', lineNum: '#7a8c9e', lineNumActive: '#111111',
    lineHl: '#eef6ff', sel: '#cee1f7', selInactive: '#e5effa', cursor: '#111111',
    indent: '#e6eef7', widgetBg: '#ffffff', widgetBorder: '#cfe0f2', suggestSel: '#ddecfc',
    kwBold: true,
    tokens: {
      comment: '7a8c9e', kw: '111111', env: '111111', envName: 'c72585',
      str: '3b9ebc', math: 'd63384', num: '111111', delim: '0431fa',
      type: '0c8599', attr: '0c8599', var: 'c72585', invalid: 'cf222e'
    }
  },
  'emerald-minimal-light': {
    base: 'vs',
    bg: '#f6fbf8', fg: '#1e332b', lineNum: '#8aa399', lineNumActive: '#047857',
    lineHl: '#eaf5ef', sel: '#cdebd9', selInactive: '#e2f1e9', cursor: '#059669',
    indent: '#e2efe8', widgetBg: '#ffffff', widgetBorder: '#d2e5db', suggestSel: '#dff3e8',
    tokens: {
      comment: '7c968b', kw: '047857', env: '0284c7', envName: '0f766e',
      str: '15803d', math: '7c3aed', num: 'b45309', delim: '547065',
      type: '0369a1', attr: 'b45309', var: 'be123c', invalid: 'dc2626'
    }
  },
  'lilac-dream': {
    base: 'vs',
    bg: '#f7f4fb', fg: '#332b47', lineNum: '#9e92b8', lineNumActive: '#7c3aed',
    lineHl: '#efe9f7', sel: '#dfd3f7', selInactive: '#eae2f6', cursor: '#7c3aed',
    indent: '#e8e1f2', widgetBg: '#fbf9fe', widgetBorder: '#dfd6ee', suggestSel: '#e9defa',
    tokens: {
      comment: '8f84a8', kw: '7c3aed', env: '0d9488', envName: '6d28d9',
      str: '15803d', math: '2563eb', num: 'c05621', delim: '675b80',
      type: '4f46e5', attr: 'b45309', var: 'be185d', invalid: 'dc2626'
    }
  },
  'lilac-dawn': {
    base: 'vs',
    bg: '#faf5fc', fg: '#3b2f4a', lineNum: '#a696b5', lineNumActive: '#9d4edd',
    lineHl: '#f2e8f7', sel: '#e6d3f5', selInactive: '#efe3f7', cursor: '#9d4edd',
    indent: '#ede2f3', widgetBg: '#fdfaff', widgetBorder: '#e3d5ec', suggestSel: '#eedff8',
    tokens: {
      comment: '9a8ca8', kw: '9d4edd', env: 'd97706', envName: '7b2cbf',
      str: '2a8f6f', math: '2563eb', num: 'c2410c', delim: '706080',
      type: '6d28d9', attr: 'cc6b2c', var: 'e11d48', invalid: 'd62839'
    }
  }
};

export function buildMonacoTheme(spec) {
  const t = spec.tokens;
  const gutter = spec.gutter || spec.bg;
  const kwStyle = spec.kwBold ? { fontStyle: 'bold' } : {};
  return {
    base: spec.base,
    inherit: true,
    rules: [
      { token: '', foreground: spec.fg.replace(/^#/, '') },
      { token: 'comment', foreground: t.comment, fontStyle: 'italic' },
      { token: 'keyword', foreground: t.kw, ...kwStyle },
      { token: 'keyword.control', foreground: t.kw, ...kwStyle },
      { token: 'keyword.env', foreground: t.env, ...kwStyle },
      { token: 'keyword.env.name', foreground: t.envName },
      { token: 'tag', foreground: t.envName },
      { token: 'string', foreground: t.str },
      { token: 'string.math', foreground: t.math },
      { token: 'number', foreground: t.num },
      { token: 'number.math', foreground: t.num },
      { token: 'delimiter', foreground: t.delim },
      { token: 'delimiter.math', foreground: t.math },
      { token: 'type', foreground: t.type },
      { token: 'attribute.name', foreground: t.attr },
      { token: 'variable', foreground: t.var },
      { token: 'invalid', foreground: t.invalid },
      { token: 'emphasis', fontStyle: 'italic' }
    ],
    colors: {
      'editor.background': spec.bg,
      'editor.foreground': spec.fg,
      'editorGutter.background': gutter,
      'editorStickyScroll.background': spec.bg,
      'editorLineNumber.foreground': spec.lineNum,
      'editorLineNumber.activeForeground': spec.lineNumActive,
      'editor.lineHighlightBackground': spec.lineHl,
      'editor.selectionBackground': spec.sel,
      'editor.inactiveSelectionBackground': spec.selInactive || spec.sel,
      'editorCursor.foreground': spec.cursor,
      'editorIndentGuide.background1': spec.indent,
      'editorHoverWidget.background': spec.widgetBg,
      'editorHoverWidget.border': spec.widgetBorder,
      'editorSuggestWidget.background': spec.widgetBg,
      'editorSuggestWidget.border': spec.widgetBorder,
      'editorSuggestWidget.selectedBackground': spec.suggestSel,
      'editorWidget.background': spec.widgetBg,
      'editorWidget.border': spec.widgetBorder
    }
  };
}
