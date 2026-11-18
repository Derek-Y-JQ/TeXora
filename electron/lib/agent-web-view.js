'use strict';
const {WebContentsView, shell} = require('electron');

// DeepSeek's login cookie is SameSite=Strict. Give its UI a top-level
// browsing context, independent of the app:// renderer and its preload.
class AgentWebView {
  constructor(window, send) { this.window = window; this.send = send; }
  open(url) {
    this.close();
    const win = this.window();
    if (!win || win.isDestroyed()) return;
    const origin = new URL(url).origin;
    const view = new WebContentsView({webPreferences:{
      partition:'persist:texora-deepseek', sandbox:true, contextIsolation:true, nodeIntegration:false
    }});
    this.view = view;
    view.setVisible(false);
    win.contentView.addChildView(view);
    view.webContents.on('will-navigate', (event, target) => {
      if (new URL(target).origin !== origin) event.preventDefault();
    });
    view.webContents.setWindowOpenHandler(({url:target}) => {
      if (/^https?:\/\//i.test(target)) shell.openExternal(target);
      return {action:'deny'};
    });
    view.webContents.loadURL(url).then(() => {
      if (this.view === view) this.send('agent:event', {web:true});
    }).catch(() => {
      if (this.view === view) this.send('agent:event', {webError:'DeepSeek 本地界面加载失败，请结束后重新连接'});
    });
  }
  bounds(rect) {
    if (!this.view) return;
    if (!rect) { this.view.setVisible(false); return; }
    const scale = this.window().webContents.getZoomFactor();
    const bounds = {};
    for (const key of ['x','y','width','height']) {
      if (!Number.isFinite(rect[key])) return;
      bounds[key] = Math.max(0, Math.round(rect[key] * scale));
    }
    this.view.setBounds(bounds);
    this.view.setVisible(bounds.width > 0 && bounds.height > 0);
  }
  close() {
    const view = this.view;
    if (!view) return;
    this.view = null;
    const win = this.window();
    if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
module.exports = {AgentWebView};
