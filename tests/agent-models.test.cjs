'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentSession, launchSpec, parseAntigravityModels, collectSearchDirs } = require('../electron/lib/agent-session');
const { listClaudeModels, parseClaudeModelList, DEFAULT_CLAUDE_MODELS } = require('../electron/lib/claude-models');

test('parseAntigravityModels parses ANSI-colored, multi-space, tab, single-space, and slug-only outputs', () => {
  const sample = [
    '\x1b[1mMODEL ID              NAME\x1b[0m',
    '----------------------------------------',
    '* \x1b[32mgemini-4-neon-high\x1b[0m    Gemini 4 Neon (High)',
    'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
    'gemini-4-argon-medium Gemini 4 Argon (Medium)',
    'gemini-3.6-flash-high',
    'Tip: pass --model <slug> to pin a model.'
  ].join('\n');

  const models = parseAntigravityModels(sample);
  assert.deepEqual(models, [
    { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)', isDefault: true },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)', isDefault: false },
    { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)', isDefault: false },
    { id: 'gemini-3.6-flash-high', label: 'gemini-3.6-flash-high', isDefault: false }
  ]);
});

test('parseAntigravityModels falls back cleanly on display-name-only output', () => {
  const sample = [
    'Available models:',
    'Gemini 3.5 Flash (Medium) (default)',
    'Gemini 3.1 Pro (High)'
  ].join('\n');

  const models = parseAntigravityModels(sample);
  assert.deepEqual(models, [
    { id: 'gemini-3.5-flash-medium', label: 'Gemini 3.5 Flash (Medium)', isDefault: true },
    { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)', isDefault: false }
  ]);
});

test('parseClaudeModelList resolves default model and extracts entries', () => {
  const models = parseClaudeModelList([
    { value: 'default', displayName: 'Default', resolvedModel: 'claude-opus-5-5' },
    { value: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5' },
    { value: 'claude-opus-5-5', displayName: 'Claude Opus 5.5' }
  ]);
  assert.deepEqual(models, [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', isDefault: false },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', isDefault: true }
  ]);
});

test('listClaudeModels discovers live models via initialize control_request', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texora-claude-models-'));
  const pkgDir = path.join(root, 'node_modules', '@anthropic-ai', 'claude-code');
  fs.mkdirSync(pkgDir, { recursive: true });
  const bin = path.join(pkgDir, 'bin.cjs');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'agent-provider.cjs'), bin);

  const models = await listClaudeModels(
    { exe: process.execPath, args: [bin], path: process.env.PATH },
    { cwd: root, windowsHide: true, env: process.env }
  );
  assert.equal(models.length, 2);
  assert.equal(models[0].id, 'claude-sonnet-5-5');
  assert.equal(models[0].isDefault, true);
  assert.equal(models[1].id, 'claude-opus-5-5');
  fs.rmSync(root, { recursive: true, force: true });
});

test('collectSearchDirs includes macOS Homebrew/desktop paths and Windows package managers', () => {
  const macDirs = collectSearchDirs(
    { id: 'codex', pkg: '@openai/codex' },
    { platform: 'darwin', home: '/Users/demo', env: { PATH: '/usr/bin:/bin' } }
  );
  assert.ok(macDirs.includes('/opt/homebrew/bin'));
  assert.ok(macDirs.includes('/usr/local/bin'));
  assert.ok(macDirs.includes('/Users/demo/.local/bin'));
  assert.ok(macDirs.includes('/Applications/Codex.app/Contents/Resources'));

  const winDirs = collectSearchDirs(
    { id: 'codex', pkg: '@openai/codex' },
    {
      platform: 'win32',
      home: 'C:\\Users\\demo',
      env: {
        PATH: 'C:\\Windows\\System32',
        APPDATA: 'C:\\Users\\demo\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local',
        ProgramFiles: 'C:\\Program Files',
        NVM_SYMLINK: 'C:\\Program Files\\nodejs'
      }
    }
  );
  assert.ok(winDirs.includes('C:\\Users\\demo\\AppData\\Roaming\\npm'));
  assert.ok(winDirs.includes('C:\\Users\\demo\\AppData\\Local\\pnpm'));
  assert.ok(winDirs.includes('C:\\Users\\demo\\scoop\\shims'));
  assert.ok(winDirs.includes('C:\\Program Files\\nodejs'));
});

test('AgentSession discovers codex, claude, and agy models and falls back gracefully on legacy claude', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texora-agent-session-'));
  const binDir = path.join(root, 'bin');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  // Place executable claude (legacy, exits 1 on --input-format) and agy (ANSI models)
  const legacyClaude = path.join(binDir, 'claude');
  fs.writeFileSync(legacyClaude, `#!/usr/bin/env node\nprocess.exit(1);\n`, { mode: 0o755 });

  const agyBin = path.join(binDir, 'agy');
  fs.writeFileSync(agyBin, [
    '#!/usr/bin/env node',
    'if (process.argv[2] === "--version") { console.log("agy 1.6.0"); process.exit(0); }',
    'if (process.argv[2] === "models") { console.log("\\x1b[36mgemini-4-neon-high\\x1b[0m  Gemini 4 Neon (High)"); process.exit(0); }',
    'process.exit(0);'
  ].join('\n'), { mode: 0o755 });

  const prevPath = process.env.PATH;
  process.env.PATH = binDir + path.delimiter + prevPath;
  try {
    const spec = launchSpec({ id: 'agy' }, { probeShell: false });
    assert.equal(spec?.exe, agyBin);

    const session = new AgentSession(() => {}, dataDir, () => {});
    const agyRes = await session.models('agy', root, true);
    assert.equal(agyRes.source, 'agy');
    assert.equal(agyRes.authenticated, true);
    assert.deepEqual(agyRes.models, [{ id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)', isDefault: false }]);

    const claudeRes = await session.models('claude', root, true);
    assert.equal(claudeRes.source, 'suggested');
    assert.deepEqual(claudeRes.models, DEFAULT_CLAUDE_MODELS);

    const env = await session.environment();
    const agyEnv = env.find(t => t.id === 'agy');
    assert.equal(agyEnv.installed, true);
    assert.equal(agyEnv.binPath, agyBin);
    assert.equal(agyEnv.version, 'agy 1.6.0');
  } finally {
    process.env.PATH = prevPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
