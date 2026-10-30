'use strict';
const fs=require('node:fs');
const retryable=error=>['EPERM','EACCES','EBUSY'].includes(error.code);
// Windows indexing/antivirus can briefly hold the destination after a read.
// Retry replacement without deleting the existing, still-valid state file.
async function replaceFile(from,to){
 for(let attempt=0;;attempt++){
  try{return await fs.promises.rename(from,to);}catch(error){if(!retryable(error)||attempt>=5)throw error;await new Promise(resolve=>setTimeout(resolve,15*2**attempt));}
 }
}
function replaceFileSync(from,to){
 for(let attempt=0;;attempt++){
  try{return fs.renameSync(from,to);}catch(error){if(!retryable(error)||attempt>=5)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15*2**attempt);}
 }
}
module.exports={replaceFile,replaceFileSync};
