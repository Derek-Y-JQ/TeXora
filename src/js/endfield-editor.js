/** Keep editor UI chrome in the workspace palette; syntax themes stay independent. */
export function endfieldEditorChrome() {
  if (document.documentElement.dataset.style !== 'endfield') return null;
  const tokens = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true });
  const color = (name) => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = tokens.getPropertyValue(name).trim();
    paint.fillRect(0, 0, 1, 1);
    return '#' + [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const panel = color('--surface-1'), ink = color('--text'), muted = color('--text-3');
  const selection = color('--ef-selection'), trace = color('--ef-trace');
  const border = color('--border'), inset = color('--surface-2');
  return {
    panel, ink, muted, border, inset,
    colors: {
      'focusBorder': trace,
      'editorWidget.background': panel, 'editorWidget.foreground': ink, 'editorWidget.border': border,
      'editorHoverWidget.background': panel, 'editorHoverWidget.foreground': ink, 'editorHoverWidget.border': border,
      'editorSuggestWidget.background': panel, 'editorSuggestWidget.foreground': ink,
      'editorSuggestWidget.border': border, 'editorSuggestWidget.selectedBackground': selection,
      'editorSuggestWidget.selectedForeground': ink, 'editorSuggestWidget.selectedIconForeground': ink,
      'editorSuggestWidget.highlightForeground': ink, 'editorSuggestWidget.focusHighlightForeground': ink,
      'editorSuggestWidgetStatus.foreground': muted,
      'editor.selectionBackground': selection, 'editor.selectionForeground': ink,
      'editor.inactiveSelectionBackground': inset,
      'editor.findMatchBackground': selection, 'editor.findMatchBorder': trace,
      'editor.findMatchHighlightBackground': inset, 'editor.findMatchHighlightBorder': border,
      'editorBracketMatch.background': selection, 'editorBracketMatch.border': trace,
      'editorError.foreground': trace, 'editorWarning.foreground': trace, 'editorInfo.foreground': muted,
      'input.background': inset, 'input.foreground': ink, 'input.border': border,
      'list.activeSelectionBackground': selection, 'list.activeSelectionForeground': ink,
      'list.focusBackground': selection, 'list.focusForeground': ink,
      'list.highlightForeground': ink, 'list.hoverBackground': inset,
      'button.background': ink, 'button.foreground': panel,
      'button.hoverBackground': color('--ef-signal'),
      'scrollbarSlider.background': color('--scrollbar'), 'scrollbarSlider.hoverBackground': color('--scrollbar-hover')
    }
  };
}
