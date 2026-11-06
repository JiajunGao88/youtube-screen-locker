const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SEAL } = require('../lib/constants');
const { createMediaSessionGuard, ACTIONS } = require('../lib/media-session-guard');

function mockSession() {
  const handlers = {};
  return {
    handlers,
    setActionHandler(action, handler) {
      handlers[action] = handler;
    }
  };
}

test('the seal matches the extension copy and is not the string null', () => {
  const guard = require('../lib/media-session-guard');
  assert.equal(guard.SEAL, SEAL);
  assert.equal(SEAL.length > 16, true);
});

test('locked media keys use a no-op and unlock restores YouTube handlers', () => {
  const session = mockSession();
  const guard = createMediaSessionGuard(session);
  const pause = () => {};
  const next = () => {};
  session.setActionHandler('pause', pause);
  session.setActionHandler('nexttrack', next);
  guard.setActive(true, true);
  for (const action of ACTIONS) {
    assert.equal(typeof session.handlers[action], 'function');
    assert.equal(session.handlers[action], guard.noop);
  }
  let called = false;
  const updated = () => { called = true; };
  session.setActionHandler('pause', updated);
  assert.equal(session.handlers.pause, guard.noop);
  session.handlers.pause();
  assert.equal(called, false);
  assert.equal(guard.getSaved('pause'), updated);
  guard.setActive(false, true);
  assert.equal(session.handlers.pause, updated);
  assert.equal(session.handlers.nexttrack, next);
  assert.equal(session.handlers.play, null);
});

test('disabling media-key blocking restores handlers while the screen stays locked', () => {
  const session = mockSession();
  const guard = createMediaSessionGuard(session);
  const pause = () => {};
  session.setActionHandler('pause', pause);
  guard.setActive(true, false);
  assert.equal(session.handlers.pause, pause);
});

test('MAIN world rejects spoofed unlocks and keeps the seal off the page', () => {
  const session = mockSession();
  const listeners = [];
  const context = {
    console,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Error,
    Date,
    Math,
    navigator: { mediaSession: session },
    document: {
      addEventListener(type, fn) { listeners.push({ type, fn }); },
      querySelectorAll() { return []; },
      documentElement: {}
    }
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/media-session-guard.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/video-guard.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../main-world-guard.js'), 'utf8'), context);

  assert.equal(context.SEAL, undefined);
  assert.equal(context.__YTL_FACTORIES__.SEAL, undefined);
  const api = context.__YT_SCREEN_LOCKER_MAIN_GUARD__;
  assert.equal(api.ensureArmed('spoofed-seal-value', 'token-token-token'), false);
  assert.equal(api.ensureArmed(SEAL, 'short'), false);
  assert.equal(api.ensureArmed(SEAL, 'real-session-token'), true);
  assert.equal(api.ensureArmed(SEAL, 'attacker-session-token'), false);
  assert.equal(api.update(SEAL, 'attacker-session-token', { locked: true, blockMediaKeys: true, guardVolume: true }), false);
  assert.equal(api.update(SEAL, 'real-session-token', { locked: true, blockMediaKeys: true, guardVolume: true }), true);
  assert.equal(typeof session.handlers.pause, 'function');
  assert.equal(session.handlers.pause.name, 'ytScreenLockerMediaNoop');

  const eventListener = listeners.find((entry) => entry.type === 'yt-screen-locker-cmd');
  eventListener.fn({ detail: { state: { locked: false, blockMediaKeys: true, guardVolume: false } } });
  assert.equal(api.getState().locked, true);
  assert.equal(session.handlers.pause.name, 'ytScreenLockerMediaNoop');
  api.update('nope', 'real-session-token', { locked: false });
  assert.equal(api.getState().locked, true);
});
