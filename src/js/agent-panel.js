import { Terminal } from '@xterm/xterm';
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
  const frame = agent.querySelector('iframe');
  let terminal, fit, running = false, output = '';
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
      terminal.open(host);
      terminal.onData(data => api.agent.write(data));
      terminal.onResize(({cols,rows}) => api.agent.resize(cols,rows));
    }
    terminal.reset();
    output = '';
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
      frame.removeAttribute('src');
      frame.hidden = true;
      host.hidden = false;
      status.textContent = '会话已结束' + (event.exitCode ? '（' + event.exitCode + '）' : '');
      controls();
    }
    if (!event.data) return;
    terminal?.write(event.data);
    if (select.value === 'dsh' && frame.hidden) {
      output = (output + event.data).slice(-8192);
      const url = output.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/[^\s\x1b]*)?(?=[\s\x1b])/);
      if (url) { frame.src = url[0]; frame.hidden = false; host.hidden = true; }
    }
  });
}
