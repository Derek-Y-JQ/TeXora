'use strict';
/** GitHub Releases update checker (no auto-install). */
const https = require('node:https');

function getJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'TeXora-Updater',
        Accept: 'application/vnd.github+json'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 4) {
        res.resume();
        resolve(getJson(res.headers.location, redirects + 1));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('GitHub API ' + res.statusCode + (body ? ': ' + body.slice(0, 160) : '')));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('检查更新超时')));
    req.on('error', reject);
  });
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

async function checkForUpdates({ repo, current }) {
  if (!repo || /OWNER/i.test(repo)) return { ok: false, error: '尚未配置 GitHub 仓库' };
  const data = await getJson('https://api.github.com/repos/' + repo + '/releases/latest');
  const latest = String(data.tag_name || data.name || '').replace(/^v/i, '');
  if (!latest) return { ok: false, error: '最新发布没有版本号' };
  const assets = (data.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }));
  const asset = assets.find((a) => /\.exe$/i.test(a.name)) || null;
  return {
    ok: true,
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    url: data.html_url || ('https://github.com/' + repo + '/releases/latest'),
    notes: data.body || '',
    publishedAt: data.published_at || '',
    asset
  };
}

module.exports = { checkForUpdates, compareVersions };
