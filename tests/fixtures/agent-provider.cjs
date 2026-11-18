#!/usr/bin/env node
const fs=require('node:fs'), path=require('node:path');
const args=process.argv.slice(2), claude=__dirname.includes('anthropic-ai');
const marker=path.join(__dirname,'signed-in');
const output=value=>console.log(JSON.stringify(value));
if (args.includes('status')) {
  output({loggedIn:fs.existsSync(marker)}); process.exit(fs.existsSync(marker)?0:1);
}
if (args.includes('login')) { fs.writeFileSync(marker,'1'); process.exit(0); }
const text=fs.readFileSync(0,'utf8');
if (!fs.existsSync(marker)) process.exit(2);
const remote='8b020c45-c8a0-4659-b260-74af567bdb31';
const response=(args.includes(remote)?'继续 ':'收到 ')+text;
if (claude) {
  output({type:'system',subtype:'init',session_id:remote});
  output({type:'assistant',message:{content:[{type:'text',text:response}]}});
} else {
  output({type:'thread.started',thread_id:remote});
  output({type:'item.completed',item:{type:'agent_message',text:response}});
}
