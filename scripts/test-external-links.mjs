import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/js/external-links.js', 'utf8');
const links = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const opened = [], notices = [];
const api = { openExternal: async url => { opened.push(url); return { ok: true }; } };
const notify = item => notices.push(item);
assert.equal(await links.openExternalLink(api, links.PROJECT_HOME, notify), true);
await links.openUpdateDownload(api, { asset: { url: 'https://example.com/setup.exe' }, url: 'https://example.com/release' }, notify);
assert.equal(opened.at(-1), 'https://example.com/setup.exe');
await links.openUpdateDownload(api, { url: 'https://example.com/release' }, notify);
assert.equal(opened.at(-1), 'https://example.com/release');
assert.equal(await links.openExternalLink({ openExternal: async () => ({ ok: false, error: 'denied' }) }, links.PROJECT_HOME, notify), false);
assert.ok(notices.at(-1).body.includes(links.PROJECT_HOME));
await links.openExternalLink({ openExternal: async () => { throw new Error('OS failure'); } }, links.PROJECT_HOME, notify);
assert.ok(notices.at(-1).body.includes('OS failure'));

// Execute the actual About dialog and its listener without launching the user's browser.
const dialogs = fs.readFileSync('src/js/dialogs.js', 'utf8');
const about = dialogs.slice(dialogs.indexOf('  async function openAbout()'), dialogs.indexOf('  /* -------------------------------------------------------------- shortcuts */'));
let listener;
const context = vm.createContext({
  ctx: { api: { info: async () => ({}), tex: { info: async () => ({}) }, ...api }, state: { texInfo: {} } },
  ...links, toast: notify, escapeHtml: String, icon: () => '', dialogButton: () => '',
  modal: options => {
    assert.ok(!options.foot.includes('onclick='), 'CSP-safe listener');
    options.onMount({ root: { querySelector: selector => {
      assert.equal(selector, '[data-project-home]');
      return { addEventListener: (event, fn) => { assert.equal(event, 'click'); listener = fn; } };
    } } });
  }
});
await vm.runInContext(about + '\nopenAbout()', context);
await listener();
assert.equal(opened.at(-1), links.PROJECT_HOME);

const main = fs.readFileSync('src/main.js', 'utf8');
const check = main.slice(main.indexOf('async function checkUpdates('), main.indexOf('async function runBuild('));
for (const accepted of [true, false]) {
  let downloads = 0;
  await vm.runInNewContext(check + '\ncheckUpdates(true)', {
    api: { update: { check: async () => ({ ok: true, hasUpdate: true, url: 'https://example.com/release' }) }, settings: { set: async () => {} } },
    ctx: { state: { settings: { general: {} } }, dialogs: { confirm: async () => accepted } },
    toast: notify, openUpdateDownload: async () => { downloads++; }
  });
  assert.equal(downloads, accepted ? 1 : 0);
}
console.log('External links: homepage listener, update confirmation, installer/page routing, and failures passed.');
