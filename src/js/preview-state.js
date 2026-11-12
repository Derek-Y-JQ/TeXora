/** Pure preview ownership, dismissal memory and viewport placement. */
export class PreviewState {
  source = 'caret';
  pointer = null;
  dismissed = null;
  takeCaret() { this.source = 'caret'; }
  leave() { this.source = 'pointer'; this.pointer = null; }
  takePointer(x, y, force = false) {
    if (!force && Number.isFinite(x) && Number.isFinite(y) && this.pointer?.x === x && this.pointer?.y === y) return false;
    this.pointer = {x, y}; this.source = 'pointer'; return true;
  }
  dismiss(key) { this.dismissed = key; }
  canShow(key) { return this.dismissed !== key; }
  exitFormula() { this.dismissed = null; }
}
export function hoverPlacement(host, size, anchor) {
  return {left: Math.max(8, Math.min(anchor.left, host.width - size.width - 10)),
    top: Math.max(8, Math.min(anchor.top, host.height - size.height - 10))};
}
export function formulaPlacement(host, width, caret, height = 0) {
  const above = caret.top - 12, below = host.height - caret.top - caret.height - 12;
  const useAbove = above >= 100 || above >= below;
  return {left: Math.max(8, Math.min(caret.left, host.width - width - 12)),
    maxHeight: Math.max(48, Math.min(300, useAbove ? above : below)),
    top: useAbove ? Math.max(0, caret.top - height - 10) : caret.top + caret.height + 10};
}
