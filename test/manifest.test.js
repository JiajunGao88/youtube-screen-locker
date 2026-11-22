const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = require('../lib/script-files');

const FORBIDDEN = [
  'tabs', 'notifications', 'nativeMessaging', 'webNavigation', 'debugger', 'history',
  'bookmarks', 'cookies', 'downloads', 'management', 'pageCapture', 'privacy', 'proxy',
  'tabCapture', 'tts', 'webRequest', 'webRequestBlocking', 'declarativeNetRequest',
  'declarativeNetRequestWithHostAccess', 'geolocation', 'clipboardRead', 'clipboardWrite',
  'identity', 'topSites', 'system.storage', 'desktopCapture', 'offscreen', 'userScripts'
];

test('manifest stays on MV3 with the v2 version and Chrome 111 floor', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '2.0.0');
  assert.equal(manifest.minimum_chrome_version, '111');
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.background.type, undefined);
});

test('permissions do not add a Chrome Web Store warning', () => {
  assert.deepEqual(manifest.permissions, ['activeTab', 'storage', 'scripting']);
  assert.deepEqual(manifest.host_permissions, ['*://*.youtube.com/*']);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  for (const name of FORBIDDEN) {
    assert.equal(manifest.permissions.includes(name), false, name);
  }
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('content scripts stay on youtube.com and gain a MAIN-world guard', () => {
  assert.equal(manifest.content_scripts.length, 2);
  for (const entry of manifest.content_scripts) {
    assert.deepEqual(entry.matches, ['*://*.youtube.com/*']);
    assert.equal(entry.run_at, 'document_start');
  }
  assert.deepEqual(manifest.content_scripts[0].js, [...files.ISOLATED_FILES]);
  assert.equal(manifest.content_scripts[0].world, undefined);
  assert.deepEqual(manifest.content_scripts[1].js, [...files.MAIN_FILES]);
  assert.equal(manifest.content_scripts[1].world, 'MAIN');
  assert.equal(manifest.content_scripts[0].css, undefined);
});

test('the keyboard command is unchanged for existing users', () => {
  assert.equal(manifest.commands['toggle-lock'].suggested_key.default, 'Ctrl+Shift+L');
  assert.equal(manifest.commands['toggle-lock'].suggested_key.mac, 'Command+Shift+L');
});

test('runtime sources do not persist a global isLocked flag', () => {
  const sources = [
    'background.js', 'content.js', 'popup.js', 'main-world-guard.js',
    ...files.ISOLATED_FILES, ...files.MAIN_FILES
  ];
  for (const rel of sources) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(src, /storage\.local\.set\(\s*\{[^}]*\bisLocked\b/);
  }
});
