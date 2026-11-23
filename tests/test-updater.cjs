'use strict';
const assert = require('node:assert/strict');
const {
  checkForUpdates,
  compareVersions,
  parseTagFromReleaseUrl,
  parseAssetsFromHtml,
  parseAtomEntry,
  pickAsset
} = require('../electron/lib/updater');

async function main() {
  // 1. Version comparison
  assert.equal(compareVersions('2.2.8', '2.2.7'), 1);
  assert.equal(compareVersions('2.2.7', '2.2.7'), 0);
  assert.equal(compareVersions('2.2.6', '2.2.7'), -1);

  // 2. Tag parsing
  assert.equal(parseTagFromReleaseUrl('https://github.com/Derek-Y-JQ/TeXora/releases/tag/v2.2.8'), 'v2.2.8');
  assert.equal(parseTagFromReleaseUrl('https://github.com/Derek-Y-JQ/TeXora/releases/latest'), '');

  // 3. Web-first path when already up to date: only 1 HEAD request, zero api.github.com calls
  const calls1 = [];
  const res1 = await checkForUpdates({
    repo: 'Derek-Y-JQ/TeXora',
    current: '2.2.7',
    platform: 'win32',
    arch: 'x64',
    fetcher: async (url, opts) => {
      calls1.push({ url, method: opts.method });
      assert.ok(!url.includes('api.github.com'), 'Must not hit api.github.com when web redirect works');
      return { status: 302, url, location: 'https://github.com/Derek-Y-JQ/TeXora/releases/tag/v2.2.7', body: '' };
    }
  });
  assert.equal(res1.ok, true);
  assert.equal(res1.hasUpdate, false);
  assert.equal(res1.latest, '2.2.7');
  assert.equal(calls1.length, 1);
  assert.equal(calls1[0].method, 'HEAD');

  // 4. Web-first path when update is available: fetches expanded_assets + releases.atom, picks platform asset
  const calls2 = [];
  const res2 = await checkForUpdates({
    repo: 'Derek-Y-JQ/TeXora',
    current: '2.2.6',
    platform: 'darwin',
    arch: 'arm64',
    fetcher: async (url, opts) => {
      calls2.push({ url, method: opts.method });
      assert.ok(!url.includes('api.github.com'), 'Must not hit api.github.com when web check works');
      if (url.endsWith('/releases/latest')) {
        return { status: 302, url, location: 'https://github.com/Derek-Y-JQ/TeXora/releases/tag/v2.2.8', body: '' };
      }
      if (url.includes('/releases/expanded_assets/v2.2.8')) {
        return {
          status: 200,
          url,
          location: '',
          body: `
            <a href="/Derek-Y-JQ/TeXora/releases/download/v2.2.8/TeXora-Setup-2.2.8.exe">exe</a>
            <a href="/Derek-Y-JQ/TeXora/releases/download/v2.2.8/TeXora-2.2.8-mac-arm64.dmg">arm64</a>
            <a href="/Derek-Y-JQ/TeXora/releases/download/v2.2.8/TeXora-2.2.8-mac-x64.dmg">x64</a>
          `
        };
      }
      if (url.endsWith('/releases.atom')) {
        return {
          status: 200,
          url,
          location: '',
          body: `<?xml version="1.0"?><feed><entry>
            <updated>2026-11-23T05:00:00Z</updated>
            <link href="https://github.com/Derek-Y-JQ/TeXora/releases/tag/v2.2.8"/>
            <content type="html">&lt;ul&gt;&lt;li&gt;修复检查更新 403 限流&lt;/li&gt;&lt;li&gt;启动立即检查更新&lt;/li&gt;&lt;/ul&gt;</content>
          </entry></feed>`
        };
      }
      throw new Error('Unexpected URL: ' + url);
    }
  });
  assert.equal(res2.ok, true);
  assert.equal(res2.hasUpdate, true);
  assert.equal(res2.latest, '2.2.8');
  assert.equal(res2.asset?.name, 'TeXora-2.2.8-mac-arm64.dmg');
  assert.equal(res2.asset?.url, 'https://github.com/Derek-Y-JQ/TeXora/releases/download/v2.2.8/TeXora-2.2.8-mac-arm64.dmg');
  assert.match(res2.notes, /修复检查更新 403 限流/);
  assert.equal(res2.publishedAt, '2026-11-23T05:00:00Z');

  // 5. Fallback to API when web fails, and friendly Chinese error when API returns 403 rate limit
  const res3 = await checkForUpdates({
    repo: 'Derek-Y-JQ/TeXora',
    current: '2.2.6',
    fetcher: async (url) => {
      if (url.includes('api.github.com')) {
        return { status: 403, url, location: '', body: '{"message":"API rate limit exceeded for 156.252.21.67"}' };
      }
      throw new Error('web temporarily blocked');
    }
  });
  assert.equal(res3.ok, false);
  assert.match(res3.error, /限流/);
  assert.ok(!res3.error.includes('156.252.21.67'), 'Should not leak raw GitHub JSON rate limit error');

  // 6. Asset picker for Windows & macOS
  const sampleAssets = parseAssetsFromHtml(
    '<a href="/Derek-Y-JQ/TeXora/releases/download/v2.2.8/TeXora-Setup-2.2.8.exe"></a>' +
    '<a href="/Derek-Y-JQ/TeXora/releases/download/v2.2.8/TeXora-2.2.8-mac-x64.dmg"></a>',
    'Derek-Y-JQ/TeXora'
  );
  assert.equal(pickAsset(sampleAssets, 'win32', 'x64')?.name, 'TeXora-Setup-2.2.8.exe');
  assert.equal(pickAsset(sampleAssets, 'darwin', 'x64')?.name, 'TeXora-2.2.8-mac-x64.dmg');
  assert.equal(parseAtomEntry('', 'v2.2.8').notes, '');

  console.log('PASS updater: web-first rate-limit-free check, expanded_assets, atom notes, and friendly 403 fallback.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
