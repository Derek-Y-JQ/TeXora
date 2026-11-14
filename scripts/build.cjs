'use strict';
/** Runs `vite build` with a project-local temp folder. On some Windows machines esbuild cannot delete
 *  its own files in %TEMP% (antivirus scans or stale handles), which fails the Monaco worker bundle. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tmp = path.resolve(__dirname, '..', '.tmp', 'build');
fs.mkdirSync(tmp, { recursive: true });
const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp };
const vite = path.resolve(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const result = spawnSync(process.execPath, [vite, 'build', ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
