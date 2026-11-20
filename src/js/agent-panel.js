import { bindAgentModel, renderAgentModels } from './agent-model-picker.js';
import { ctx } from './ctx.js';
import { icon } from './util.js';
import { renderMarkdown } from './markdown.js';

export function setupAgentPanel(panel, api) {
  const ask = panel.querySelector('.ai-panel');
  const agent = panel.querySelector('.agent-panel');
  const tool = (action,label,glyph) => `<button type="button" class="icon-btn sm" data-${action} title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  agent.innerHTML = `
    <header class="agent-head"><select aria-label="Agent 服务商"></select><div class="agent-head-actions">${tool('history','最近对话','history')}${tool('new','新对话','plus')}${tool('detect','重新检测账号和工具','refresh')}${tool('settings','Agent 模式 AI 设置','sliders')}</div></header>
    <div class="agent-scroll"><div class="agent-recent"></div><div class="agent-messages" role="log" aria-live="polite"></div></div>
    <div class="agent-account"><span role="status"></span><div class="agent-account-actions"><button type="button" class="btn btn-sm" data-login hidden></button><button type="button" class="btn btn-sm" data-browser hidden>打开登录页面</button><button type="button" class="btn btn-sm" data-copy hidden>复制链接</button><button type="button" class="btn btn-sm" data-stop hidden>结束</button></div></div>
    <form class="agent-code" hidden><input class="input input-sm" type="password" autocomplete="off" aria-label="授权码" placeholder="浏览器如有提供，请粘贴授权码"><button type="submit" class="btn btn-sm">确认</button></form>
    <form class="agent-compose"><textarea aria-label="消息" placeholder="给 Agent 发消息…" rows="2"></textarea>
      <footer>
        <div class="agent-compose-meta"><span class="agent-project">${icon('folder')}<span></span></span><span class="agent-account-badge" data-account hidden></span></div>
        <div class="agent-compose-actions"><select class="agent-model input" aria-label="选择模型"></select><button type="submit" class="agent-submit" title="发送消息" aria-label="发送消息">${icon('arrow-up')}</button></div>
      </footer></form>`;
  const find = q => agent.querySelector(q);
  const select = find('.agent-head select'), status = find('[role=status]');
  const model = find('.agent-model');
  const modelChoices = new Map();
  const catalogs = new Map();
  const input = find('textarea'), form = find('.agent-compose'), scroll = find('.agent-scroll');
  const historyBox = find('.agent-recent'), messages = find('.agent-messages');
  const login = find('[data-login]'), browser = find('[data-browser]'), stop = find('[data-stop]');
  let providers = [], history = [], current = null, auth = false, busy = '', loginUrl = '', generation = 0;
  let projectRoot = '';
  let showingHistory = true, expand = false;
  function controls() {
    const antigravity = select.value === 'agy';
    const installed = providers.some(p => p.id === select.value && p.installed);
    model.disabled = !!busy || !installed;
    select.disabled = !!busy;
    find('[data-detect]').disabled = !!busy;
    for (const key of ['new','history']) find('[data-'+key+']').disabled = !!busy;
    login.hidden = !!busy || (antigravity ? auth : !installed || auth);
    login.textContent = antigravity ? (installed ? 'Antigravity 登录说明' : '安装 Antigravity') : '登录 ' + (select.selectedOptions[0]?.textContent || '');
    browser.hidden = !loginUrl || busy !== 'login';
    find('[data-copy]').hidden = browser.hidden;
    if (busy !== 'login') find('.agent-code').hidden = true;
    stop.hidden = !busy;
    stop.textContent = busy === 'message' ? '停止生成' : '取消登录';
    input.disabled = !auth || !projectRoot;
    form.querySelector('[type=submit]').disabled = input.disabled || !!busy || !input.value.trim();
    const accountBadge = find('[data-account]');
    accountBadge.textContent = auth ? '已登录 · '+select.selectedOptions[0]?.textContent : '';
    accountBadge.title = accountBadge.textContent;
    accountBadge.hidden = !auth;
  }
  function syncModel() {
    const preferred = ctx.state.settings.agent?.models?.[select.value] || '';
    renderAgentModels(model,catalogs.get(select.value),modelChoices.get(select.value) ?? preferred);
  }
  bindAgentModel(model,value=>modelChoices.set(select.value,value));
  model.onkeydown = event => event.stopPropagation();
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
  async function refresh(forceModels = false) {
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
    if (provider?.installed) {
      void api.agent.models(provider.id,forceModels === true).then(catalog=>{
        if (ticket !== generation || select.value !== provider.id) return;
        catalogs.set(provider.id,catalog);
        syncModel();
      });
    }
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
    auth = !!account.authenticated;
    history = Array.isArray(records) ? records : [];
    status.textContent = !provider?.installed ? '未检测到本机 '+(provider?.label || '工具')+'，安装后点击重新检测。' :
      account.error || (auth ? '' : provider.id === 'agy' ? '请在终端运行 agy 登录 Google，完成后点右上的刷新。' : '使用现有账号登录，完成后回到这里。');
    controls(); showChat();
  }
  function reset() { current=null; showingHistory=true; expand=false; input.value=''; loginUrl=''; }
  select.onchange = () => { reset(); syncModel(); refresh(); };
  find('[data-detect]').onclick = () => refresh(true);
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
    status.textContent = kind === 'login' ? '请在浏览器中完成登录…' : '正在处理…';
    const result = await api.agent.start(select.value,kind,{chatId,text,model:model.value.trim()});
    if (!result?.ok) {
      busy=''; status.textContent=result?.error || '操作失败';
      if (kind==='message') { current=previous; input.value=text; showChat(); }
      controls();
    } else if (kind==='message' && current) current.id=result.chatId;
  }
  login.onclick = () => {
    if (select.value === 'agy') return api.openExternal('https://antigravity.google/docs/cli/getting-started');
    return start('login');
  };
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
    ++generation; reset(); catalogs.clear();
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
    if (!e.ended) return;
    busy=''; loginUrl=''; status.textContent=e.error || '';
    controls();
    if (e.kind==='login') { await refresh(true); if(e.error) status.textContent=e.error; }
    if (e.kind==='message') {
      const ticket = generation;
      const records=await api.agent.history(select.value);
      if (ticket!==generation || !Array.isArray(records)) return;
      history=records; current=history.find(c=>c.id===e.chatId) || current; showChat();
    }
  });
}
