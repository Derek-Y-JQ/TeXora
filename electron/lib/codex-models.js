'use strict';
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { killTree } = require('./run');
const { safeError } = require('./codex-login');
const { version } = require('../../package.json');

function listCodexModels(spec, options) {
  return new Promise((resolve,reject) => {
    const child = spawn(spec.exe,[...spec.args,'app-server'],{
      ...options, detached:process.platform !== 'win32', stdio:['pipe','pipe','ignore']
    });
    const models = new Map();
    const cursors = new Set();
    let request = 1, finished = false;
    const timer = setTimeout(() => finish(Error('读取 Codex 模型超时')),12000);
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.stdin.end();
      if (child.exitCode === null && child.signalCode === null) killTree(child.pid);
      if (error) reject(error);
      else resolve([...models.values()]);
    }
    const write = message => child.stdin.write(JSON.stringify(message)+'\n');
    const page = cursor => write({id:++request,method:'model/list',params:{limit:100,cursor,includeHidden:false}});
    child.on('error',error=>finish(error));
    child.stdin.on('error',error=>finish(error));
    child.on('close',()=>finish(Error('Codex 未返回模型列表')));
    createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>{
      if (finished) return;
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== request) return;
      if (message.error) return finish(Error(safeError(message.error.message) || 'Codex 模型查询失败'));
      if (request === 1) { write({method:'initialized'}); page(null); return; }
      const result = message.result;
      if (!Array.isArray(result?.data)) return finish(Error('Codex 返回的模型列表格式无效'));
      for (const entry of result.data) {
        const id = entry?.model || entry?.id;
        if (!entry?.hidden && typeof id === 'string' && id) {
          models.set(id,{id,label:typeof entry.displayName === 'string' ? entry.displayName || id : id,isDefault:entry.isDefault === true});
        }
      }
      const cursor = result.nextCursor;
      if (!cursor) return finish();
      if (typeof cursor !== 'string' || cursors.has(cursor)) return finish(Error('Codex 返回了无效的模型分页'));
      cursors.add(cursor);
      page(cursor);
    });
    write({id:1,method:'initialize',params:{clientInfo:{name:'texora',title:'TeXora',version},capabilities:null}});
  });
}
module.exports = {listCodexModels};
