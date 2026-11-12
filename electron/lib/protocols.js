'use strict';
const path = require('node:path');
const fsp = require('node:fs/promises');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};
function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function registerProtocols(protocol, DIST) {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === '/') rel = '/index.html';
      const full = path.normalize(path.join(DIST, rel));
      if (path.relative(DIST, full).startsWith('..') || path.isAbsolute(path.relative(DIST, full))) return new Response('forbidden', { status: 403 });
      const data = await fsp.readFile(full);
      return new Response(data, { headers: { 'content-type': mimeFor(full), 'cache-control': 'no-cache' } });
    } catch (err) {
      return new Response('not found: ' + err.message, { status: 404 });
    }
  });

  protocol.handle('asset', async (request) => {
    try {
      const url = new URL(request.url);
      const p = url.searchParams.get('p');
      if (!p) return new Response('missing path', { status: 400 });
      const data = await fsp.readFile(p);
      return new Response(data, { headers: { 'content-type': mimeFor(p), 'cache-control': 'no-store' } });
    } catch (err) {
      return new Response('not found', { status: 404 });
    }
  });

}
module.exports = { registerProtocols };
