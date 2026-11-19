'use strict';

const fs = require('node:fs');
const path = require('node:path');
const textFile = /\.(?:tex|ltx|bib|sty|cls|bst|md|txt|csv|json|[yu]aml|toml|lua|py|js|ts|sh|ps1|pl|svg|m|r|j[ls])$/i;
const maxFileBytes = 128 * 1024;
const maxSnapshotBytes = 12 * 1024 * 1024;
const maxEntries = 10000;
const skip = new Set(['node_modules','__pycache__','.git','.latex_cache']);

function snapshotProject(root, cacheDir) {
  const files = new Map();
  const dirs = [root];
  let entries = 0, bytes = 0, limited = false;
  while (dirs.length && entries < maxEntries) {
    const dir = dirs.pop();
    let list;
    try { list = fs.readdirSync(dir,{withFileTypes:true}); }
    catch { limited = true; continue; }
    for (const entry of list) {
      if (++entries > maxEntries) { limited = true; break; }
      const file = path.join(dir,entry.name);
      if (file === cacheDir || skip.has(entry.name)) continue;
      if (entry.isDirectory() && !entry.name.startsWith('.')) dirs.push(file);
      if (!entry.isFile() || (!textFile.test(entry.name) && !/^\.?latexmkrc$/i.test(entry.name)) || /^\./.test(entry.name) && entry.name !== '.latexmkrc') continue;
      const relative = path.relative(root,file);
      files.set(relative,null);
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.size > maxFileBytes || bytes + stat.size > maxSnapshotBytes) {
          limited = true;
          continue;
        }
        const buffer = fs.readFileSync(file);
        if (buffer.includes(0) || buffer.length > maxFileBytes) { limited = true; continue; }
        bytes += buffer.length;
        files.set(relative,buffer.toString('utf8'));
      } catch { limited = true; }
    }
  }
  return { files, limited: limited || dirs.length > 0 };
}

function compareProject(before, after) {
  const changes = [];
  let limited = before.limited || after.limited;
  let bytes = 0;
  for (const file of new Set([...before.files.keys(),...after.files.keys()])) {
    const left = before.files.get(file);
    const right = after.files.get(file);
    if (left === right || left === null || right === null) continue;
    if ((left === undefined && before.limited) || (right === undefined && after.limited)) continue;
    bytes += Buffer.byteLength(left ?? '') + Buffer.byteLength(right ?? '');
    if (bytes > 2 * 1024 * 1024) { limited = true; break; }
    changes.push({file,left:left ?? '',right:right ?? '',kind:left === undefined ? 'added' : right === undefined ? 'deleted' : 'modified'});
  }
  return { changes, limited };
}
module.exports = {snapshotProject,compareProject};
