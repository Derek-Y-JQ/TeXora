import {createRequire} from 'node:module';
const version=createRequire(import.meta.url)('../package.json').version;
import assert from 'node:assert/strict';
export default async function({evalJs,sleep}) {
 for(let i=0;i<100;i++){if(await evalJs('!!window.__texora?.editor?.editor'))break;await sleep(100);}
 assert.equal(await evalJs('!!window.__texora?.editor?.editor'),true,'editor and preload bridge initialize');
 assert.equal(await evalJs('typeof window.require'),'undefined');
 assert.equal(await evalJs('(async()=>{const info=await window.__texora.api.info();return info.version})()'),version);
 console.log('PASS packaged UI, preload bridge and editor initialize');
}
