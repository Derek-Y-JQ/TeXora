import { icon } from './util.js';
import { renderMarkdown } from './markdown.js';

export function setupAgentPanel(panel, api) {
  const ask = panel.querySelector('.ai-panel');
  const agent = panel.querySelector('.agent-panel');
  const tool = (action,label,glyph) => `<button type="button" class="icon-btn" data-${action} title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  agent.innerHTML = `
    <header class="agent-head"><select aria-label="Agent 服务商"></select><span class="spacer"></span>
      ${tool('history','最近对话','history')}${tool('new','新对话','plus')}${tool('detect','重新检测账号和工具','refresh')}</header>
    <div class="agent-scroll"><div class="agent-recent"></div><div class="agent-messages" role="log" aria-live="polite"></div></div>
    <div class="agent-web" hidden></div>
    <div class="agent-account"><span role="status"></span><button class="btn btn-sm" data-login hidden></button>
      <button class="btn btn-sm" data-browser hidden>打开登录页面</button>
      <button class="btn btn-sm" data-stop hidden>结束</button></div>
    <form class="agent-code" hidden><input type="password" autocomplete="off" aria-label="授权码" placeholder="浏览器如有提供，请粘贴授权码"><button class="btn btn-sm">确认</button></form>
    <form class="agent-compose"><textarea aria-label="消息" placeholder="给 Agent 发消息…" rows="2"></textarea>
      <footer><span data-account></span><button type="submit" class="agent-submit" title="发送消息" aria-label="发送消息">${icon('arrow-up')}</button></footer></form>`;
  const find = q => agent.querySelector(q);
  const select = find('select'), frame = find('.agent-web'), status = find('[role=status]');
  const input = find('textarea'), form = find('.agent-compose'), scroll = find('.agent-scroll');
  const historyBox = find('.agent-recent'), messages = find('.agent-messages');
  const login = find('[data-login]'), browser = find('[data-browser]'), stop = find('[data-stop]');
  let providers = [], history = [], current = null, auth = false, busy = '', loginUrl = '', generation = 0;
  let showingHistory = true, expand = false;
  function controls() {
    const dsh = select.value === 'dsh';
    const installed = providers.some(p => p.id === select.value && p.installed);
    select.disabled = !!busy;
    find('[data-detect]').disabled = !!busy;
    for (const key of ['new','history']) find('[data-'+key+']').disabled = !!busy || dsh;
    login.hidden = !installed || !!busy || (!dsh && auth);
    login.textContent = dsh ? '打开 DeepSeek' : '登录 ' + (select.selectedOptions[0]?.textContent || '');
    browser.hidden = !loginUrl || busy !== 'login';
    if (busy !== 'login') find('.agent-code').hidden = true;
    stop.hidden = !busy;
    stop.textContent = busy === 'message' ? '停止生成' : busy === 'login' ? '取消登录' : '结束';
    form.hidden = dsh;
    input.disabled = !auth;
    form.querySelector('button').disabled = !auth || !!busy || !input.value.trim();
    find('[data-account]').textContent = auth ? '已登录 · '+select.selectedOptions[0]?.textContent : '';
  }
  function showChat() {
    historyBox.replaceChildren();
    messages.replaceChildren();
    if (showingHistory && select.value !== 'dsh') {
      const title = document.createElement('h3');
      title.textContent = '最近对话';
      historyBox.append(title);
      if (!history.length) {
        const empty = document.createElement('p');
        empty.textContent = '这个项目还没有对话'; historyBox.append(empty);
      }
      for (const chat of (expand ? history : history.slice(0,3))) {
        const row = document.createElement('button');
        const text = document.createElement('span'), date = document.createElement('time');
        text.textContent = chat.title;
        date.textContent = new Date(chat.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'});
        row.append(text,date);
        row.onclick = () => { current = chat; showingHistory = false; status.textContent = ''; showChat(); };
        historyBox.append(row);
      }
      if (!expand && history.length>3) {
        const more = document.createElement('button'); more.textContent = '查看全部（'+history.length+'）';
        more.onclick = () => { expand = true; showChat(); }; historyBox.append(more);
      }
    }
    for (const item of showingHistory ? [] : current?.messages || []) {
      const el = document.createElement('div');
      el.className = 'agent-msg agent-'+item.role;
      if (item.role === 'assistant') { el.classList.add('markdown-body'); el.innerHTML = renderMarkdown(item.text); }
      else el.textContent = item.text;
      messages.append(el);
    }
    if (!showingHistory) scroll.scrollTop = scroll.scrollHeight;
  }
  async function refresh() {
    const ticket = ++generation;
    const id = select.value;
    const list = await api.agent.list();
    if (ticket !== generation || busy) return;
    providers = Array.isArray(list) ? list : [];
    select.replaceChildren(...providers.map(p => new Option(p.label,p.id)));
    select.value = providers.some(p=>p.id===id) ? id : (providers.find(p=>p.installed) || providers[0])?.id || '';
    const provider = providers.find(p=>p.id===select.value);
    auth = false; status.textContent = '正在检测…'; controls();
    const [account, records] = await Promise.all([
      provider?.installed ? api.agent.status(provider.id) : {},
      api.agent.history(select.value)
    ]);
    if (ticket !== generation || busy) return;
    auth = !!account.authenticated;
    history = Array.isArray(records) ? records : [];
    status.textContent = !provider?.installed ? '未检测到本机 '+(provider?.label || '工具')+'，安装后点击重新检测。' :
      account.error || (account.web ? '使用 DeepSeek Harness 的账号与工作区。' : auth ? '' : '使用现有账号登录，完成后回到这里。');
    controls(); showChat();
  }
  function reset() { current=null; showingHistory=true; expand=false; input.value=''; loginUrl=''; }
  select.onchange = () => { reset(); refresh(); };
  find('[data-detect]').onclick = refresh;
  find('[data-new]').onclick = () => { reset(); showingHistory=false; status.textContent=''; showChat(); controls(); input.focus(); };
  find('[data-history]').onclick = () => { showingHistory=true; expand=true; showChat(); };
  async function start(kind,text) {
    if (busy) return;
    const previous = current;
    const chatId = showingHistory ? null : current?.id;
    if (kind === 'message') {
      current = {id:chatId,messages:[...(chatId ? current.messages : []),{role:'user',text}]};
      showingHistory=false; input.value=''; showChat();
    }
    busy=kind; loginUrl=''; controls();
    status.textContent = kind === 'login' ? '请在浏览器中完成登录…' : kind === 'message' ? '正在处理…' : '正在打开 DeepSeek…';
    const result = await api.agent.start(select.value,kind,{chatId,text});
    if (!result?.ok) {
      busy=''; status.textContent=result?.error || '操作失败';
      if (kind==='message') { current=previous; input.value=text; showChat(); }
      controls();
    } else if (kind==='message' && current) current.id=result.chatId;
  }
  login.onclick = () => start(select.value==='dsh' ? 'web' : 'login');
  find('.agent-code').onsubmit = async event => {
    event.preventDefault();
    const field = find('.agent-code input');
    const result = await api.agent.loginCode(field.value);
    field.value = '';
    if (result.error) status.textContent=result.error;
  };
  browser.onclick = () => api.openExternal(loginUrl);
  stop.onclick = () => api.agent.stop();
  input.oninput = controls;
  input.onkeydown = e => {
    if (e.key==='Enter' && !e.shiftKey && !e.isComposing && e.keyCode!==229) { e.preventDefault(); form.requestSubmit(); }
    e.stopPropagation();
  };
  form.onsubmit = e => { e.preventDefault(); if (auth && input.value.trim()) start('message',input.value.trim()); };
  api.project.onChange(() => { ++generation; reset(); if (!agent.hidden) refresh(); });
  for (const tab of panel.querySelectorAll('[data-ai-mode]')) tab.onclick = () => {
    const active=tab.dataset.aiMode==='agent';
    for (const t of panel.querySelectorAll('[data-ai-mode]')) t.setAttribute('aria-selected',String(t===tab));
    ask.hidden=active; agent.hidden=!active;
    if (active && !busy) refresh();
  };
  api.agent.onEvent(async e => {
    if (e.provider && e.provider!==select.value) return;
    if (e.codePrompt) find('.agent-code').hidden = false;
    if (e.loginUrl) { loginUrl=e.loginUrl; controls(); }
    if (e.message && current) { current.messages.push({role:'assistant',text:e.message}); showChat(); }
    if (e.activity) status.textContent = '正在使用工具 · '+e.activity;
    if (e.webError) status.textContent=e.webError;
    if (e.web) { frame.hidden=false; scroll.hidden=true; status.textContent=''; layoutWebView(); }
    if (!e.ended) return;
    busy=''; loginUrl=''; status.textContent=e.error || '';
    cancelAnimationFrame(layoutFrame); previousBounds=undefined; frame.hidden=true; scroll.hidden=false;
    controls();
    if (e.kind==='login') { await refresh(); if(e.error) status.textContent=e.error; }
    if (e.kind==='message') {
      const ticket = generation;
      const records=await api.agent.history(select.value);
      if (ticket!==generation || !Array.isArray(records)) return;
      history=records; current=history.find(c=>c.id===e.chatId) || current; showChat();
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
