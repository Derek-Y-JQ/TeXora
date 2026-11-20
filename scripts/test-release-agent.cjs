const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'texora-agent-test-'));
const windows = process.platform === 'win32';
// A provider fixture implements the same login, JSON event and resume contracts.
for (const [id,pkg] of [['codex','@openai/codex'],['claude','@anthropic-ai/claude-code']]) {
  const dir=path.join(root,'node_modules',pkg);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:pkg,bin:{[id]:'bin.cjs'}}));
  const entry=path.join(dir,'bin.cjs');
  fs.copyFileSync(path.join(__dirname,'../tests/fixtures/agent-provider.cjs'),entry);
  fs.chmodSync(entry,0o755);
  if (!windows) fs.symlinkSync(entry,path.join(root,id));
}
if (!windows) fs.copyFileSync(path.join(__dirname,'../tests/fixtures/agy.cjs'),path.join(root,'agy'));
if (!windows) fs.chmodSync(path.join(root,'agy'),0o755);
const project = path.join(root,'project');
fs.mkdirSync(project);
fs.writeFileSync(path.join(project,'main.tex'),'\\documentclass{article}\n\\begin{document}Test\\end{document}');
const env = {...process.env, PATH: root + path.delimiter + process.env.PATH,
  TEXORA_APP: path.resolve(process.argv[2]), TEXORA_USER_DATA:path.join(root,'profile')};
const result = spawnSync(process.execPath, ['scripts/cdp.mjs','--script','tests/ui-210.mjs','--wait','650','--','--project='+project],
  {env,stdio:'inherit',timeout:90000});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
