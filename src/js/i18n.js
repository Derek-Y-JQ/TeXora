/** Interface language. The UI is authored in Chinese; for English and Japanese every text node and
 *  tooltip-like attribute is translated as it enters the DOM, so components need no changes.
 *  Document content, file names and editor text are never touched. */
import en from '../../electron/locales/en.json';
import ja from '../../electron/locales/ja.json';
import { createTranslator } from './i18n-core.js';

const DICTS = { en, ja };
const ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip', 'alt'];
const CJK = /[㐀-鿿]/;
// Editor text, PDF text and user content (file names, headings, citations, AI answers) stay as written.
const SKIP = [
  '.view-lines', '.view-overlays', '.margin', '.minimap', '.inputarea', '.textLayer', '.annotationLayer', '.pdf-page',
  'textarea', 'pre', 'code', '[contenteditable="true"]', '[data-i18n-skip]', 'script', 'style',
  '.tree-name', '.tab .t-name', '.bc-item', '.l-name', '.s-text', '.search-hit', '.outline-row', '.o-title',
  '.cite-title', '.cite-meta', '.bib-title', '.bib-meta', '.math-env-snippet', '.structure-content', '.structure-source',
  '.ai-msg-body', '.md-preview', '.hc-snippet', '.git-log-row', '.git-change', '.f-name', '.tf-name', '.empty-recent-item'
].join(',');

let lang = 'zh';
let translate = null;
let observer = null;
const textState = new WeakMap();   // text node -> { src, out }
const attrState = new WeakMap();   // element -> { [attr]: { src, out } }

export function currentLanguage() { return lang; }
/** Translate a UI string for code that builds text outside the DOM. */
export function t(text) {
  if (!translate) return text;
  return translate(String(text).replace(/\s+/g, ' ').trim()) ?? text;
}

function skipped(el) { return !el || !!el.closest(SKIP); }

function applyText(node) {
  const current = node.nodeValue;
  const state = textState.get(node);
  if (state && state.out === current) return;
  const norm = current.replace(/\s+/g, ' ').trim();
  if (!norm || !CJK.test(norm)) { textState.delete(node); return; }
  const result = translate(norm);
  if (result == null) { textState.set(node, { src: current, out: current }); return; }
  const out = current.match(/^\s*/)[0] + result + current.match(/\s*$/)[0];
  textState.set(node, { src: current, out });
  node.nodeValue = out;
}

function applyAttr(el, name) {
  const current = el.getAttribute(name);
  let state = attrState.get(el);
  if (current == null) { if (state) delete state[name]; return; }
  if (state?.[name]?.out === current) return;
  if (!CJK.test(current)) { if (state) delete state[name]; return; }
  const result = translate(current.replace(/\s+/g, ' ').trim());
  if (!state) attrState.set(el, (state = {}));
  state[name] = { src: current, out: result ?? current };
  if (result != null) el.setAttribute(name, result);
}

function applyTree(root) {
  if (root.nodeType === 3) { if (!skipped(root.parentElement)) applyText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  for (const name of ATTRS) if (root.hasAttribute(name)) applyAttr(root, name);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === 1) return node.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) applyText(node);
    else for (const name of ATTRS) if (node.hasAttribute(name)) applyAttr(node, name);
  }
}

function restoreTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === 3) {
      const state = textState.get(node);
      if (state && node.nodeValue === state.out) node.nodeValue = state.src;
      textState.delete(node);
    } else {
      const state = attrState.get(node);
      if (state) for (const [name, value] of Object.entries(state)) if (node.getAttribute(name) === value.out) node.setAttribute(name, value.src);
      attrState.delete(node);
    }
  }
}

function onMutations(records) {
  for (const record of records) {
    if (record.type === 'characterData') { if (!skipped(record.target.parentElement)) applyText(record.target); }
    else if (record.type === 'attributes') { if (!skipped(record.target)) applyAttr(record.target, record.attributeName); }
    else for (const node of record.addedNodes) applyTree(node);
  }
}

/** Switch the interface language: 'zh' (source), 'en' or 'ja'. Safe to call repeatedly. */
export function setLanguage(next) {
  const target = DICTS[next] ? next : 'zh';   // 'zh-CN' and unknown values fall back to the source language
  if (target === lang) return;
  observer?.disconnect();
  observer = null;
  if (translate) restoreTree(document.body);
  lang = target;
  translate = lang === 'zh' ? null : createTranslator(DICTS[lang]);
  document.documentElement.lang = { zh: 'zh-CN', en: 'en', ja: 'ja' }[lang];
  document.documentElement.dataset.lang = lang;
  if (!translate) return;
  applyTree(document.body);
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
