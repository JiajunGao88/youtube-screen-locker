const test = require('node:test');
const assert = require('node:assert/strict');
const { derivePopupView } = require('../lib/popup-model');

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
