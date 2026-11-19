import { ctx } from './ctx.js';
import { icon } from './util.js';
import { renderMarkdown } from './markdown.js';

export function setupAgentPanel(panel, api) {
  const ask = panel.querySelector('.ai-panel');
  const agent = panel.querySelector('.agent-panel');
  const tool = (action,label,glyph) => `<button type="button" class="icon-btn" data-${action} title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  agent.innerHTML = `
    <header class="agent-head"><select aria-label="Agent 服务商"></select><span class="spacer"></span>
      ${tool('history','最近对话','history')}${tool('new','新对话','plus')}${tool('detect','重新检测账号和工具','refresh')}${tool('settings','Agent 模式 AI 设置','sliders')}</header>
    <div class="agent-scroll"><div class="agent-recent"></div><div class="agent-messages" role="log" aria-live="polite"></div></div>
    <div class="agent-web" hidden></div>
    <div class="agent-account"><span role="status"></span><button class="btn btn-sm" data-login hidden></button>
      <button class="btn btn-sm" data-browser hidden>打开登录页面</button><button class="btn btn-sm" data-copy hidden>复制链接</button>
      <button class="btn btn-sm" data-stop hidden>结束</button></div>
    <form class="agent-code" hidden><input type="password" autocomplete="off" aria-label="授权码" placeholder="浏览器如有提供，请粘贴授权码"><button class="btn btn-sm">确认</button></form>
    <form class="agent-compose"><textarea aria-label="消息" placeholder="给 Agent 发消息…" rows="2"></textarea>
      <footer><span class="agent-project">${icon('folder')}<span></span></span><span data-account></span><input class="agent-model input" list="agent-models" aria-label="选择模型" title="选择模型或输入模型 ID" maxlength="120" placeholder="工具默认模型" autocomplete="off"><datalist id="agent-models"></datalist><button type="submit" class="agent-submit" title="发送消息" aria-label="发送消息">${icon('arrow-up')}</button></footer></form>`;
  const find = q => agent.querySelector(q);
  const select = find('select'), frame = find('.agent-web'), status = find('[role=status]');
  const model = find('.agent-model');
  const modelChoices = new Map();
  const input = find('textarea'), form = find('.agent-compose'), scroll = find('.agent-scroll');
  const historyBox = find('.agent-recent'), messages = find('.agent-messages');
  const login = find('[data-login]'), browser = find('[data-browser]'), stop = find('[data-stop]');
  let providers = [], history = [], current = null, auth = false, busy = '', loginUrl = '', generation = 0;
  let projectRoot = '';
  let showingHistory = true, expand = false;
  function controls() {
    const dsh = select.value === 'dsh';
    const installed = providers.some(p => p.id === select.value && p.installed);
    model.disabled = !!busy || !installed;
    select.disabled = !!busy;
    find('[data-detect]').disabled = !!busy;
    for (const key of ['new','history']) find('[data-'+key+']').disabled = !!busy;
    login.hidden = !installed || !!busy || (!dsh && auth);
    login.textContent = dsh ? '配置 DeepSeek 账号' : '登录 ' + (select.selectedOptions[0]?.textContent || '');
    browser.hidden = !loginUrl || busy !== 'login';
    find('[data-copy]').hidden = browser.hidden;
    if (busy !== 'login') find('.agent-code').hidden = true;
    stop.hidden = !busy;
    stop.textContent = busy === 'message' ? '停止生成' : busy === 'login' ? '取消登录' : '返回聊天';
    form.hidden = busy === 'web';
    input.disabled = !auth || !projectRoot;
    form.querySelector('[type=submit]').disabled = input.disabled || !!busy || !input.value.trim();
    find('[data-account]').textContent = dsh ? '' : auth ? '已登录 · '+select.selectedOptions[0]?.textContent : '';
  }
  function syncModel() {
    const provider = providers.find(p => p.id === select.value);
    const preferred = ctx.state.settings.agent?.models?.[select.value] || '';
    model.value = modelChoices.get(select.value) ?? preferred;
    const choices = [...new Set([preferred,...(provider?.models || [])].filter(Boolean))];
    find('#agent-models').replaceChildren(...choices.map(id=>new Option(id,id)));
  }
  model.onchange = () => modelChoices.set(select.value,model.value.trim());
  model.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); event.stopPropagation(); };
  find('[data-settings]').onclick = () => ctx.settingsUI.open('agent');
  ctx.on('settings:changed', syncModel);

  function showChat() {
    historyBox.replaceChildren();
    messages.replaceChildren();
    if (showingHistory) {
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
    const transcript = showingHistory ? [] : current?.messages || [];
    for (const [index,item] of transcript.entries()) {
      const el = document.createElement('div');
      el.className = 'agent-msg agent-'+item.role;
      if (item.role === 'assistant') {
        el.classList.add('markdown-body');
        el.innerHTML = renderMarkdown(item.text);
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'btn btn-sm';
        copy.innerHTML = icon('copy') + '复制回答';
        copy.onclick = async () => {
          const result = await api.clipboard.writeText(item.text);
          copy.textContent = result.ok ? '已复制' : '复制失败';
        };
        if (!item.pending) el.append(copy);
      } else if (item.role === 'changes') {
        el.classList.add('agent-changes');
        const title = document.createElement('strong');
        title.textContent = '本轮项目文件变化';
        el.append(title);
        const labels = {added:'新增',deleted:'删除',modified:'修改'};
        for (const change of item.changes) {
          const diff = document.createElement('button');
          diff.type = 'button';
          diff.className = 'btn btn-sm';
          diff.textContent = `${labels[change.kind]} · ${change.file}`;
          diff.onclick = () => ctx.dialogs.showDiff({title:change.file,subtitle:'本轮磁盘内容对比',left:change.left,right:change.right});
          el.append(diff);
        }
        if (item.limited) {
          const note = document.createElement('small');
          note.textContent = '部分文件超出预览范围。';
          el.append(note);
        }
      } else el.textContent = item.text;
      messages.append(el);
      const historical = item.role === 'assistant' && !item.pending && !transcript.slice(index+1,index+3).some(entry=>entry.role === 'status');
      if (item.completedAt || historical) {
        const time = document.createElement('time');
        const date = item.completedAt ? new Date(item.completedAt) : null;
        time.className = 'agent-turn-end';
        time.textContent = '回答结束';
        if (date && Number.isFinite(date.getTime())) {
          time.dateTime = date.toISOString();
          time.title = date.toLocaleString();
          time.textContent += ' · ' + date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
        }
        messages.append(time);
      }
    }
    if (!showingHistory) scroll.scrollTop = scroll.scrollHeight;
  }
  async function refresh() {
    const ticket = ++generation;
    const id = select.value || ctx.state.settings.agent?.provider;
    const list = await api.agent.list();
    if (ticket !== generation || busy) return;
    providers = Array.isArray(list) ? list : [];
    select.replaceChildren(...providers.map(p => new Option(p.label,p.id)));
    select.value = providers.some(p=>p.id===id) ? id : (providers.find(p=>p.installed) || providers[0])?.id || '';
    const provider = providers.find(p=>p.id===select.value);
    syncModel();
    auth = false; status.textContent = '正在检测…'; controls();
    const [account, records, project] = await Promise.all([
      provider?.installed ? api.agent.status(provider.id) : {},
      api.agent.history(select.value), api.project.info()
    ]);
    if (ticket !== generation || busy) return;
    projectRoot = project?.root || '';
    const folder = find('.agent-project');
    folder.title = projectRoot || '尚未打开项目';
    folder.querySelector('span').textContent = projectRoot.split(/[\\/]/).filter(Boolean).pop() || folder.title;
    folder.setAttribute('aria-label', projectRoot ? '当前项目 · '+projectRoot : folder.title);
    auth = !!(account.authenticated || account.local);
    history = Array.isArray(records) ? records : [];
    status.textContent = !provider?.installed ? '未检测到本机 '+(provider?.label || '工具')+'，安装后点击重新检测。' :
      account.error || (account.local ? '使用本机 Harness 配置。首次使用可配置账号，完成后点「返回聊天」。' : auth ? '' : '使用现有账号登录，完成后回到这里。');
    controls(); showChat();
  }
  function reset() { current=null; showingHistory=true; expand=false; input.value=''; loginUrl=''; }
  select.onchange = () => { reset(); syncModel(); refresh(); };
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
    const result = await api.agent.start(select.value,kind,{chatId,text,model:model.value.trim()});
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
  browser.onclick = async () => {
    const result=await api.openExternal(loginUrl);
    if (!result.ok) status.textContent='系统未能打开浏览器，请复制链接到浏览器继续。';
  };
  find('[data-copy]').onclick = async () => {
    const result = await api.clipboard.writeText(loginUrl);
    if (!result.ok) status.textContent += ' 复制链接失败，请重试。';
  };
  stop.onclick = () => api.agent.stop();
  input.oninput = controls;
  input.onkeydown = e => {
    if (e.key==='Enter' && !e.shiftKey && !e.isComposing && e.keyCode!==229) { e.preventDefault(); form.requestSubmit(); }
    e.stopPropagation();
  };
  form.onsubmit = e => { e.preventDefault(); if (auth && projectRoot && input.value.trim()) start('message',input.value.trim()); };
  api.project.onChange(event => {
    ++generation; reset();
    projectRoot = event.root || '';
    showChat();
    controls();
    if (!agent.hidden && !busy) refresh();
  });
  for (const tab of panel.querySelectorAll('[data-ai-mode]')) tab.onclick = () => {
    const active=tab.dataset.aiMode==='agent';
    for (const t of panel.querySelectorAll('[data-ai-mode]')) t.setAttribute('aria-selected',String(t===tab));
    ask.hidden=active; agent.hidden=!active;
    if (active && !busy) refresh();
  };
  api.agent.onEvent(async e => {
    if (e.provider && e.provider!==select.value) return;
    if (e.projectRoot && e.projectRoot !== projectRoot) {
      if (e.ended) {
        busy = ''; loginUrl = ''; controls();
        if (!agent.hidden) refresh();
      }
      return;
    }
    if (e.codePrompt) find('.agent-code').hidden = false;
    if (e.loginUrl) {
      loginUrl=e.loginUrl; controls();
      if (e.deviceCode) status.textContent='请在浏览器中输入设备码：'+e.deviceCode;
    }
    if (e.browserError) status.textContent+=' '+e.browserError;
    if (e.message && current) { current.messages.push({role:'assistant',text:e.message,pending:true}); showChat(); }
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
