'use strict';
/**
 * TeXora preload bridge. Keeps the renderer sandboxed: only these calls are reachable.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

function applyBootAppearance() {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const style = params.get('bootStyle');
  const theme = params.get('bootTheme');
  if (!style && !theme) return true;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  if (style === 'endfield' || style === 'studio') {
    root.dataset.style = style;
    root.dataset.efVariant = 'standard';
    const efAccent = params.get('bootEfAccent');
    if (efAccent) root.dataset.efAccent = efAccent;
    if (style === 'endfield') root.removeAttribute('data-accent');
    else if (params.get('bootAccent')) root.setAttribute('data-accent', params.get('bootAccent'));
  }
  if (params.get('bootCompact') === '1') root.setAttribute('data-compact', '');
  if (params.get('bootReduceMotion') === '1') root.setAttribute('data-reduce-motion', '1');
  return true;
}

if (!applyBootAppearance() && typeof document !== 'undefined') {
  const onReady = () => { if (applyBootAppearance()) document.removeEventListener('readystatechange', onReady); };
  document.addEventListener('readystatechange', onReady);
  document.addEventListener('DOMContentLoaded', applyBootAppearance, { once: true });
}

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

function assetUrl(p) {
  if (!p) return '';
  return 'asset://local/?p=' + encodeURIComponent(p);
}

function on(channel, cb) {
  const wrapped = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const api = {
  info: () => invoke('app:info'),
  resolveOpenTarget: file=>invoke('app:resolveOpenTarget',file),
  takeOpenTargets: ()=>invoke('app:takeOpenTargets'),
  onOpenTarget: cb=>on('app:open-target',cb),
  droppedPath: file=>webUtils.getPathForFile(file),
  agent: {
    list: () => invoke('agent:list'), models:(id,refresh) => invoke('agent:models',id,refresh), environment: () => invoke('agent:environment'), loginCode:code => invoke('agent:login-code',code), status:id => invoke('agent:status',id), history:id => invoke('agent:history',id),
    start:(id,kind,request) => invoke('agent:start',id,kind,request), stop:() => invoke('agent:stop'),
    onEvent: cb => on('agent:event',cb)
  },
  pdf: {
    open: file => invoke('pdf:open', file),
    popoutOpen: payload => invoke('pdf:popoutOpen', payload),
    popoutUpdate: payload => invoke('pdf:popoutUpdate', payload),
    popoutClose: () => invoke('pdf:popoutClose'),
    popoutState: () => invoke('pdf:popoutState'),
    popoutGoto: loc => invoke('pdf:popoutGoto', loc),
    popoutFlash: target => invoke('pdf:popoutFlash', target),
    onPopoutUpdate: cb => on('pdf:popoutUpdate', cb),
    onPopoutGoto: cb => on('pdf:popoutGoto', cb),
    onPopoutFlash: cb => on('pdf:popoutFlash', cb)
  },
  update: { check: () => invoke('update:check') },
  overleaf: {
    login: () => invoke('overleaf:login'), logout: () => invoke('overleaf:logout'),
    onLoginComplete: cb => on('overleaf:loginComplete',cb),
    projects: () => invoke('overleaf:projects'), load: (id,requestId) => invoke('overleaf:load',id,requestId),
    onLoadProgress: cb => on('overleaf:loadProgress',cb),
    binding: () => invoke('overleaf:binding'), plan: () => invoke('overleaf:plan'),
    apply: token => invoke('overleaf:apply',token),
    liveConnect: id => invoke('overleaf:liveConnect',id),
    liveDisconnect: () => invoke('overleaf:liveDisconnect'),
    liveState: () => invoke('overleaf:liveState'),
    liveJoinDoc: docIdOrPath => invoke('overleaf:liveJoinDoc',docIdOrPath),
    liveLeaveDoc: docIdOrPath => invoke('overleaf:liveLeaveDoc',docIdOrPath),
    liveApplyChanges: (docIdOrPath,changes,finalText) => invoke('overleaf:liveApplyChanges',docIdOrPath,changes,finalText),
    liveCompile: opts => invoke('overleaf:liveCompile',opts),
    liveStopCompile: () => invoke('overleaf:liveStopCompile'),
    liveSyncForward: (file,line,col) => invoke('overleaf:liveSyncForward',file,line,col),
    liveSyncInverse: (page,x,y) => invoke('overleaf:liveSyncInverse',page,x,y),
    liveUpdatePosition: (docIdOrPath,row,col) => invoke('overleaf:liveUpdatePosition',docIdOrPath,row,col),
    liveCreateDoc: (parent,name) => invoke('overleaf:liveCreateDoc',parent,name),
    liveCreateFolder: (parent,name) => invoke('overleaf:liveCreateFolder',parent,name),
    liveRename: (target,newName) => invoke('overleaf:liveRename',target,newName),
    liveMove: (target,destFolder) => invoke('overleaf:liveMove',target,destFolder),
    liveDelete: target => invoke('overleaf:liveDelete',target),
    liveSetRootDoc: target => invoke('overleaf:liveSetRootDoc',target),
    liveUploadFile: (parent,localPath) => invoke('overleaf:liveUploadFile',parent,localPath),
    liveFetchFile: target => invoke('overleaf:liveFetchFile',target),
    liveUpdateSettings: patch => invoke('overleaf:liveUpdateSettings',patch),
    liveClearCompileCache: () => invoke('overleaf:liveClearCompileCache'),
    liveFetchHistory: opts => invoke('overleaf:liveFetchHistory',opts),
    liveFetchHistoryDiff: opts => invoke('overleaf:liveFetchHistoryDiff',opts),
    liveSearch: opts => invoke('overleaf:liveSearch',opts),
    liveFetchChat: opts => invoke('overleaf:liveFetchChat',opts),
    liveSendChat: content => invoke('overleaf:liveSendChat',content),
    liveFetchComments: () => invoke('overleaf:liveFetchComments'),
    liveAddComment: payload => invoke('overleaf:liveAddComment',payload),
    liveReplyComment: (threadId,content) => invoke('overleaf:liveReplyComment',threadId,content),
    liveResolveComment: threadId => invoke('overleaf:liveResolveComment',threadId),
    liveReopenComment: threadId => invoke('overleaf:liveReopenComment',threadId),
    liveDeleteComment: threadId => invoke('overleaf:liveDeleteComment',threadId),
    onLiveEvent: cb => on('overleaf:liveEvent',cb)
  },
  systemFonts: () => invoke('app:systemFonts'),
  ready: () => ipcRenderer.send('app:renderer-ready'),
  captureNow: (p) => invoke('app:captureNow', p),
  openExternal: (url) => invoke('app:openExternal', url),
  openPath: (p) => invoke('app:openPath', p),
  showItemInFolder: (p) => invoke('app:showItemInFolder', p),

  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggleMaximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:isMaximized'),
    setZoom: (factor) => invoke('window:setZoom', factor),
    onState: (cb) => on('window:state', cb)
  },

  settings: {
    all: () => invoke('settings:get'),
    set: (key, value) => invoke('settings:set', key, value),
    patch: (patch) => invoke('settings:set', patch),
    reset: (section) => invoke('settings:reset', section),
    defaults: () => invoke('settings:defaults'),
    onChange: (cb) => on('settings:changed', cb)
  },

  theme: {
    native: (dark) => invoke('theme:native', dark)
  },

  dialog: {
    openFolder: () => invoke('dialog:openFolder'),
    openFiles: (opts) => invoke('dialog:openFiles', opts),
    saveFile: (opts) => invoke('dialog:saveFile', opts),
    message: (opts) => invoke('dialog:message', opts)
  },

  project: {
    open: (path) => invoke('project:open', path),
    info: () => invoke('project:info'),
    removeRecent: (path) => invoke('project:removeRecent', path),
    close: () => invoke('project:close'),
    tree: (opts) => invoke('project:tree', opts),
    assets: () => invoke('project:assets'),
    setRootFile: (file) => invoke('project:setRootFile', file),
    refreshRoot: () => invoke('project:refreshRoot'),
    onChange: (cb) => on('project:changed', cb),
    onFsChange: (cb) => on('fs:changed', cb)
  },

  fs: {
    read: (file) => invoke('fs:read', file),
    write: (file, text) => invoke('fs:write', file, text),
    stat: (file) => invoke('fs:stat', file),
    createFile: (dir, name, content) => invoke('fs:createFile', dir, name, content),
    createDir: (dir, name) => invoke('fs:createDir', dir, name),
    rename: (from, to) => invoke('fs:rename', from, to),
    delete: (target) => invoke('fs:delete', target),
    saveImage: (dir, name, base64) => invoke('fs:saveImage', dir, name, base64),
    readBinary: (file) => invoke('fs:readBinary', file),
    moveInto: (file, dir) => invoke('fs:moveInto', file, dir)
  },

  clipboard: {
    readImage: () => invoke('clipboard:readImage'),
    writeText: (text) => invoke('clipboard:writeText', text),
    readText: () => invoke('clipboard:readText')
  },

  build: {
    run: (opts) => invoke('build:run', opts),
    stop: () => invoke('build:stop'),
    clean: (all) => invoke('build:clean', all),
    cleanPlan: all=>invoke('build:cleanPlan',all),
    last: () => invoke('build:last'),
    existing: () => invoke('build:existing'),
    state: () => invoke('build:state'),
    onStatus: (cb) => on('build:status', cb),
    onLog: (cb) => on('build:log', cb),
    onDone: (cb) => on('build:done', cb)
  },

  tex: {
    info: () => invoke('tex:info'),
    refresh: () => invoke('tex:refresh'),
    packages: (q, limit) => invoke('tex:packages', q, limit),
    fonts: (force) => invoke('tex:fonts', force),
    installPackage: (name) => invoke('tex:installPackage', name),
    codeStatus: options => invoke('tex:codeStatus', options),
    prepareCode: options => invoke('tex:prepareCode', options),
    styFiles: () => invoke('tex:styFiles'),
    envDefs: (payload) => invoke('tex:envDefs', payload),
    synctexForward: (file, line, col) => invoke('tex:synctexForward', file, line, col),
    synctexInverse: (page, x, y) => invoke('tex:synctexInverse', page, x, y),
    snippet: (payload) => invoke('tex:snippet', payload),
    lint: (file) => invoke('tex:lint', file),
    latexdiff: (a, b, name) => invoke('tex:latexdiff', a, b, name),
    kpsewhich: (name) => invoke('tex:kpsewhich', name)
  },

  lookup: {
    doi: (id) => invoke('lookup:doi', id)
  },

  search: {
    project: (options) => invoke('search:project', options),
    replace: (options) => invoke('search:replace', options)
  },

  history: {
    list: (file) => invoke('history:list', file),
    read: (id) => invoke('history:read', id),
    restore: (id) => invoke('history:restore', id),
    snapshot: (file, content, reason) => invoke('history:snapshot', file, content, reason)
  },

  ai: {
    providers: () => invoke('ai:providers'),
    chat: (payload) => invoke('ai:chat', payload),
    test: (payload) => invoke('ai:test', payload),
    cancel: (id) => invoke('ai:cancel', id),
    historyList: (root) => invoke('ai:historyList', root),
    historySave: (record) => invoke('ai:historySave', record),
    skills: () => invoke('ai:skills'),
    addSkill: (filePath) => invoke('ai:skillAdd', filePath),
    removeSkill: (id) => invoke('ai:skillRemove', id),
    toggleSkill: (id, enabled) => invoke('ai:skillToggle', id, enabled),
    readSkill: (id) => invoke('ai:skillRead', id),
    saveSkill: (id, content) => invoke('ai:skillSave', id, content)
  },

  git: {
    status: () => invoke('git:status'),
    log: (limit) => invoke('git:log', limit),
    diff: (file, staged) => invoke('git:diff', file, staged),
    stage: (file) => invoke('git:stage', file),
    commit: (msg, all) => invoke('git:commit', msg, all),
    pull: () => invoke('git:pull'),
    push: () => invoke('git:push'),
    branches: () => invoke('git:branches'),
    checkout: (b) => invoke('git:checkout', b),
    init: () => invoke('git:init')
  },

  on,
  assetUrl
};

contextBridge.exposeInMainWorld('texora', api);
