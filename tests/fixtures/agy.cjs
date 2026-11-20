#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fixture 1.5.13'); process.exit(0); }
if (args[0] === 'models') {
  console.log('fixture-gemini    Fixture Gemini');
  process.exit(0);
}
const id = '5452d397-40e1-4469-a157-a81c60f29cd4';
const {event,message} = JSON.parse(fs.readFileSync(0,'utf8'));
if (!fs.existsSync('main.tex') || args[args.indexOf('--model') + 1] !== 'fixture-gemini' ||
  args[args.indexOf('--input-format') + 1] !== 'stream-json' || event !== 'user') process.exit(2);
const resumed = args[args.indexOf('--conversation') + 1] === id;
if (args.includes('--conversation') && !resumed) process.exit(3);
console.log(JSON.stringify({event:'init',conversation_id:id}));
console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',conversation_id:id,
  response:(resumed ? '继续 ' : '收到 ')+message.content}}));
