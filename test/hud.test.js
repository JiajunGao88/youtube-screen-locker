const test = require('node:test');
const assert = require('node:assert/strict');
const { HUD_CSS, mountHud } = require('../lib/hud');
const { createDocument } = require('./helpers/mini-dom');

test('the hold surface opts out of touch callouts', () => {
  assert.match(HUD_CSS, /\.pill, \.chip, \.hold \{[^}]*touch-action:\s*none;/);
  assert.match(HUD_CSS, /\.pill, \.chip, \.hold \{[^}]*user-select:\s*none;/);
  assert.match(HUD_CSS, /\.pill, \.chip, \.hold \{[^}]*-webkit-user-select:\s*none;/);
  assert.match(HUD_CSS, /\.pill, \.chip, \.hold \{[^}]*-webkit-touch-callout:\s*none;/);
});

test('showing the hud reactivates a visible deep-lock chip by itself', () => {
  const { document } = createDocument();
  const hud = mountHud(document, { shortcut: 'Ctrl+Shift+L' });
  hud.setMode({ showChip: true, deepActive: false, shortcut: 'Ctrl+Shift+L' });
  assert.equal(hud.chip.hidden, false);
  assert.equal(hud.chip.dataset.ytlActive, '0');
  hud.setShown(false);
  assert.equal(hud.chip.dataset.ytlActive, '0');
  hud.setShown(true);
  assert.equal(hud.holdBtn.dataset.ytlActive, '1');
  assert.equal(hud.chip.dataset.ytlActive, '1');
  hud.setMode({ showChip: false, deepActive: false });
  hud.setShown(true);
  assert.equal(hud.chip.hidden, true);
  assert.equal(hud.chip.dataset.ytlActive, '0');
});
