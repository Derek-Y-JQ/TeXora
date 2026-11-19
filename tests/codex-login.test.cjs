'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {startCodexLogin} = require('../electron/lib/codex-login');

async function exercise(scenario, rejectBrowser=false) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'texora-login-'));
  const entry=path.join(cwd,'fixture.cjs');
  fs.copyFileSync(path.join(__dirname,'fixtures/agent-provider.cjs'),entry);
  const events=[], opened=[];
  try {
    const error=await new Promise(resolve=>{
      startCodexLogin({exe:process.execPath,args:[entry]}, {cwd,env:{...process.env,TEXORA_LOGIN_FIXTURE:scenario}},
        event=>events.push(event),url=>{
          opened.push(url);
          if (rejectBrowser) throw Error('no handler');
        },resolve);
    });
    return {events,opened,error};
  } finally { fs.rmSync(cwd,{recursive:true,force:true}); }
}

test('opens the system browser once and keeps a manual URL when the OS rejects the request',async()=>{
  const {events,opened,error}=await exercise('browser',true);
  assert.equal(error,'');
  assert.deepEqual(opened,['https://auth.openai.com/']);
  assert.equal(events[0].loginUrl,opened[0]);
  assert.ok(events.some(e=>e.browserError));
});
test('occupied loopback port falls back to the provider device authorization',async()=>{
  const {events,opened,error}=await exercise('port');
  assert.equal(error,'');
  assert.deepEqual(opened,['https://auth.openai.com/codex/device']);
  assert.equal(events[0].deviceCode,'ABCD-TEST');
});
test('reports the provider error without credentials and rejects an unexpected login origin',async()=>{
  const result=await exercise('error');
  assert.match(result.error,/Configuration invalid/);
  assert.doesNotMatch(result.error,/secret-fixture/);
  const invalid=await exercise('invalid');
  assert.match(invalid.error,/登录地址/);
  assert.deepEqual(invalid.opened,[]);
});
