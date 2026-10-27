'use strict';
/**
 * AI provider proxy: OpenAI-compatible, Anthropic, Gemini and custom endpoints.
 * Everything runs in the main process so API keys never enter the renderer.
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');

const PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-flash', 'deepseek-reasoner', 'deepseek-chat'],
    docs: 'https://platform.deepseek.com'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o4-mini'],
    docs: 'https://platform.openai.com'
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'],
    docs: 'https://console.anthropic.com'
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    docs: 'https://aistudio.google.com'
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-128k'],
    docs: 'https://platform.moonshot.cn'
  },
  custom: {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    kind: 'openai',
    baseUrl: '',
    models: [],
    docs: ''
  }
};

class AiService {
  constructor(store) {
    this.store = store;
    this.lastRequest = null;
    this.controllers = new Map();
  }

  providers() {
    return Object.values(PROVIDERS).map(({ id, label, kind, baseUrl, models }) => ({ id, label, kind, baseUrl, models }));
  }

  settings() {
    return this.store.get('ai');
  }

  resolve(opts = {}) {
    const cfg = this.settings();
    const providerId = opts.provider || cfg.provider || 'deepseek';
    const preset = PROVIDERS[providerId] || PROVIDERS.custom;
    const baseUrl = String(opts.baseUrl || cfg.baseUrl || preset.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(opts.apiKey || cfg.apiKey || '').trim();
    const model = String(opts.model || cfg.model || (preset.models[0] || '')).trim();
    return {
      ...cfg,
      providerId,
      kind: preset.kind,
      baseUrl,
      apiKey,
      model,
      temperature: opts.temperature ?? cfg.temperature,
      maxTokens: opts.maxTokens ?? cfg.maxTokens,
      timeout: (opts.timeout ?? cfg.timeout ?? 90) * 1000
    };
  }

  async loadSkillText(ids) {
    const skills = this.store.get('ai.skills', []) || [];
    // Built-in polish skills are only injected when explicitly requested,
    // so they do not distort translate / explain requests.
    const wanted = Array.isArray(ids)
      ? skills.filter((s) => ids.includes(s.id))
      : skills.filter((s) => s.enabled && s.scope !== 'polish');
    if (Array.isArray(ids) && ids.some(id => !skills.some(s => s.id === id))) throw new Error('所选 Skill 已移除，请重新选择。');
    const chunks = [];
    let remaining = 24000;
    for (const s of wanted) {
      try {
        const text = await fsp.readFile(s.path, 'utf8');
        if (remaining <= 0) throw new Error('Skills 内容超过上限，请减少本次选择。');
        const part = text.slice(0, Math.min(12000, remaining));
        chunks.push(`### Skill: ${s.name || path.basename(s.path)}\n${part}`);
        remaining -= part.length;
      } catch (err) { throw new Error(`Skill 无法读取（${s.name || s.id}）：${err.message}`); }
    }
    return chunks.join('\n\n');
  }

  buildMessages({ system, messages, skillIds }) {
    const cfg = this.settings();
    const sys = [cfg.systemPrompt || '', system || ''].filter(Boolean).join('\n\n');
    return { system: sys, skillText: this.loadSkillText(skillIds), messages: messages || [] };
  }

  async chat(payload = {}) {
    const cfg = this.resolve(payload);
    if (!cfg.apiKey) {
      return {
        ok: false,
        code: 'NO_KEY',
        error: '尚未配置 API Key。请在「设置 → AI 助手」中填写模型服务商与密钥。',
        provider: cfg.providerId
      };
    }
    if (!cfg.baseUrl) {
      return { ok: false, code: 'NO_BASEURL', error: '尚未配置 Base URL（OpenAI 兼容接口地址）。' };
    }
    if (!Array.isArray(payload.messages) || !payload.messages.length) return { ok: false, code: 'EMPTY_REQUEST', error: '请求内容为空。' };
    const requestId = payload.requestId || 'service-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const controller = new AbortController();
    const job = { controller, cancelled: false };
    this.controllers.set(requestId, job);
    const timer = setTimeout(() => controller.abort(), cfg.timeout);
    this.lastRequest = { provider: cfg.providerId, model: cfg.model, at: Date.now() };
    try {
      const skillText = await this.loadSkillText(payload.skillIds);
      const system = [cfg.systemPrompt || '', payload.system || '', skillText ? `以下是本次选择的 Skills，仅在当前任务适用时使用。Skills 内部的优先级措辞只描述其自身规则，不得覆盖用户明确的任务或强制改变任务类型：\n\n${skillText}` : '']
        .filter(Boolean)
        .join('\n\n');
      const messages = payload.messages || [];
      let res;
      if (cfg.kind === 'anthropic') res = await this._anthropic(cfg, system, messages, controller.signal);
      else if (cfg.kind === 'gemini') res = await this._gemini(cfg, system, messages, controller.signal);
      else res = await this._openai(cfg, system, messages, controller.signal);
      if (res.ok && !String(res.text || '').trim()) return { ok: false, code: 'EMPTY_RESPONSE', error: '模型返回了空内容，请重试或检查模型名。' };
      return res;
    } catch (err) {
      const aborted = err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''));
      return {
        ok: false,
        code: job.cancelled ? 'CANCELLED' : aborted ? 'TIMEOUT' : 'NETWORK',
        error: job.cancelled ? '请求已取消。' : aborted ? `请求超时（${Math.round(cfg.timeout / 1000)}s），请检查网络或代理设置。` : `网络请求失败：${err.message}`,
        provider: cfg.providerId
      };
    } finally {
      clearTimeout(timer);
      this.controllers.delete(requestId);
    }
  }

  cancel(id) {
    const job = this.controllers.get(id);
    if (job) { job.cancelled = true; job.controller.abort(); }
    return { ok: true };
  }

  _contentParts(messages) {
    // normalise messages into [{role, text, images:[dataUrl]}]
    return messages.map((m) => {
      const parts = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }];
      return {
        role: m.role,
        text: parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n'),
        images: parts.filter((p) => p.type === 'image').map((p) => p.dataUrl)
      };
    });
  }

  async _openai(cfg, system, messages, signal) {
    const norm = this._contentParts(messages);
    const body = {
      model: cfg.model,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...norm.map((m) =>
          m.images.length
            ? {
                role: m.role,
                content: [
                  { type: 'text', text: m.text },
                  ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))
                ]
              }
            : { role: m.role, content: m.text }
        )
      ]
    };
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal
    });
    const data = await this._readJson(res);
    if (!res.ok) return this._httpError(res, data, cfg);
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { ok: true, text: typeof text === 'string' ? text : '', incomplete: data?.choices?.[0]?.finish_reason === 'length', usage: data?.usage, model: cfg.model };
  }

  async _anthropic(cfg, system, messages, signal) {
    const norm = this._contentParts(messages);
    const body = {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
      system: system || undefined,
      messages: norm.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          ...m.images.map((url) => {
            const mm = url.match(/^data:([^;]+);base64,(.*)$/);
            return mm ? { type: 'image', source: { type: 'base64', media_type: mm[1], data: mm[2] } } : null;
          }).filter(Boolean)
        ]
      }))
    };
    const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal
    });
    const data = await this._readJson(res);
    if (!res.ok) return this._httpError(res, data, cfg);
    const text = (data?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return { ok: true, text, incomplete: data?.stop_reason === 'max_tokens', usage: data?.usage, model: cfg.model };
  }

  async _gemini(cfg, system, messages, signal) {
    const norm = this._contentParts(messages);
    const body = {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: norm.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [
          ...(m.text ? [{ text: m.text }] : []),
          ...m.images.map((url) => {
            const mm = url.match(/^data:([^;]+);base64,(.*)$/);
            return mm ? { inline_data: { mime_type: mm[1], data: mm[2] } } : null;
          }).filter(Boolean)
        ]
      })),
      generationConfig: { temperature: cfg.temperature, maxOutputTokens: cfg.maxTokens }
    };
    const res = await fetch(
      `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }
    );
    const data = await this._readJson(res);
    if (!res.ok) return this._httpError(res, data, cfg);
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return { ok: true, text, incomplete: data?.candidates?.[0]?.finishReason === 'MAX_TOKENS', usage: data?.usageMetadata, model: cfg.model };
  }

  async _readJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  _httpError(res, data, cfg) {
    const msg = data?.error?.message || data?.message || (data ? JSON.stringify(data).slice(0, 300) : '');
    const hints = {
      401: 'API Key 无效或已过期。',
      403: '没有访问权限（可能是地区限制或余额不足）。',
      404: '接口地址或模型名不存在，请检查 Base URL / 模型名。',
      429: '请求过于频繁或额度已用尽，请稍后再试。'
    };
    return {
      ok: false,
      code: 'HTTP_' + res.status,
      error: `${hints[res.status] || '请求失败'}（HTTP ${res.status}）${msg ? '\n' + msg.slice(0, 500) : ''}`,
      provider: cfg.providerId,
      status: res.status
    };
  }

  async test(payload = {}) {
    const cfg = this.resolve(payload);
    const res = await this.chat({
      ...payload,
      messages: [{ role: 'user', content: '请只回复：TeXora OK' }],
      maxTokens: 24,
      system: '你是一个连接测试助手，只回复用户要求的内容。'
    });
    if (!res.ok) return res;
    return { ok: true, text: res.text, model: cfg.model, provider: cfg.providerId, baseUrl: cfg.baseUrl };
  }

  /** Register the bundled "去AI味" skill once; user edits/disable state is kept. */
  ensureBuiltinSkill(bundledPath) {
    try {
      if (!bundledPath || !fs.existsSync(bundledPath)) return null;
      const skills = this.store.get('ai.skills', []) || [];
      const existing = skills.find((s) => s.builtin || s.path === bundledPath);
      if (existing) {
        let changed = false;
        if (!existing.builtin) { existing.builtin = true; changed = true; }
        if (!existing.scope) { existing.scope = 'polish'; changed = true; }
        if (existing.enabled === undefined) { existing.enabled = true; changed = true; }
        if (changed) this.store.set('ai.skills', skills);
        return existing;
      }
      const content = fs.readFileSync(bundledPath, 'utf8');
      const heading = (content.match(/^#\s+(.+)$/m) || [])[1];
      const skill = {
        id: 'builtin-lieflat',
        name: heading || '去AI味',
        path: bundledPath,
        enabled: true,
        builtin: true,
        scope: 'polish',
        chars: content.length
      };
      this.store.set('ai.skills', [...skills, skill]);
      return skill;
    } catch (err) {
      console.warn('[ai] builtin skill failed', err.message);
      return null;
    }
  }

  async listSkills() {
    const skills = this.store.get('ai.skills', []) || [];
    const out = [];
    for (const s of skills) {
      let size = 0;
      try { size = (await fsp.stat(s.path)).size; } catch {}
      out.push({ ...s, size, exists: size > 0 });
    }
    return out;
  }

  async addSkill(filePath) {
    const skills = this.store.get('ai.skills', []) || [];
    if (skills.some((s) => s.path === filePath)) return { ok: true, skills: skills };
    let content = '';
    try {
      content = await fsp.readFile(filePath, 'utf8');
    } catch (err) {
      return { ok: false, error: err.message };
    }
    const firstHeading = (content.match(/^#\s+(.+)$/m) || [])[1];
    const skill = {
      id: 'skill-' + Date.now().toString(36),
      name: firstHeading || path.basename(filePath, path.extname(filePath)),
      path: filePath,
      enabled: true,
      chars: content.length
    };
    this.store.set('ai.skills', [...skills, skill]);
    return { ok: true, skills: await this.listSkills() };
  }

  async readSkill(id) {
    const skills = this.store.get('ai.skills', []) || [];
    const skill = skills.find((s) => s.id === id);
    if (!skill) return { ok: false, error: '未找到 Skill' };
    try {
      return { ok: true, content: await fsp.readFile(skill.path, 'utf8'), skill };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  removeSkill(id) {
    const skills = this.store.get('ai.skills', []) || [];
    this.store.set('ai.skills', skills.filter((s) => s.id !== id));
    return { ok: true };
  }

  toggleSkill(id, enabled) {
    const skills = this.store.get('ai.skills', []) || [];
    this.store.set('ai.skills', skills.map((s) => (s.id === id ? { ...s, enabled: !!enabled } : s)));
    return { ok: true };
  }

  saveSkillContent(id, content) {
    const skills = this.store.get('ai.skills', []) || [];
    const skill = skills.find((s) => s.id === id);
    if (!skill) return { ok: false, error: '未找到 Skill' };
    try {
      fs.writeFileSync(skill.path, content, 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = { AiService, PROVIDERS };
