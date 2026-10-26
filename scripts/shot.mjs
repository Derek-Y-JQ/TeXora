/**
 * Screenshot helper: launches the app with the Electron binary from a short
 * ASCII path (Chromium crashes when started from certain Unicode/OneDrive
 * paths) and waits for the capture to finish.
 *
 * Usage: node scripts/shot.mjs --capture=.capture/foo.png --view=settings
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const electronDir = process.env.TEXORA_ELECTRON || 'C:\\Temp\\etest\\electron.exe';
const args = process.argv.slice(2);
const logPath = path.join(root, '.capture', 'last-run.log');

if (!fs.existsSync(electronDir)) {
  console.error('electron binary missing at', electronDir);
  process.exit(2);
}

fs.mkdirSync(path.join(root, '.capture'), { recursive: true });
const fd = fs.openSync(logPath, 'w');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_ENABLE_LOGGING;

const child = spawn(electronDir, [root, ...args], {
  cwd: root,
  env,
  stdio: ['ignore', fd, fd],
  windowsHide: true
});

const timeoutMs = Number(process.env.SHOT_TIMEOUT || 60000);
const timer = setTimeout(() => {
  console.error('timeout — killing electron');
  try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  process.exit(3);
}, timeoutMs);

child.on('exit', (code) => {
  clearTimeout(timer);
  fs.closeSync(fd);
  const out = args.find((a) => a.startsWith('--capture='));
  const target = out ? path.resolve(root, out.slice('--capture='.length)) : '';
  console.log('electron exit', code, target && fs.existsSync(target) ? `captured ${fs.statSync(target).size} bytes` : 'no capture');
  process.exit(code === 0 ? 0 : 1);
});
