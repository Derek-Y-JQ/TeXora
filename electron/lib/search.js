'use strict';
/**
 * Project-wide text search (no external ripgrep required).
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { IGNORED_DIRS, isTextFile } = require('./fsops');

const MAX_MATCHES = 800;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function makeMatcher({ query, regex, caseSensitive, wholeWord }) {
  if (!query) return null;
  const flags = caseSensitive ? 'g' : 'gi';
  let src = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) src = `\\b(?:${src})\\b`;
  try {
    return new RegExp(src, flags);
  } catch (err) {
    throw new Error('正则表达式无效：' + err.message);
  }
}

async function searchProject(root, options) {
  const { include = '', exclude = '', maxFiles = 5000 } = options;
  const matcher = makeMatcher(options);
  if (!matcher) return { ok: true, matches: [], files: 0, truncated: false };
  const includeRe = include ? new RegExp(globToRegex(include), 'i') : null;
  const excludeRe = exclude ? new RegExp(globToRegex(exclude), 'i') : null;
  const matches = [];
  let files = 0;
  let truncated = false;

  const walk = async (dir, depth) => {
    if (truncated || depth > 8) return;
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (matches.length >= MAX_MATCHES) {
        truncated = true;
        return;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        if (excludeRe && excludeRe.test(path.relative(root, full))) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!isTextFile(full)) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (includeRe && !includeRe.test(rel)) continue;
      if (excludeRe && excludeRe.test(rel)) continue;
      files++;
      if (files > maxFiles) {
        truncated = true;
        return;
      }
      let text = '';
      try {
        const stat = await fsp.stat(full);
        if (stat.size > MAX_FILE_SIZE) continue;
        text = await fsp.readFile(full, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        matcher.lastIndex = 0;
        let m;
        let count = 0;
        while ((m = matcher.exec(lines[i])) && count < 12) {
          count++;
          matches.push({
            file: full,
            rel,
            line: i + 1,
            col: m.index + 1,
            length: m[0].length || 1,
            text: lines[i].slice(0, 400),
            before: i > 0 ? lines[i - 1].slice(0, 200) : '',
            after: i + 1 < lines.length ? lines[i + 1].slice(0, 200) : ''
          });
          if (matches.length >= MAX_MATCHES) {
            truncated = true;
            break;
          }
          if (!matcher.global) break;
        }
        if (truncated) break;
      }
    }
  };
  await walk(root, 0);
  return {
    ok: true,
    matches,
    files,
    truncated,
    counts: matches.reduce((acc, m) => {
      acc[m.rel] = (acc[m.rel] || 0) + 1;
      return acc;
    }, {})
  };
}

function globToRegex(glob) {
  // "*.tex,*.bib" style input
  const parts = String(glob)
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) =>
      g
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '__DS__')
        .replace(/\*/g, '[^/]*')
        .replace(/__DS__/g, '.*')
        .replace(/\?/g, '.')
    );
  return parts.length ? `(${parts.join('|')})$` : '(?!)';
}

module.exports = { searchProject };


async function replaceProject(root, options) {
  const matcher = makeMatcher(options);
  if (!matcher) return { ok: true, files: 0, replacements: 0 };
  const { include = '', exclude = '', replacement = '' } = options;
  const includeRe = include ? new RegExp(globToRegex(include), 'i') : null;
  const excludeRe = exclude ? new RegExp(globToRegex(exclude), 'i') : null;
  const useRegex = !!options.regex;
  let files = 0;
  let replacements = 0;
  const touched = [];
  const walk = async (dir, depth) => {
    if (depth > 8) return;
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        if (excludeRe && excludeRe.test(path.relative(root, full))) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!isTextFile(full)) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (includeRe && !includeRe.test(rel)) continue;
      if (excludeRe && excludeRe.test(rel)) continue;
      let text = '';
      try {
        const stat = await fsp.stat(full);
        if (stat.size > MAX_FILE_SIZE) continue;
        text = await fsp.readFile(full, 'utf8');
      } catch { continue; }
      matcher.lastIndex = 0;
      let count = 0;
      if (useRegex) {
        const re = new RegExp(matcher.source, matcher.flags);
        count = (text.match(re) || []).length;
        if (count) {
          const next = text.replace(re, replacement);
          if (next !== text) { await fsp.writeFile(full, next, 'utf8'); files++; replacements += count; touched.push(rel); }
        }
      } else {
        const q = options.query;
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.caseSensitive ? 'g' : 'gi');
        count = (text.match(re) || []).length;
        if (count) {
          const next = text.replace(re, () => replacement);
          if (next !== text) { await fsp.writeFile(full, next, 'utf8'); files++; replacements += count; touched.push(rel); }
        }
      }
    }
  };
  await walk(root, 0);
  return { ok: true, files, replacements, touched };
}

module.exports = { searchProject, replaceProject, globToRegex };
