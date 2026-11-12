const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const {registerProtocols}=require('../electron/lib/protocols');
test('app protocol serves bundled files and rejects sibling path traversal',async()=>{
 const dir=path.resolve('.tmp/protocol-dist');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'index.html'),'bundled');
 const handlers={};registerProtocols({handle:(name,fn)=>handlers[name]=fn},dir);
 const ok=await handlers.app({url:'app://local/'});assert.equal(ok.status,200);assert.equal(await ok.text(),'bundled');
 assert.equal((await handlers.app({url:'app://local/%2e%2e%2fprotocol-dist-evil/secret'})).status,403);
 assert.equal((await handlers.asset({url:'asset://local/'})).status,400);
});
