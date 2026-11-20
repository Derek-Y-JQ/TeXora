import { ctx } from './ctx.js';

const custom = ':custom';

export function renderAgentModels(select, catalog, value) {
  const entries = catalog?.models || [];
  const defaultModel = entries.find(model => model.isDefault);
  const defaultLabel = defaultModel ? `工具默认 · ${defaultModel.label}` : '使用工具默认模型';
  const options = [new Option(defaultLabel,'')];
  for (const model of entries) options.push(new Option(model.label,model.id));
  if (value && !entries.some(model=>model.id===value)) options.push(new Option(value,value));
  options.push(new Option('手动输入模型 ID…',custom));
  select.replaceChildren(...options);
  select.value = value;
  select.title = catalog?.error || (catalog?.source === 'suggested' ? '本机工具的常用模型别名' : '选择模型');
}

export function bindAgentModel(select, onChange) {
  select.addEventListener('focus', () => { select.dataset.previous = select.value; });
  select.addEventListener('change', async () => {
    if (select.value !== custom) {
      select.dataset.previous = select.value;
      onChange(select.value);
      return;
    }
    const previous = select.dataset.previous || '';
    select.value = previous;
    const model = await ctx.dialogs.prompt({title:'输入模型 ID',label:'模型 ID',value:previous,confirmText:'使用模型'});
    if (typeof model !== 'string' || !select.isConnected) return;
    const id = model.trim();
    if (!/^[a-z0-9][a-z0-9._:/\[\]-]{0,119}$/i.test(id)) return;
    if (![...select.options].some(option=>option.value===id)) select.add(new Option(id,id),select.length-1);
    select.value = id;
    select.dataset.previous = id;
    onChange(id);
  });
}
