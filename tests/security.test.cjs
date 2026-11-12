const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Store}=require('../electron/lib/store');const {AiService}=require('../electron/lib/ai');
// Test crypto models the OS API; actual DPAPI is exercised by the Electron smoke test.
const crypto=require('node:crypto'), secret=crypto.randomBytes(32);
const storage={isEncryptionAvailable:()=>true,encryptString(s){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',secret,iv);const bytes=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]);},decryptString(b){const d=crypto.createDecipheriv('aes-256-gcm',secret,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString();}};
test('migrate primary and backup, reload, reset, clear, and corrupt-primary recovery',t=>{
 const dir=fs.mkdtempSync(path.join(path.resolve('.tmp'),'texora-secure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'settings.json');for(const f of [file,file+'.bak'])fs.writeFileSync(f,JSON.stringify({ai:{apiKey:'legacy-secret'}}));
 const s=new Store(dir);s.enableEncryption(storage);assert.equal(s.get('ai.apiKey'),'legacy-secret');
 for(const f of [file,file+'.bak']){const text=fs.readFileSync(f,'utf8');assert.ok(!text.includes('legacy-secret'));assert.equal(JSON.parse(text).ai.apiKey,undefined);}
 s.reset('ai');const reloaded=new Store(dir);reloaded.enableEncryption(storage);assert.equal(reloaded.get('ai.apiKey'),'legacy-secret');
 fs.writeFileSync(file,'broken');const recovered=new Store(dir);recovered.enableEncryption(storage);assert.equal(recovered.get('ai.apiKey'),'legacy-secret');
 recovered.set('ai.apiKey','');assert.equal(JSON.parse(fs.readFileSync(file)).ai.apiKeyEncrypted,undefined);
});
test('unavailable encryption never writes a plaintext credential',t=>{
 const dir=fs.mkdtempSync(path.join(path.resolve('.tmp'),'texora-unavailable-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const s=new Store(dir);assert.throws(()=>s.set('ai.apiKey','secret'),/unavailable/);assert.equal(fs.existsSync(s.file),false);assert.equal(s.get('ai.apiKey'),'');
});
test('Gemini credential is sent in header only',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);
 global.fetch=async(url,options)=>{assert.ok(!url.includes('secret'));assert.ok(!url.includes('?key'));assert.equal(options.headers['x-goog-api-key'],'secret');return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'ok'}]}}]})};};
 const ai=new AiService({get:()=>({})});const r=await ai._gemini({baseUrl:'https://example.test/v1beta',model:'gemini-test',apiKey:'secret'},'',[],new AbortController().signal);assert.equal(r.text,'ok');
});
