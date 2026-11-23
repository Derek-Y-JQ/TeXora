/** Clamp preferred pane widths to the actual working viewport. */
export function workspaceWidths(width, {sidebar = 292, preview = 468, showSidebar = true, showPreview = true} = {}) {
  width = Math.max(0, Number(width) || 0);
  const side = showSidebar ? Math.min(Math.max(160, Number(sidebar) || 292), 520, Math.max(160, width * .32)) : 0;
  const available = Math.max(0, width - 49 - side - 2);
  const minEditor = Math.min(240, available);
  const maxPreview = Math.max(0, available - minEditor);
  const minPreview = Math.min(200, maxPreview);
  const pdf = showPreview ? Math.min(Math.max(minPreview, Number(preview) || 468), maxPreview) : 0;
  return {sidebar: Math.round(side), preview: Math.round(pdf)};
}
