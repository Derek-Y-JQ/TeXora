const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('../electron/lib/store');
const { TexEnv } = require('../electron/lib/texenv');
const { CodeTools } = require('../electron/lib/code-tools');
const root=path.resolve('.capture/code-tools-test');fs.mkdirSync(root,{recursive:true});
const store=new Store(path.join(root,'profile'));
const tex=new TexEnv(store,path.join(root,'profile'));tex.detect();
const tools=new CodeTools({tex,store,userData:path.join(root,'profile'),project:{root}});
(async()=>{
  for(const options of [{kind:'code',backend:'listings'},{kind:'algorithm',backend:'listings'},{kind:'code',backend:'minted'}]){
    console.log('Detect',options,await tools.status(options));
    const result=await tools.prepare(options); console.log('Prepare',result); assert.ok(result.ok,result.error);
  }
  console.log('PASS real listings, algorithmicx, minted environment detection/installation and PDF probes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
