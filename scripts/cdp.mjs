/**
 * CDP-based UI verification: launches TeXora with remote debugging enabled,
 * then evaluates JS / clicks / takes screenshots over the DevTools protocol.
 *
 * Examples:
 *   node scripts/cdp.mjs --wait 4000 --shot .capture/ui.png -- --project=samples/demo
 *   node scripts/cdp.mjs --eval "document.title" -- --project=samples/demo
 *   node scripts/cdp.mjs --click "[data-panel=settings]" --shot .capture/settings.png
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const argv = process.argv.slice(2);
const appArgs = [];
const sep = argv.indexOf('--');
if (sep >= 0) appArgs.push(...argv.splice(sep));
if (sep >= 0) appArgs.shift();

function flag(name, fallback = '') {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return fallback;
  const hit = argv[i];
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[i + 1];
  if (next && !next.startsWith('--')) return next;
  return '1';
}
const wait = Number(flag('wait', '3500'));
const shot = flag('shot', '');
const scriptFile = flag('script', '');
const evalExpr = flag('eval', '');
const clickSel = flag('click', '');
const electronExe = process.env.TEXORA_ELECTRON || 'C:\\Temp\\etest\\electron.exe';
const packagedApp = process.env.TEXORA_APP || '';
const port = Number(process.env.CDP_PORT || 9333);
const logPath = path.join(root, '.capture', 'last-run.log');
fs.mkdirSync(path.join(root, '.capture'), { recursive: true });
const logFd = fs.openSync(logPath, 'w');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(packagedApp || electronExe, [`--remote-debugging-port=${port}`, ...(packagedApp ? [] : [root]), ...appArgs], {
  cwd: root,
  env,
  stdio: ['ignore', logFd, logFd],
  windowsHide: true
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP page not found');
}

let ws;
let msgId = 0;
const pending = new Map();
const pageErrors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function main() {
  const page = await findPage();
  console.log('target:', page.url, '|', page.title);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params?.exceptionDetails || {};
        pageErrors.push('exception: ' + (d.exception?.description || d.text || '').split('\n').slice(0,4).join(' | '));
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params?.entry || {};
        if (e.level === 'error' || e.level === 'warning') pageErrors.push(e.level + ': ' + String(e.text).slice(0, 300));
      }
      return;
    }
    const h = pending.get(msg.id);
    if (!h) return;
    pending.delete(msg.id);
    if (msg.error) h.reject(new Error(msg.error.message));
    else h.resolve(msg.result);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await sleep(wait);

  if (evalExpr) {
    const res = await send('Runtime.evaluate', { expression: evalExpr, awaitPromise: true, returnByValue: true });
    if (process.env.CDP_DEBUG) console.log('raw:', JSON.stringify(res).slice(0, 1000));
    console.log('eval:', JSON.stringify(res.result?.value ?? res.result, null, 2));
  }
  if (clickSel) {
    const res = await send('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(clickSel)}); if (!el) return 'not found'; el.click(); return 'clicked'; })()`,
      returnByValue: true
    });
    console.log('click:', res.result?.value);
    await sleep(1200);
  }
  if (scriptFile) {
    const { pathToFileURL } = await import('node:url');
    const helpers = {
      send,
      async evalJs(expression) {
        const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) {
          const d = res.exceptionDetails;
          throw new Error((d.exception && d.exception.description) || d.text || 'evaluation failed');
        }
        return res.result?.value;
      },
      async click(selector) {
        const value = await helpers.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'not found: ' + ${JSON.stringify(selector)}; el.click(); return 'clicked'; })()`);
        await sleep(700);
        return value;
      },
      async hover(selector) {
        const rect = await helpers.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        if (!rect) return 'not found';
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
        await sleep(500);
        return 'hovered';
      },
      async press(key, code, vk) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        await sleep(250);
      },
      async shot(target) {
        const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const out = path.resolve(root, target);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
        console.log('shot:', target, fs.statSync(out).size, 'bytes');
      },
      sleep
    };
    const mod = await import(pathToFileURL(path.resolve(root, scriptFile)).href + '?v=' + Date.now());
    await mod.default(helpers);
    console.log('script finished');
  }
  if (shot) {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const target = path.resolve(root, shot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(res.data, 'base64'));
    console.log('shot:', target, fs.statSync(target).size, 'bytes');
  }
  ws.close();
  if (pageErrors.length) {
    console.log('--- page issues (' + pageErrors.length + ') ---');
    for (const e of pageErrors.slice(0, 12)) console.log(' ', e);
  } else {
    console.log('--- no page errors ---');
  }
}

main()
  .catch((err) => console.error('cdp error:', err.message))
  .finally(() => {
    try { fs.closeSync(logFd); } catch {}
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
    setTimeout(() => process.exit(0), 300);
  });
