'use strict';
const assert = require('node:assert');
const i18n = require('../electron/lib/i18n');
for (const lang of ['en', 'ja']) {
  const dict = require(`../electron/locales/${lang}.json`);
  for (const [key, value] of Object.entries(dict)) {
    const holes = (s) => [...new Set(s.match(/\{\d+\}/g) || [])].sort().join();
    assert.equal(holes(key), holes(value), `${lang}: placeholders differ for ${key}`);
  }
}
i18n.setLanguage('zh-CN');
assert.equal(i18n.t('编辑'), '编辑', 'source language is returned untouched');
i18n.setLanguage('en');
assert.equal(i18n.t('编辑'), 'Edit');
assert.equal(i18n.t('确定删除 main.tex 吗？'), 'Delete main.tex?');
assert.equal(i18n.t('3 错误 · 1 警告'), '3 errors · 1 warnings');
assert.equal(i18n.t('已保存 main.tex'), 'Saved main.tex');
assert.equal(i18n.t('main.tex'), 'main.tex', 'text without Chinese is never touched');
assert.equal(i18n.t('一段用户自己的话'), '一段用户自己的话', 'unknown text falls back to the original');
i18n.setLanguage('ja');
assert.equal(i18n.t('编辑'), '編集');
assert.equal(i18n.t('12 个匹配 · 3 个文件'), '12 件一致 · 3 ファイル');
console.log('PASS i18n: locale placeholders, exact / pattern / prefix matching, fallback.');
