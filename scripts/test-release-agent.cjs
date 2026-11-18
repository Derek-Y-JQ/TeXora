const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'texora-agent-test-'));
const windows = process.platform === 'win32';
// A local Node REPL exercises real terminal input/output without a provider account.
const fixture = path.join(root, windows ? 'codex.exe' : 'codex');
if (windows) fs.copyFileSync(process.execPath, fixture);
else fs.symlinkSync(process.execPath, fixture);
const project = path.join(root,'project');
fs.mkdirSync(project);
fs.writeFileSync(path.join(project,'main.tex'),'\\documentclass{article}\n\\begin{document}Test\\end{document}');
const env = {...process.env, PATH: root + path.delimiter + process.env.PATH,
  TEXORA_APP: path.resolve(process.argv[2]), TEXORA_USER_DATA:path.join(root,'profile')};
const result = spawnSync(process.execPath, ['scripts/cdp.mjs','--script','tests/ui-210.mjs','--wait','650','--','--project='+project],
  {env,stdio:'inherit',timeout:90000});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
