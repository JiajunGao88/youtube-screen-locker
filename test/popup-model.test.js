const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { choosePopupSettings, derivePopupView } = require('../lib/popup-model');

test('popup view follows the active tab lock state', () => {
  const idle = derivePopupView({ isYouTube: false, state: null, isMac: false });
  assert.equal(idle.status, 'Open a YouTube tab');
  assert.equal(idle.lockDisabled, true);

  const open = derivePopupView({
    isYouTube: true,
    isMac: false,
    state: { locked: false, deepActive: false, settings: { deepLock: true, blockMediaKeys: false, showPlayerButton: true } }
  });
  assert.equal(open.status, 'Unlocked');
  assert.equal(open.lockLabel, 'Lock Screen');
  assert.equal(open.settings.blockMediaKeys, false);

  const deep = derivePopupView({
    isYouTube: true,
    isMac: true,
    state: { locked: true, deepActive: true, settings: {} }
  });
  assert.equal(deep.status, 'Deep Locked');
  assert.equal(deep.deepDisabled, true);
  assert.equal(deep.shortcut, '⌘ + Shift + L');
  assert.equal(deep.lockLabel, 'Unlock Screen');
});

test('saved settings stay visible before a YouTube tab reports state', () => {
  const stored = { deepLock: false, blockMediaKeys: false, showPlayerButton: true };
  assert.deepEqual(choosePopupSettings(null, stored), {
    deepLock: false,
    blockMediaKeys: false,
    showPlayerButton: true
  });
  const view = derivePopupView({ isYouTube: false, state: null, settings: stored });
  assert.equal(view.settings.deepLock, false);
  assert.equal(view.settings.blockMediaKeys, false);
  assert.equal(view.settings.showPlayerButton, true);
  assert.equal(view.lockDisabled, true);
});

test('the active tab settings win over the stored copy', () => {
  const view = derivePopupView({
    isYouTube: true,
    state: {
      locked: true,
      settings: { deepLock: false, blockMediaKeys: true, showPlayerButton: false }
    },
    settings: { deepLock: true, blockMediaKeys: false, showPlayerButton: true }
  });
  assert.equal(view.settings.deepLock, false);
  assert.equal(view.settings.blockMediaKeys, true);
  assert.equal(view.settings.showPlayerButton, false);
});

test('the popup reads stored settings before painting any tab', () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8');
  assert.match(source, /chrome\.storage\.local\.get\(YTLock\.DEFAULT_SETTINGS/);
  assert.match(source, /storedSettings = await readStoredSettings\(\)/);
  assert.match(source, /settings:\s*storedSettings/);
});
