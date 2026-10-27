'use strict';
/**
 * Persistent settings store (JSON in app userData).
 * Deep-merged against defaults, supports dotted-path get/set and change events.
 */
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { SYSTEM_PROMPT, BLOCK_ACTIONS, migratePrompts } = require('./ai-defaults');

const DEFAULT_SETTINGS = {
  version: 2,
  general: {
    language: 'zh-CN',
    autoCheckUpdates: true,
    lastUpdateCheck: 0,
    reopenLastProject: true,
    confirmExit: true,
    recentLimit: 12
  },
  appearance: {
    theme: 'dark',
    accent: 'blue',
    codeTheme: 'auto',
    customCss: '',
    uiScale: 100,
    compact: false,
    reduceMotion: false,
    pdfInvertInDark: true,
    pdfZoom: 100,
    pdfFitWidth: true,
    pdfContinuous: true
  },
  editor: {
    blockMode: true,
    blockHover: true,
    blockDrag: true,
    lineNumbers: true,
    relativeLineNumbers: false,
    folding: true,
    indentSize: 2,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: false,
    minimap: false,
    ligatures: true,
    fontSize: 14.5,
    lineHeight: 1.72,
    editorFont: 'Cascadia Code',
    autoCloseEnv: true,
    autoCloseEnd: true,
    autoCloseBrackets: true,
    autoCloseQuotes: true,
    envErrorHint: true,
    listItemAuto: true,
    inlineMathPreview: true,
    imagePreview: true,
    tikzPreview: true,
    tablePreview: true,
    refPreview: true,
    ignoreWarnings: false,
    autosave: true,
    autosaveDelay: 1500,
    spellcheck: false,
    chktex: false,
    formatter: {
      mergeParagraphLines: true,
      normalizeIndent: true,
      beautifyEnvironments: true,
      sectionBanners: true,
      preambleDivider: true,
      cjkPunct: false,
      displaystyle: false,
      collapseBlankLines: true
    }
  },
  build: {
    engine: 'xelatex',
    autoEngine: true,
    bibliography: 'biber',
    recipe: 'auto',
    livePreview: true,
    liveDelay: 900,
    buildOnSave: true,
    autoDetectRoot: true,
    cacheDir: '.latex_cache',
    cleanOnExit: false,
    pdfInRoot: true,
    extraArgs: '',
    maxRuns: 3,
    timeout: 180,
    autoInstallMissing: 'ask',
    mirror: 'https://mirrors.tuna.tsinghua.edu.cn/CTAN/',
    forwardTrigger: 'line-dblclick',
    inverseTrigger: 'pdf-dblclick',
    highlightColor: '#8b5cf6'
  },
  tex: {
    distro: 'auto',
    binPath: '',
    fontMode: 'ctex',
    fonts: { latin: 'Times New Roman', cjk: 'Microsoft YaHei', mono: 'Consolas', sans: 'Microsoft YaHei' }
  },
  ai: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-flash',
    temperature: 0.4,
    maxTokens: 10000,
    timeout: 90,
    systemPrompt: SYSTEM_PROMPT,
    contextScope: 'file-with-preamble',
    crossFile: true,
    includePreamble: true,
    blockActions: BLOCK_ACTIONS,
    skills: [],
    ocrModel: ''
  },
  files: {
    historyEnabled: true,
    historyMaxDays: 14,
    snapshotOnBuild: true,
    snapshotInterval: 8,
    imageDir: 'figures',
    defaultDocClass: 'ctexart',
    templatesDir: ''
  },
  keys: { preset: 'vscode', custom: {} },
  ui: {
    lastProject: '',
    recent: [],
    sidebarTab: 'files',
    sidebarWidth: 292,
    previewWidth: 468,
    ribbonExpanded: true,
    showPreview: true,
    showSidebar: true,
    problemsOpen: false
  }
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isObject(patch)) return base === undefined ? patch : base;
  const out = Array.isArray(base) ? base.slice() : { ...(isObject(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (isObject(v) && isObject(out[k])) out[k] = deepMerge(out[k], v);
    else if (Array.isArray(v)) out[k] = v.slice();
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

class Store extends EventEmitter {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'settings.json');
    this.data = structuredClone(DEFAULT_SETTINGS);
    this._load();
  }

  _load() {
    const read = (file) => {
      const raw = fs.readFileSync(file, 'utf8');
      return deepMerge(structuredClone(DEFAULT_SETTINGS), JSON.parse(raw));
    };
    try {
      this.data = read(this.file);
    } catch {
      try {
        this.data = read(this.file + '.bak');
      } catch {
        this.data = structuredClone(DEFAULT_SETTINGS);
      }
    }
    const actions = this.data.ai?.blockActions;
    let migrated = false;
    if (!this.data.migrations?.prompts133) {
      migratePrompts(this.data.ai);
      this.data.migrations = { ...this.data.migrations, prompts133: true };
      migrated = true;
    }
    if (!this.data.migrations?.maxTokens10000) {
      if (this.data.ai?.maxTokens === 2048) this.data.ai.maxTokens = 10000;
      this.data.migrations = { ...this.data.migrations, maxTokens10000: true };
      migrated = true;
    }
    if (!this.data.migrations?.deepseekFlash131) {
      if (this.data.ai?.provider === 'deepseek' && this.data.ai.model === 'deepseek-chat' && /^https:\/\/api\.deepseek\.com\/?(?:v1\/?)?$/.test(this.data.ai.baseUrl || 'https://api.deepseek.com/v1')) this.data.ai.model = 'deepseek-flash';
      this.data.migrations = { ...this.data.migrations, deepseekFlash131: true };
      migrated = true;
    }
    if (Array.isArray(actions)) {
      for (const a of actions) if (a.id === 'ask' && a.label === '提问') a.label = '解释';
    }
    if (migrated) this._save();
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (fs.existsSync(this.file)) {
        try { fs.copyFileSync(this.file, this.file + '.bak'); } catch {}
      }
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] save failed', err);
    }
  }

  all() {
    return this.data;
  }

  get(key, fallback) {
    if (!key) return this.data;
    const parts = key.split('.');
    let cur = this.data;
    for (const p of parts) {
      if (cur == null) return fallback;
      cur = cur[p];
    }
    return cur === undefined ? fallback : cur;
  }

  set(patchOrKey, value) {
    if (typeof patchOrKey === 'string') {
      const parts = patchOrKey.split('.');
      let cur = this.data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!isObject(cur[parts[i]])) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      this._save();
      this.emit('change', this.data, patchOrKey);
      return this.data;
    }
    this.data = deepMerge(this.data, patchOrKey);
    this._save();
    this.emit('change', this.data, null);
    return this.data;
  }

  reset(section) {
    // Credentials and skill bindings are user assets: never drop them on reset.
    const keepAi = this.data.ai ? { apiKey: this.data.ai.apiKey, baseUrl: this.data.ai.baseUrl, provider: this.data.ai.provider, model: this.data.ai.model, skills: this.data.ai.skills } : null;
    if (!section) this.data = structuredClone(DEFAULT_SETTINGS);
    else this.data[section] = structuredClone(DEFAULT_SETTINGS[section]);
    if (keepAi && this.data.ai) Object.assign(this.data.ai, keepAi);
    this._save();
    this.emit('change', this.data, section || null);
    return this.data;
  }
}

module.exports = { Store, DEFAULT_SETTINGS, deepMerge };
