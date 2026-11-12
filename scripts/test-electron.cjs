'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const resultFile = path.resolve('.tmp/electron-security-result.json');
fs.mkdirSync(path.dirname(resultFile), {recursive:true});
if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), ['tests/electron-security.cjs'], {
  env, stdio:'inherit', windowsHide:true, timeout:60000
});
if (result.error || result.status !== 0 || !fs.existsSync(resultFile)) {
  console.error('Electron security test did not complete:', result.error?.message || result.status);
  process.exit(1);
}
const evidence = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
if (!evidence.ok || !evidence.sandboxConfigured || evidence.noSandboxOverride) {
  console.error('Electron security test lacks sandbox evidence');
  process.exit(1);
}
console.log('Verified Electron security test completion:', evidence.version);
