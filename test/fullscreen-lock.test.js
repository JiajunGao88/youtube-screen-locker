const test = require('node:test');
const assert = require('node:assert/strict');
const { createFullscreenLock, findFullscreenTarget, selectHudParent } = require('../lib/fullscreen-lock');

test('hud parent follows the fullscreen element', () => {
  const body = { id: 'body' };
  const player = { id: 'player' };
  assert.equal(selectHudParent(null, body), body);
  assert.equal(selectHudParent(player, body), player);
  assert.equal(selectHudParent(null, null), null);
});

test('fullscreen target prefers the YouTube player', () => {
  const movie = { id: 'movie_player' };
  const doc = {
    getElementById(id) { return id === 'movie_player' ? movie : null; },
    querySelector() { return null; },
    documentElement: { id: 'html' }
  };
  assert.equal(findFullscreenTarget(doc), movie);
  assert.equal(findFullscreenTarget({
    getElementById() { return null; },
    querySelector(sel) { return sel === 'ytd-player' ? { id: 'ytd' } : null; },
    documentElement: { id: 'html' }
  }).id, 'ytd');
});

test('keyboard.lock runs only in fullscreen and unlocks when fullscreen ends', async () => {
  const calls = [];
  let element = null;
  const keyboard = {
    lock: async () => { calls.push('lock'); },
    unlock: () => { calls.push('unlock'); }
  };
  const fs = createFullscreenLock({
    getFullscreenElement: () => element,
    keyboard
  });
  assert.deepEqual(await fs.tryLock(), { ok: false, reason: 'not-fullscreen' });
  assert.deepEqual(calls, []);
  element = { id: 'player' };
  assert.deepEqual(await fs.tryLock(), { ok: true });
  assert.equal(fs.isDeepActive(), true);
  assert.deepEqual(fs.handleFullscreenChange(), { exited: false, wasDeep: true, deepActive: true });
  element = null;
  const exited = fs.handleFullscreenChange();
  assert.equal(exited.exited, true);
  assert.equal(fs.isDeepActive(), false);
  assert.deepEqual(calls, ['lock', 'unlock']);
});

test('missing keyboard API and lock rejection are safe', async () => {
  let element = { id: 'player' };
  const missing = createFullscreenLock({ getFullscreenElement: () => element, keyboard: null });
  assert.deepEqual(await missing.tryLock(), { ok: false, reason: 'unavailable' });
  missing.handleFullscreenChange();
  const keyboard = {
    lock: async () => {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      throw error;
    },
    unlock: () => {}
  };
  const denied = createFullscreenLock({ getFullscreenElement: () => element, keyboard });
  assert.deepEqual(await denied.tryLock(), { ok: false, reason: 'NotAllowedError' });
  assert.equal(denied.isDeepActive(), false);
  element = null;
  assert.equal(denied.handleFullscreenChange().exited, true);
});
