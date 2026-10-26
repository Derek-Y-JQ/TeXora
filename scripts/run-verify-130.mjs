import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = process.cwd();
const fixture = path.join(root, '.capture', 'verify130-project');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(path.join(fixture, 'main.tex'), [String.raw`\documentclass{article}`, String.raw`\begin{document}`, 'TeXora verification fixture.', String.raw`\end{document}`, ''].join('\n'));
const child = spawn(process.execPath, ['scripts/cdp.mjs', '--script', 'scripts/verify-130.mjs', '--', '--project=' + fixture], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: {
    ...process.env,
    TEXORA_ELECTRON: process.env.TEXORA_ELECTRON || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
    TEXORA_USER_DATA: process.env.TEXORA_USER_DATA || path.join(root, '.capture', 'verify130-profile')
  }
});
child.on('error', err => { console.error(err.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
