'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {replaceFileSync}=require('./atomic-file');
const sameProject = (a, b) => String(a || '').replace(/\\/g, '/').toLowerCase() === String(b || '').replace(/\\/g, '/').toLowerCase();

class AiHistory {
  constructor(file) { this.file = file; }
  read() {
    try { const records = JSON.parse(fs.readFileSync(this.file, 'utf8')); return Array.isArray(records) ? records.filter(r => r && typeof r === 'object' && r.id) : []; }
    catch { return []; }
  }
  list(projectRoot) { return this.read().filter(r => sameProject(r.projectRoot, projectRoot)); }
  save(record) {
    if (!record || typeof record.id !== 'string' || !record.suggestion || !record.snapshot) return { ok: false, error: 'AI 记录不完整' };
    // Keep a bounded local history, separate from settings and provider keys.
    const clean = {};
    for (const key of ['id', 'projectRoot', 'sourcePath', 'title', 'instruction', 'original', 'suggestion', 'kind', 'time', 'appliedText', 'appliedMode']) {
      clean[key] = String(record[key] || '');
    }
    clean.applied = !!record.applied;
    clean.responseMode = record.responseMode === 'answer' ? 'answer' : 'edit';
    clean.incomplete = !!record.incomplete;
    clean.snapshot = { ...record.snapshot };
    clean.conversation=Array.isArray(record.conversation)?record.conversation.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content})):[];
    clean.request = { actionId: record.request?.actionId, target: record.request?.target, attachments: record.request?.attachments, hasImages: !!record.request?.hasImages, model: record.request?.model };
    const records = this.read();
    const index = records.findIndex(r => r.id === clean.id);
    // A delayed pending save must not revert an already applied result.
    if (index >= 0 && records[index].applied && !clean.applied) return { ok: true };
    if (index >= 0) records.splice(index, 1);
    records.push(clean);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(records), 'utf8');
      replaceFileSync(this.file + '.tmp', this.file);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  }
}
module.exports = { AiHistory };
