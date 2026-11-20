#!/usr/bin/env node
const fs=require('node:fs'), path=require('node:path');
const args=process.argv.slice(2), claude=__dirname.includes('anthropic-ai');
const marker=path.join(__dirname,'signed-in');
const output=value=>console.log(JSON.stringify(value));
if (args.includes('--version')) { console.log('fixture 1.0'); process.exit(0); }
if (args.includes('app-server')) {
  require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
    const request=JSON.parse(line);
    if(request.method==='initialize') output({id:request.id,result:{}});
    if(request.method==='model/list') {
      const first = !request.params.cursor;
      const data = first ? [
        {model:'fixture-sol',displayName:'Fixture Sol',isDefault:true},
        {model:'hidden-test',displayName:'Hidden Test',hidden:true}
      ] : [{model:'fixture-model',displayName:'Fixture Astra'}];
      output({id:request.id,result:{data,nextCursor:first ? 'next' : null}});
    }
    if(request.method==='account/login/start') {
      const scenario=process.env.TEXORA_LOGIN_FIXTURE;
      if (scenario==='port' && request.params.type==='chatgpt')
        return output({id:request.id,error:{message:'Port 1455 is already in use'}});
      if (scenario==='error') return output({id:request.id,error:{message:'Configuration invalid: token=secret-fixture'}});
      const result=request.params.type==='chatgptDeviceCode' ? {verificationUrl:'https://auth.openai.com/codex/device',userCode:'ABCD-TEST'} :
        {authUrl:scenario==='invalid' ? 'https://example.org/' : 'https://auth.openai.com/'};
      output({id:request.id,result:{loginId:'fixture',...result}});
      fs.writeFileSync(marker,'1');
      setTimeout(()=>output({method:'account/login/completed',params:{loginId:'fixture',success:true}}),250);
    }
  });
  return;
}
if (args.includes('status')) {
  output({loggedIn:fs.existsSync(marker)}); process.exit(fs.existsSync(marker)?0:1);
}
if (args.includes('login')) { fs.writeFileSync(marker,'1'); process.exit(0); }
const text=fs.readFileSync(0,'utf8');
if (!fs.existsSync(marker)) process.exit(2);
const remote='8b020c45-c8a0-4659-b260-74af567bdb31';
const model = args.indexOf('--model');
if (model >= 0) fs.writeFileSync('agent-note.tex', args[model+1]);
const response=(args.includes(remote)?'继续 ':'收到 ')+text;
if (claude) {
  output({type:'system',subtype:'init',session_id:remote});
  output({type:'assistant',message:{content:[{type:'text',text:response}]}});
} else {
  output({type:'thread.started',thread_id:remote});
  output({type:'item.completed',item:{type:'agent_message',text:response}});
}
