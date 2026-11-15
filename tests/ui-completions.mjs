import assert from 'node:assert/strict';

export default async function ({ evalJs, sleep, send, press, shot }) {
  async function until(expression) {
    for (let i = 0; i < 100; i++) {
      const result = await evalJs(expression);
      if (result) return result;
      await sleep(40);
    }
    throw new Error('Timed out: ' + expression);
  }
  await until('!!window.__texora?.editor?.editor');
  await evalJs(`(() => {
    const c = window.__texora, e = c.editor;
    c.state.settings.files.autoSave = false;
    c.state.settings.build.livePreview = false;
    e.model = e.createModel('C:/completion-regression.tex', '');
    e.editor.setModel(e.model);
    e.editor.updateOptions({ readOnly: false });
    return true;
  })()`);
  async function input(text) {
    await evalJs(`(() => {
      const e = window.__texora.editor;
      clearTimeout(e._autoCloseTimer);
      e.editor.trigger('test', 'hideSuggestWidget', {});
      e.model.setValue('');
      e.editor.setPosition({ lineNumber: 1, column: 1 });
      e.editor.focus();
      return true;
    })()`);
    await send('Input.insertText', { text });
    await evalJs("window.__texora.editor.editor.trigger('test', 'editor.action.triggerSuggest', {})");
    await until('!!document.querySelector(".suggest-widget.visible .monaco-list-row")');
  }
  for (const prefix of ['\\b', '\\be', '\\beg', '\\begi', '\\begin']) {
    await input(prefix);
    await press('Enter', 'Enter', 13);
    assert.equal(await evalJs('window.__texora.editor.model.getValue()'), '\\begin{}', prefix + ' + Enter leaves the environment empty');
    assert.equal(await evalJs('window.__texora.editor.editor.getPosition().column'), 8, 'caret is inside the braces');
    await until('!!document.querySelector(".suggest-widget.visible .monaco-list-row")');
    assert.ok(await evalJs('document.querySelector(".suggest-widget.visible").textContent.includes("align")'), 'environment suggestions reopen');
  }
  for (const text of ['\\begin{tikzp', '\\begin{']) {
    await input(text);
    // The last item must be fully visible after keyboard navigation, including
    // when filtering leaves just one row. These bounds catch leaked tree padding.
    if (!text.endsWith('tikzp')) await evalJs("window.__texora.editor.editor.trigger('test', 'selectLastSuggestion', {})");
    await sleep(200);
    await shot('.capture/completion-list.png');
    const bounds = await evalJs(`(() => {
      const widget = document.querySelector('.suggest-widget.visible');
      const tree = widget.querySelector('.tree');
      const list = widget.querySelector('.monaco-list');
      const row = widget.querySelector('.monaco-list-row.focused');
      const w = widget.getBoundingClientRect(), l = list.getBoundingClientRect(), r = row.getBoundingClientRect();
      return { padding: getComputedStyle(tree).padding, top: r.top, bottom: r.bottom,
        visibleTop: Math.max(w.top + 1, l.top), visibleBottom: Math.min(w.bottom - 1, l.bottom),
        label: row.textContent, rows: widget.querySelectorAll('.monaco-list-row').length };
    })()`);
    console.log('Completion bounds:', JSON.stringify(bounds));
    assert.equal(bounds.padding, '0px', 'file-tree padding must not affect Monaco');
    assert.ok(bounds.top >= bounds.visibleTop - 1 && bounds.bottom <= bounds.visibleBottom + 1, 'focused row is fully visible');
    if (text.endsWith('tikzp')) assert.equal(bounds.rows, 1);
  }
  await shot('.capture/completion-list.png');
  console.log('PASS begin-prefix Enter and complete single/last environment rows');
}
