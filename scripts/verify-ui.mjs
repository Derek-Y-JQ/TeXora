/**
 * Visual verification pass: walks the main UI surfaces in both themes and
 * writes screenshots into .capture/ui/.
 *
 *   node scripts/cdp.mjs --script scripts/verify-ui.mjs -- --project=samples/demo
 */
export default async function verify({ evalJs, shot, click, hover, sleep, send }) {
  const results = [];
  const check = async (label, expr) => {
    try {
      const value = await evalJs(expr);
      results.push(`${label}: ${JSON.stringify(value)}`);
      return value;
    } catch (err) {
      results.push(`${label}: ERROR ${err.message}`);
    }
  };

  // wait for the initial build
  for (let i = 0; i < 40; i++) {
    const pages = await evalJs("document.querySelectorAll('.pdf-page').length");
    if (pages > 0) break;
    await sleep(750);
  }
  await check('pages', "document.querySelectorAll('.pdf-page').length");
  await check('activeTab', "document.querySelector('.tab.active .t-name')?.textContent");
  await check('outlineCount', "document.querySelectorAll('.outline-row').length");
  await shot('.capture/ui/01-dark-main.png');

  // block hover
  await hover('.monaco-editor');
  await sleep(500);
  await shot('.capture/ui/02-dark-block-hover.png');

  // sidebar panels
  await click('[data-panel="outline"]');
  await shot('.capture/ui/03-dark-outline.png');
  await click('[data-panel="math"]');
  await shot('.capture/ui/04-dark-math.png');
  await click('[data-panel="labels"]');
  await shot('.capture/ui/05-dark-labels.png');
  await click('[data-panel="search"]');
  await evalJs("(() => { const i = document.querySelector('#searchQuery'); i.value='theorem'; i.dispatchEvent(new Event('input', {bubbles:true})); return i.value; })()");
  await sleep(1600);
  await shot('.capture/ui/06-dark-search.png');
  await click('[data-panel="history"]');
  await shot('.capture/ui/07-dark-history.png');
  await click('[data-panel="git"]');
  await shot('.capture/ui/08-dark-git.png');
  await click('[data-panel="ai"]');
  await shot('.capture/ui/09-dark-ai.png');
  await click('[data-panel="files"]');

  // problems panel
  await click('[data-cmd="build.toggleProblems"]');
  await click('.ptab[data-problems="log"]');
  await shot('.capture/ui/10-dark-problems.png');
  await click('[data-cmd="build.toggleProblems"]');

  // command palette
  await evalJs("window.dispatchEvent(new KeyboardEvent('keydown', {key:'k', code:'KeyK', ctrlKey:true, bubbles:true}))");
  await sleep(400);
  await shot('.capture/ui/11-dark-palette.png');
  await evalJs("document.querySelector('.palette-backdrop').click()");

  // settings
  await click('#settingsBtn');
  await sleep(500);
  await shot('.capture/ui/12-dark-settings-editor.png');
  await click('.settings-nav-item[data-section="build"]');
  await shot('.capture/ui/13-dark-settings-build.png');
  await click('.settings-nav-item[data-section="tex"]');
  await shot('.capture/ui/14-dark-settings-tex.png');
  await click('.settings-nav-item[data-section="ai"]');
  await shot('.capture/ui/15-dark-settings-ai.png');
  await click('.settings-nav-item[data-section="appearance"]');
  await shot('.capture/ui/16-dark-settings-appearance.png');
  await click('.settings-nav-item[data-section="keys"]');
  await shot('.capture/ui/17-dark-settings-keys.png');

  // switch to light theme inside settings
  await click('.settings-nav-item[data-section="appearance"]');
  await click('[data-theme-choice="light"]');
  await sleep(700);
  await shot('.capture/ui/18-light-settings-appearance.png');
  await evalJs("document.querySelector('.settings-modal .modal-close').click()");
  await sleep(600);
  await shot('.capture/ui/19-light-main.png');

  // dialogs in light theme
  await click('[data-cmd="templates.open"]');
  await sleep(600);
  await shot('.capture/ui/20-light-templates.png');
  await evalJs("document.querySelector('.modal-close').click()");
  await click('[data-cmd="insert.table"]');
  await sleep(500);
  await shot('.capture/ui/21-light-table.png');
  await evalJs("document.querySelector('.modal-close').click()");
  await click('[data-menu="math"]');
  await sleep(300);
  await evalJs("document.querySelectorAll('.menu-item')[0].click()");
  await sleep(500);
  await shot('.capture/ui/22-light-symbols.png');
  await evalJs("document.querySelector('.modal-close').click()");
  await click('[data-cmd="insert.cite"]');
  await sleep(400);
  await shot('.capture/ui/23-light-cite.png');
  await evalJs("document.querySelector('.modal-close').click()");
  await click('[data-cmd="project.new"]');
  await sleep(400);
  await shot('.capture/ui/24-light-new-doc.png');
  await evalJs("document.querySelector('.modal-close').click()");

  // back to dark + problems + math preview in editor
  await click('#themeToggle');
  await sleep(600);
  await evalJs("(() => { const ed = document.querySelector('.monaco-editor textarea'); return !!ed; })()");

  console.log(results.join('\n'));
}
