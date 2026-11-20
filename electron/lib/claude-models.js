'use strict';
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { killTree } = require('./run');
const { safeError } = require('./codex-login');

const DEFAULT_CLAUDE_MODELS = [
  { id: 'sonnet', label: 'Claude Sonnet (sonnet)' },
  { id: 'opus', label: 'Claude Opus (opus)' },
  { id: 'haiku', label: 'Claude Haiku (haiku)' }
];

function parseClaudeModelList(rawModels) {
  if (!Array.isArray(rawModels)) return [];
  const models = new Map();
  let defaultResolved = '';
  for (const entry of rawModels) {
    if (!entry || typeof entry !== 'object') continue;
    const rawId = typeof entry.value === 'string' ? entry.value.trim()
      : typeof entry.id === 'string' ? entry.id.trim()
      : typeof entry.model === 'string' ? entry.model.trim() : '';
    const displayName = typeof entry.displayName === 'string' ? entry.displayName.trim()
      : typeof entry.name === 'string' ? entry.name.trim() : '';
    const resolved = typeof entry.resolvedModel === 'string' ? entry.resolvedModel.trim() : '';
    if (!rawId) continue;
    if (rawId === 'default') {
      defaultResolved = resolved || displayName;
      continue;
    }
    const label = displayName || rawId;
    const isDefault = entry.isDefault === true || (!!defaultResolved && (rawId === defaultResolved || resolved === defaultResolved));
    models.set(rawId, { id: rawId, label, isDefault });
  }
  if (defaultResolved && ![...models.values()].some(m => m.isDefault)) {
    for (const model of models.values()) {
      if (model.id === defaultResolved || model.label === defaultResolved) {
        model.isDefault = true;
        break;
      }
    }
  }
  return [...models.values()];
}

// Queries Claude Code's stream-json initialize control request for the live
// model catalog (the same zero-cost handshake used by the official Agent SDK).
function listClaudeModels(spec, options) {
  return new Promise((resolve, reject) => {
    const requestId = 'texora-init-1';
    const child = spawn(spec.exe, [
      ...spec.args,
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--settings', '{"disableAllHooks":true}'
    ], {
      ...options,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let finished = false, stderr = '';
    const timer = setTimeout(() => finish(Error('读取 Claude Code 模型超时')), 12000);
    function finish(error, models) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      if (child.exitCode === null && child.signalCode === null) killTree(child.pid);
      if (error) reject(error);
      else resolve(models || []);
    }
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.on('close', () => finish(Error(stderr || 'Claude Code 未返回模型列表')));
    createInterface({ input: child.stderr, crlfDelay: Infinity }).on('line', line => {
      if (line.trim()) stderr = safeError(line);
    });
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', line => {
      if (finished) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'control_response') {
        const resp = msg.response || {};
        if (resp.request_id && resp.request_id !== requestId) return;
        if (resp.subtype === 'error') {
          return finish(Error(safeError(resp.error) || 'Claude Code 模型查询失败'));
        }
        const list = resp.response?.models ?? resp.models;
        const models = parseClaudeModelList(list);
        if (models.length) return finish(null, models);
        return finish(Error('Claude Code 未返回可用模型列表'));
      }
      if (msg.type === 'system' && msg.subtype === 'init' && Array.isArray(msg.models)) {
        const models = parseClaudeModelList(msg.models);
        if (models.length) return finish(null, models);
      }
    });
    child.stdin.write(JSON.stringify({
      type: 'control_request',
      request_id: requestId,
      request: { subtype: 'initialize' }
    }) + '\n');
  });
}

module.exports = { listClaudeModels, parseClaudeModelList, DEFAULT_CLAUDE_MODELS };
