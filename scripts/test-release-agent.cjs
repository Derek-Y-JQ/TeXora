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
// Simulate DSH's documented loopback launch URL and Strict cookie exchange.
const dshPackage = path.join(root, 'node_modules', '@deepseek-ai', 'dsh');
fs.mkdirSync(dshPackage, {recursive:true});
fs.writeFileSync(path.join(dshPackage, 'package.json'), JSON.stringify({name:'@deepseek-ai/dsh',bin:{dsh:'bin.cjs'}}));
const dsh = path.join(dshPackage, 'bin.cjs');
fs.writeFileSync(dsh, `#!/usr/bin/env node
const http = require('node:http'), fs = require('node:fs');
if (process.argv.includes('headless')) {
  const args = process.argv.slice(2);
  const resume = args.includes('--session-id');
  if (!fs.existsSync('main.tex') || !args.includes('--json') || !fs.existsSync(args[args.indexOf('--patch')+1])) process.exit(2);
  const text = fs.readFileSync(0,'utf8');
  console.log(JSON.stringify({type:'session',sessionId:'fixture-dsh'}));
  console.log(JSON.stringify({type:'final',reason:{kind:'completed'},text:(resume ? '继续 ' : '收到 ')+text}));
  process.exit(0);
}
const server = http.createServer((req,res) => {
  if (req.url === '/?token=fixture') {
    res.writeHead(303, {Location:'/', 'Set-Cookie':'dsh-test=ok; Path=/; HttpOnly; SameSite=Strict'});
  } else if (req.url === '/' && req.headers.cookie?.includes('dsh-test=ok')) {
    fs.writeFileSync('agent-web-authenticated.txt', 'authenticated');
    res.writeHead(200, {'Content-Type':'text/html'});
  } else res.writeHead(401);
  res.end();
});
server.listen(0,'127.0.0.1',() => console.log('dsh web: http://127.0.0.1:'+server.address().port+'/?token=fixture'));
`, {mode:0o755});
if (!windows) fs.symlinkSync(dsh,path.join(root,'dsh'));
const project = path.join(root,'project');
fs.mkdirSync(project);
fs.writeFileSync(path.join(project,'main.tex'),'\\documentclass{article}\n\\begin{document}Test\\end{document}');
const env = {...process.env, PATH: root + path.delimiter + process.env.PATH,
  TEXORA_APP: path.resolve(process.argv[2]), TEXORA_USER_DATA:path.join(root,'profile')};
const result = spawnSync(process.execPath, ['scripts/cdp.mjs','--script','tests/ui-210.mjs','--wait','650','--','--project='+project],
  {env,stdio:'inherit',timeout:90000});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
