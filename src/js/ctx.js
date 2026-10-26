/** Shared application context. Populated by main.js; modules import it lazily. */
export const ctx = {
  api: null,
  state: {
    settings: null,
    project: { root: '', name: '', rootFile: '', recent: [] },
    docs: new Map(),
    activePath: '',
    tree: [],
    assets: { tex: [], images: [], bib: [], all: [] },
    parsed: null,
    blocks: [],
    build: { state: 'idle', result: null, running: false },
    problems: [],
    log: '',
    texInfo: { engines: {}, tools: {}, distro: '' },
    fonts: [],
    systemFonts: [],
    packages: [],
    bibEntries: [],
    envDefs: {},
    labelIndex: {},
    projectOutline: [],
    gitStatus: null,
    theme: 'dark',
    capture: null,
    aiBusy: false
  },
  editor: null,
  preview: null,
  sidebar: null,
  ribbon: null,
  dialogs: null,
  settingsUI: null,
  ai: null,
  commands: null,
  /** set by main.js */
  cmd(name, ...args) {
    if (!this.commands) return;
    return this.commands.run(name, ...args);
  },
  emit(name, detail) {
    window.dispatchEvent(new CustomEvent('texora:' + name, { detail }));
  },
  on(name, handler) {
    window.addEventListener('texora:' + name, (event) => handler(event.detail));
  }
};
