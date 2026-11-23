'use strict';
/** GitHub Releases update checker (no auto-install, web-first to avoid API rate limits). */
const https = require('node:https');
const path = require('node:path');

function getElectronNet() {
  try {
    const electron = require('electron');
    if (electron && electron.net && typeof electron.net.fetch === 'function') {
      return electron.net;
    }
  } catch {
    // Running outside Electron (e.g. unit tests)
  }
  return null;
}

function nodeRequest(url, { method = 'GET', headers = {}, timeout = 10000, followRedirects = true } = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: { 'User-Agent': 'TeXora-Updater', ...headers },
      timeout
    }, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location || '';
      if (followRedirects && status >= 300 && status < 400 && location && redirects < 4) {
        res.resume();
        const nextUrl = new URL(location, url).toString();
        resolve(nodeRequest(nextUrl, { method, headers, timeout, followRedirects }, redirects + 1));
        return;
      }
      if (method === 'HEAD') {
        res.resume();
        resolve({ status, url, location: location ? new URL(location, url).toString() : '', body: '' });
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        resolve({ status, url, location: location ? new URL(location, url).toString() : '', body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('检查更新超时')));
    req.on('error', reject);
    req.end();
  });
}

async function defaultFetcher(url, { method = 'GET', headers = {}, timeout = 10000, followRedirects = true } = {}) {
  const net = getElectronNet();
  if (net) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('检查更新超时')), timeout);
    try {
      const res = await net.fetch(url, {
        method,
        headers: { 'User-Agent': 'TeXora-Updater', ...headers },
        redirect: followRedirects ? 'follow' : 'manual',
        signal: controller.signal
      });
      const rawLocation = res.headers.get('location') || '';
      const location = rawLocation ? new URL(rawLocation, url).toString() : '';
      const body = method === 'HEAD' ? '' : await res.text();
      return { status: res.status, url: res.url || url, location, body };
    } catch (err) {
      if (err?.name === 'AbortError' || /超时/.test(String(err?.message || ''))) {
        throw new Error('检查更新超时');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  return nodeRequest(url, { method, headers, timeout, followRedirects });
}

function parseVersion(value) {
  return String(value || '').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function parseTagFromReleaseUrl(url) {
  const m = String(url || '').match(/\/releases\/tag\/([^/?#]+)/i);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

function htmlToPlainNotes(html) {
  const decoded = decodeHtmlEntities(html);
  return decoded
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseAssetsFromHtml(html, repo) {
  const assets = [];
  const seen = new Set();
  const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`href="(?:https://github\\.com)?(/${escapedRepo}/releases/download/[^"]+)"`, 'gi');
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const rel = m[1];
    const fullUrl = 'https://github.com' + rel;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    let name = path.posix.basename(rel.split('?')[0]);
    try { name = decodeURIComponent(name); } catch {}
    assets.push({ name, url: fullUrl, size: 0 });
  }
  return assets;
}

function parseAtomEntry(xml, tag) {
  const entries = String(xml || '').match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  if (!entries.length) return { notes: '', publishedAt: '' };
  const target = tag
    ? entries.find((e) => e.includes(`/releases/tag/${encodeURIComponent(tag)}`) || e.includes(`/releases/tag/${tag}`))
    : null;
  const entry = target || entries[0];
  const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/i);
  const contentMatch = entry.match(/<content\b[^>]*>([\s\S]*?)<\/content>/i);
  return {
    publishedAt: updatedMatch ? updatedMatch[1].trim() : '',
    notes: contentMatch ? htmlToPlainNotes(contentMatch[1]) : ''
  };
}

function pickAsset(assets, platform = process.platform, arch = process.arch) {
  const list = Array.isArray(assets) ? assets : [];
  return (platform === 'darwin'
    ? list.find((a) => a.name.endsWith('-mac-' + arch + '.dmg')) || list.find((a) => /universal.*\.dmg$/i.test(a.name))
    : list.find((a) => /\.exe$/i.test(a.name))) || null;
}

async function checkViaWeb({ repo, current, fetcher, platform, arch }) {
  const latestUrl = 'https://github.com/' + repo + '/releases/latest';
  const headRes = await fetcher(latestUrl, {
    method: 'HEAD',
    headers: { Accept: 'text/html' },
    followRedirects: false
  });
  const redirectTarget = headRes.location || headRes.url || '';
  const tag = parseTagFromReleaseUrl(redirectTarget);
  if (!tag) {
    throw new Error('GitHub Releases 页面未返回版本跳转 (' + headRes.status + ')');
  }
  const latest = tag.replace(/^v/i, '');
  if (!latest) return { ok: false, error: '最新发布没有版本号' };
  const hasUpdate = compareVersions(latest, current) > 0;
  const releasePageUrl = 'https://github.com/' + repo + '/releases/tag/' + encodeURIComponent(tag);

  if (!hasUpdate) {
    return {
      ok: true,
      current,
      latest,
      hasUpdate: false,
      url: releasePageUrl,
      notes: '',
      publishedAt: '',
      asset: null
    };
  }

  const assetsUrl = 'https://github.com/' + repo + '/releases/expanded_assets/' + encodeURIComponent(tag);
  const atomUrl = 'https://github.com/' + repo + '/releases.atom';
  const [assetsRes, atomRes] = await Promise.allSettled([
    fetcher(assetsUrl, { method: 'GET', headers: { Accept: 'text/html' } }),
    fetcher(atomUrl, { method: 'GET', headers: { Accept: 'application/atom+xml, application/xml, text/xml' } })
  ]);

  let assets = [];
  if (assetsRes.status === 'fulfilled' && assetsRes.value.status >= 200 && assetsRes.value.status < 300) {
    assets = parseAssetsFromHtml(assetsRes.value.body, repo);
  }
  let notes = '';
  let publishedAt = '';
  if (atomRes.status === 'fulfilled' && atomRes.value.status >= 200 && atomRes.value.status < 300) {
    const parsed = parseAtomEntry(atomRes.value.body, tag);
    notes = parsed.notes;
    publishedAt = parsed.publishedAt;
  }

  return {
    ok: true,
    current,
    latest,
    hasUpdate: true,
    url: releasePageUrl,
    notes,
    publishedAt,
    asset: pickAsset(assets, platform, arch)
  };
}

async function checkViaApi({ repo, current, fetcher, platform, arch }) {
  const res = await fetcher('https://api.github.com/repos/' + repo + '/releases/latest', {
    method: 'GET',
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (res.status < 200 || res.status >= 300) {
    if (res.status === 403 && /rate limit/i.test(res.body || '')) {
      throw new Error('GitHub 接口触发限流，请稍后再试或直接前往发布页下载');
    }
    throw new Error('GitHub API ' + res.status + (res.body ? ': ' + res.body.slice(0, 120) : ''));
  }
  const data = JSON.parse(res.body);
  const latest = String(data.tag_name || data.name || '').replace(/^v/i, '');
  if (!latest) return { ok: false, error: '最新发布没有版本号' };
  const assets = (data.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }));
  return {
    ok: true,
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    url: data.html_url || ('https://github.com/' + repo + '/releases/latest'),
    notes: data.body || '',
    publishedAt: data.published_at || '',
    asset: pickAsset(assets, platform, arch)
  };
}

async function checkForUpdates({ repo, current, fetcher = defaultFetcher, platform = process.platform, arch = process.arch }) {
  if (!repo || /OWNER/i.test(repo)) return { ok: false, error: '尚未配置 GitHub 仓库' };
  try {
    return await checkViaWeb({ repo, current, fetcher, platform, arch });
  } catch (webErr) {
    try {
      return await checkViaApi({ repo, current, fetcher, platform, arch });
    } catch (apiErr) {
      const msg = String(apiErr?.message || webErr?.message || '网络请求失败');
      if (/rate limit|限流/i.test(msg)) {
        return { ok: false, error: 'GitHub 接口触发限流，请点击此处前往发布页查看最新版本' };
      }
      return { ok: false, error: msg };
    }
  }
}

module.exports = {
  checkForUpdates,
  compareVersions,
  parseTagFromReleaseUrl,
  parseAssetsFromHtml,
  parseAtomEntry,
  htmlToPlainNotes,
  pickAsset
};
