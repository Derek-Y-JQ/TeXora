'use strict';
/** Main-process side of the interface language: native menus and dialogs. Strings sent to the renderer
 *  stay in Chinese and are translated there. */
const { createTranslator } = require('./i18n-core');
const DICTS = { en: require('../locales/en.json'), ja: require('../locales/ja.json') };
let lang = 'zh';
let translate = null;
function setLanguage(next) {
  lang = DICTS[next] ? next : 'zh';
  translate = lang === 'zh' ? null : createTranslator(DICTS[lang]);
}
function t(text) {
  if (!translate || typeof text !== 'string') return text;
  return translate(text.replace(/\s+/g, ' ').trim()) ?? text;
}
function menu(template) {
  return (template || []).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const next = { ...item };
    if (typeof next.label === 'string') next.label = t(next.label);
    if (Array.isArray(next.submenu)) next.submenu = menu(next.submenu);
    return next;
  });
}
function dialogOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return options;
  const next = { ...options };
  for (const key of ['title', 'message', 'detail', 'buttonLabel', 'checkboxLabel']) if (typeof next[key] === 'string') next[key] = t(next[key]);
  if (Array.isArray(next.buttons)) next.buttons = next.buttons.map(t);
  if (Array.isArray(next.filters)) next.filters = next.filters.map((f) => ({ ...f, name: t(f.name) }));
  return next;
}
/** A translating stand-in for Electron's dialog module. Electron's objects are never modified. */
function wrapDialog(dialog) {
  const wrapped = Object.create(null);
  for (const name of ['showMessageBox', 'showMessageBoxSync', 'showOpenDialog', 'showOpenDialogSync', 'showSaveDialog', 'showSaveDialogSync']) {
    wrapped[name] = (...args) => dialog[name](...args.map((arg) => (arg && arg.constructor === Object ? dialogOptions(arg) : arg)));
  }
  wrapped.showErrorBox = (title, content) => dialog.showErrorBox(t(title), t(content));
  return new Proxy(wrapped, { get: (target, key) => (key in target ? target[key] : dialog[key]) });
}
module.exports = { setLanguage, t, menu, wrapDialog, get language() { return lang; } };
