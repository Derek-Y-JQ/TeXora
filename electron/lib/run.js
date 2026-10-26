'use strict';
/**
 * Child-process helpers.
 *
 * The harness sandbox forbids pipe-backed stdio for child processes, so every
 * command writes its combined output into a real file and we tail that file.
 * This also gives us resumable, streamable build logs for free.
 */
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

let tmpRoot = path.join(os.tmpdir(), 'texora-run');
try {
  fs.mkdirSync(tmpRoot, { recursive: true });
} catch {
  tmpRoot = os.tmpdir();
}

let counter = 0;

function tmpFile(tag) {
  counter += 1;
  return path.join(tmpRoot, `${tag}-${process.pid}-${Date.now()}-${counter}.log`);
}

/**
 * Run a command, redirecting stdout+stderr into one file.
 * @returns {Promise<{code:number|null, signal:string|null, output:string, file:string, timedOut:boolean}>}
 */
function run(exe, args, options = {}) {
  const { cwd, env, timeout = 0, onChunk, onSpawn, input } = options;
  const outFile = options.outFile || tmpFile('cmd');
  return new Promise((resolve) => {
    let fd;
    try {
      fd = fs.openSync(outFile, 'w');
    } catch (err) {
      resolve({ code: -1, signal: null, output: String(err), file: outFile, timedOut: false });
      return;
    }
    let child;
    try {
      child = spawn(exe, args, {
        cwd: cwd || undefined,
        env: { ...process.env, ...(env || {}) },
        stdio: [input ? 'ignore' : 'ignore', fd, fd],
        windowsHide: true,
        detached: false
      });
    } catch (err) {
      try { fs.closeSync(fd); } catch {}
      resolve({ code: -1, signal: null, output: String(err), file: outFile, timedOut: false });
      return;
    }
    try { fs.closeSync(fd); } catch {}
    if (onSpawn) { try { onSpawn(child); } catch {} }

    let offset = 0;
    let tail = '';
    const flush = () => {
      try {
        const size = fs.statSync(outFile).size;
        if (size <= offset) return;
        const fd2 = fs.openSync(outFile, 'r');
        const len = size - offset;
        const buf = Buffer.alloc(len);
        fs.readSync(fd2, buf, 0, len, offset);
        fs.closeSync(fd2);
        offset = size;
        const text = buf.toString('utf8');
        tail = (tail + text).slice(-200000);
        if (onChunk) onChunk(text);
      } catch {}
    };
    const timer = setInterval(flush, 120);
    let timedOut = false;
    const killTimer = timeout > 0 ? setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeout) : null;

    const done = (code, signal) => {
      clearInterval(timer);
      if (killTimer) clearTimeout(killTimer);
      flush();
      resolve({ code, signal, output: tail, file: outFile, timedOut });
    };
    child.on('error', (err) => {
      if (onChunk) onChunk(`\n[spawn error] ${err.message}\n`);
      tail += `\n[spawn error] ${err.message}\n`;
      done(-1, null);
    });
    child.on('close', (code, signal) => done(code, signal));
  });
}

/** Run and return trimmed stdout only. */
async function capture(exe, args, options = {}) {
  const res = await run(exe, args, options);
  return res.output;
}

function killTree(pid) {
  if (!pid) return;
  try {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {
    try { process.kill(pid); } catch {}
  }
}

module.exports = { run, capture, killTree, tmpRoot };
