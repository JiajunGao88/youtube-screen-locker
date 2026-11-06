const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SEAL } = require('../lib/constants');
const { createMediaSessionGuard, createMainController, ACTIONS } = require('../lib/media-session-guard');

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

test('document_start restores unsaved actions to null', () => {
  const session = mockSession();
  const guard = createMediaSessionGuard(session, { document: { readyState: 'loading' } });
  guard.setActive(true, true);
  guard.setActive(false, true);
  for (const action of ACTIONS) {
    assert.equal(session.handlers[action], null, action);
  }
});

test('a recovered tab bridges the player and still accepts YouTube handlers', () => {
  const session = mockSession();
  const calls = [];
  const video = {
    currentTime: 40,
    play() { calls.push('video.play'); },
    pause() { calls.push('video.pause'); }
  };
  const player = {
    querySelector() { return video; },
    playVideo() { calls.push('playVideo'); },
    pauseVideo() { calls.push('pauseVideo'); },
    nextVideo() { calls.push('nextVideo'); },
    previousVideo() { calls.push('previousVideo'); }
  };
  const doc = {
    readyState: 'complete',
    getElementById(id) { return id === 'movie_player' ? player : null; },
    querySelector(sel) { return sel === 'video' ? video : null; }
  };
  const guard = createMediaSessionGuard(session, { document: doc });
  guard.setActive(true, true);
  guard.setActive(false, true);
  assert.equal(session.handlers.stop, null);
  session.handlers.play();
  session.handlers.pause();
  session.handlers.nexttrack();
  session.handlers.previoustrack();
  session.handlers.seekbackward({ seekOffset: 15 });
  assert.equal(video.currentTime, 25);
  session.handlers.seekforward();
  assert.equal(video.currentTime, 35);
  session.handlers.seekto({ seekTime: 8 });
  assert.equal(video.currentTime, 8);
  assert.deepEqual(calls, ['playVideo', 'pauseVideo', 'nextVideo', 'previousVideo']);

  const custom = () => { calls.push('custom'); };
  session.setActionHandler('nexttrack', custom);
  assert.equal(session.handlers.nexttrack, custom);
  session.handlers.nexttrack();
  assert.equal(calls.at(-1), 'custom');

  delete player.playVideo;
  const fallback = mockSession();
  const fallbackGuard = createMediaSessionGuard(fallback, { document: doc, lateInjected: true });
  fallbackGuard.setActive(true, true);
  fallbackGuard.setActive(false, true);
  fallback.handlers.play();
  assert.equal(calls.at(-1), 'video.play');
});

test('the main-world controller derives late recovery from readyState', () => {
  const session = mockSession();
  const calls = [];
  const doc = {
    readyState: 'complete',
    getElementById(id) {
      return id === 'movie_player' ? { previousVideo() { calls.push('previousVideo'); } } : null;
    },
    querySelector() { return null; }
  };
  const controller = createMainController({ mediaSession: session, document: doc });
  const token = 'real-session-token';
  assert.equal(controller.ensureArmed(SEAL, token), true);
  assert.equal(controller.update(SEAL, token, { locked: true, blockMediaKeys: true, guardVolume: false }), true);
  assert.equal(controller.update(SEAL, token, { locked: false, blockMediaKeys: true, guardVolume: false }), true);
  session.handlers.previoustrack();
  assert.deepEqual(calls, ['previousVideo']);
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
  assert.equal(listeners.some((entry) => entry.type === 'yt-screen-locker-cmd'), false);
  assert.equal(fs.readFileSync(path.join(__dirname, '../main-world-guard.js'), 'utf8').includes('yt-screen-locker-cmd'), false);

  try {
    context.__YT_SCREEN_LOCKER_MAIN_GUARD__ = {
      brand: 'spoof',
      update: function () { return true; }
    };
  } catch (err) {
    // Non-configurable property throws in strict contexts.
  }
  assert.equal(context.__YT_SCREEN_LOCKER_MAIN_GUARD__.brand, 'yt-screen-locker-main-v2');
  assert.equal(api.update('wrong-seal', 'real-session-token', { locked: false }), false);
  assert.equal(api.getState().locked, true);
  assert.equal(session.handlers.pause.name, 'ytScreenLockerMediaNoop');
});
