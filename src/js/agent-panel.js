import { Terminal } from '@xterm/xterm';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function setupAgentPanel(panel, api) {
  const ask = panel.querySelector('.ai-panel');
  const agent = panel.querySelector('.agent-panel');
  const select = agent.querySelector('select');
  const start = agent.querySelector('[data-start]');
  const stop = agent.querySelector('[data-stop]');
  const status = agent.querySelector('[role=status]');
  const host = agent.querySelector('.agent-terminal');
  const frame = agent.querySelector('.agent-web');
  let terminal, fit, running = false;
  function controls() {
    select.disabled = running;
    start.disabled = running || !select.value;
    stop.disabled = !running;
  }
  async function detect() {
    const providers = await api.agent.list();
    const selected = select.value;
    select.replaceChildren();
    for (const p of providers) {
      const option = new Option(p.label + (p.installed ? '' : '（未安装）'), p.id);
      option.disabled = !p.installed;
      select.add(option);
    }
    select.value = providers.find(p => p.installed && p.id === selected)?.id || providers.find(p => p.installed)?.id || '';
    if (!running) status.textContent = select.value ? '登录、授权和项目操作由所选工具处理。' : '未检测到工具。请安装 Codex、Claude Code 或 DeepSeek Harness，再点重新检测。';
    controls();
  }
  function fitTerminal() {
    if (terminal && host.clientWidth && host.clientHeight) fit.fit();
  }
  new ResizeObserver(fitTerminal).observe(host);
  for (const tab of panel.querySelectorAll('[data-ai-mode]')) tab.onclick = () => {
    const active = tab.dataset.aiMode === 'agent';
    for (const t of panel.querySelectorAll('[data-ai-mode]')) t.setAttribute('aria-selected', String(t === tab));
    ask.hidden = active;
    agent.hidden = !active;
    if (active) { if (!running) detect(); fitTerminal(); }
  };
  agent.querySelector('[data-detect]').onclick = detect;
  start.onclick = async () => {
    if (running) return;
    if (!terminal) {
      terminal = new Terminal({fontSize:12, scrollback:1500, cursorBlink:true});
      fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.loadAddon(new WebLinksAddon((_event, url) => api.openExternal(url)));
      terminal.open(host);
      terminal.onData(data => api.agent.write(data));
      terminal.onResize(({cols,rows}) => api.agent.resize(cols,rows));
    }
    terminal.reset();
    running = true;
    controls();
    const result = await api.agent.start(select.value);
    if (!result.ok) { running = false; status.textContent = result.error; controls(); return; }
    fitTerminal();
    api.agent.resize(terminal.cols,terminal.rows);
    terminal.focus();
    status.textContent = '会话已连接';
  };
  stop.onclick = () => api.agent.stop();
  // Keep application shortcuts out of the provider's interactive terminal.
  host.addEventListener('keydown', e => e.stopPropagation());
  api.agent.onEvent(event => {
    if (event.ended) {
      running = false;
      cancelAnimationFrame(layoutFrame);
      previousBounds = undefined;
      frame.hidden = true;
      host.hidden = false;
      status.textContent = '会话已结束' + (event.exitCode ? '（' + event.exitCode + '）' : '');
      controls();
    }
    if (event.data) terminal?.write(event.data);
    if (event.webError) status.textContent = event.webError;
    if (event.web) {
      frame.hidden = false;
      host.hidden = true;
      layoutWebView();
    }
  });

  let layoutFrame, previousBounds;
  function layoutWebView() {
    if (frame.hidden) return;
    const r = frame.getBoundingClientRect();
    const container = panel.getBoundingClientRect();
    const top = Math.max(0, r.top, container.top);
    const bottom = Math.min(innerHeight, r.bottom, panel.closest('#sidebar').getBoundingClientRect().bottom);
    const visible = r.width && bottom > top && !document.querySelector('#modalLayer.open, #paletteLayer.open, .menu-open');
    const rect = visible ? {x:r.x, y:top, width:r.width, height:bottom-top} : null;
    const value = JSON.stringify(rect);
    if (value !== previousBounds) { api.agent.bounds(rect); previousBounds = value; }
    layoutFrame = requestAnimationFrame(layoutWebView);
  }
}
