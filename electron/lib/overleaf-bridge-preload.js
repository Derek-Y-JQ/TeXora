'use strict';
/**
 * Minimal sandboxed preload for TeXora's hidden Overleaf live bridge window.
 * Relays structured JSON messages between Overleaf's main-world Socket.IO
 * script and Electron main process using a per-window random handshake token.
 */
const { ipcRenderer } = require('electron');

let bridgeToken = '';

ipcRenderer.invoke('overleaf-bridge:handshake').then((token) => {
  if (typeof token === 'string' && token) bridgeToken = token;
}).catch(() => {});

window.addEventListener('message', (event) => {
  if (event.source !== window || !bridgeToken) return;
  const data = event.data;
  if (!data || data.__texoraOlBridge !== bridgeToken || data.dir !== 'toMain') return;
  ipcRenderer.send('overleaf-bridge:event', {
    token: bridgeToken,
    type: data.type,
    payload: data.payload
  });
});

ipcRenderer.on('overleaf-bridge:cmd', (_event, msg) => {
  if (!bridgeToken || !msg || msg.token !== bridgeToken) return;
  window.postMessage({
    __texoraOlBridge: bridgeToken,
    dir: 'toPage',
    type: msg.type,
    payload: msg.payload
  }, window.location.origin);
});
