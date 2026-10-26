'use strict';
/**
 * Publish the current source tree and Windows installer to GitHub.
 * Requires: GITHUB_TOKEN (repo scope), GITHUB_OWNER, GITHUB_REPO.
 * Usage: node scripts/publish-github.mjs
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');

const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO || 'TeXora';
const VERSION = require('../package.json').version;
const RELEASE_FILE = path.join('release', `TeXora-Setup-${VERSION}.exe`);
const API = 'https://api.github.com';
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'release', '.git', '.capture', '.tmp', '.cache', '.latex_cache', '.texpadtmp']);
const EXCLUDE_FILE = /(\.aux|\.log|\.out|\.toc|\.bbl|\.blg|\.synctex\.gz|\.fls|\.fdb_latexmk|\.bcf|\.run\.xml|\.thm|\.pdf)$/i;

if (!TOKEN || !OWNER) {
  console.error('Set GITHUB_TOKEN and GITHUB_OWNER before running.');
  process.exit(1);
}

async function api(url, options = {}) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TeXora-Publisher',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${url}\n${String(text).slice(0, 500)}`);
  return data;
}

async function ensureRepo() {
  try {
    return await api(`/repos/${OWNER}/${REPO}`);
  } catch (err) {
    if (!String(err.message).startsWith('404')) throw err;
    const created = await api('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: REPO, private: false, description: 'TeXora — local-first LaTeX editor for Windows' })
    });
    console.log('Created repository', created.html_url);
    return created;
  }
}

async function walk(dir, files) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await walk(full, files);
    } else if (!EXCLUDE_FILE.test(entry.name)) {
      files.push(full);
    }
  }
}

async function main() {
  await ensureRepo();
  const files = [];
  await walk(process.cwd(), files);
  console.log('Uploading', files.length, 'source files…');
  let parent = null;
  try {
    const ref = await api(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    parent = ref.object.sha;
  } catch (err) {
    if (!String(err.message).startsWith('404') && !String(err.message).startsWith('409')) throw err;
  }
  const tree = [];
  for (let i = 0; i < files.length; i += 5) {
    const chunk = files.slice(i, i + 5);
    const entries = await Promise.all(chunk.map(async (file) => {
      const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
      let content;
      try { content = await fsp.readFile(file); } catch { return null; }
      if (content.length > 30 * 1024 * 1024) return null;
      const blob = await api(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' })
      });
      return { path: rel, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    tree.push(...entries.filter(Boolean));
    process.stdout.write(`\r${Math.min(files.length, i + 5)}/${files.length}`);
  }
  process.stdout.write('\n');
  const treeRes = await api(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree, ...(parent ? {} : {}) })
  });
  const commit = await api(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `TeXora ${VERSION}`,
      tree: treeRes.sha,
      ...(parent ? { parents: [parent] } : {})
    })
  });
  if (parent) {
    await api(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
  } else {
    await api(`/repos/${OWNER}/${REPO}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha }) });
  }
  console.log('Committed source.');

  const tag = 'v' + VERSION;
  try {
    await api(`/repos/${OWNER}/${REPO}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: 'refs/tags/' + tag, sha: commit.sha }) });
  } catch (err) {
    if (!String(err.message).includes('Reference already exists')) throw err;
  }
  let release;
  try {
    release = await api(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
  } catch {
    release = await api(`/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: `TeXora ${VERSION}`,
        body: `TeXora ${VERSION} — 首个 GitHub 发布版本。\n\n见 README 的功能说明。`,
        draft: false,
        prerelease: false
      })
    });
  }
  if (fs.existsSync(RELEASE_FILE)) {
    console.log('Uploading installer…');
    const uploadUrl = release.upload_url.replace(/\{.*$/, '') + '?name=' + path.basename(RELEASE_FILE);
    const buf = await fsp.readFile(RELEASE_FILE);
    await api(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf });
  }
  console.log('Done:', `https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
