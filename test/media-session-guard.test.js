const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

test('the media guard does not ship a hardcoded public seal', () => {
  const guardSrc = fs.readFileSync(path.join(__dirname, '../lib/media-session-guard.js'), 'utf8');
  const constantSrc = fs.readFileSync(path.join(__dirname, '../lib/constants.js'), 'utf8');
  assert.equal(guardSrc.includes('7c2e9a4b-1d6f-4e8a-9b3c'), false);
  assert.equal(constantSrc.includes('7c2e9a4b-1d6f-4e8a-9b3c'), false);
  assert.equal(require('../lib/media-session-guard').SEAL, undefined);
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
  const secret = 'd'.repeat(32);
  assert.equal(controller.ensureArmed(secret, token), false);
  assert.equal(controller.privilegedRebind(secret, token, { locked: true, blockMediaKeys: true, guardVolume: false }).ok, true);
  assert.equal(controller.privilegedRebind(secret, token, { locked: false, blockMediaKeys: true, guardVolume: false }).ok, true);
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
  const guess = 'e'.repeat(40);
  const tokenA = 'token-aaaaaaaaaaaaaaa';
  const tokenB = 'token-bbbbbbbbbbbbbbb';
  assert.equal(api.ensureArmed(guess, tokenA), false);
  assert.equal(api.update(guess, tokenA, { locked: true, blockMediaKeys: true, guardVolume: true }), false);
  assert.equal(api.getState().locked, false);
  const armed = context.__YTL_FACTORIES__.rebindMainGuard('c'.repeat(32), tokenA, {
    locked: true,
    blockMediaKeys: true,
    guardVolume: true
  });
  assert.equal(armed.ok, true);
  assert.equal(api.ensureArmed(guess, tokenB), false);
  assert.equal(api.update(guess, tokenA, { locked: false }), false);
  assert.equal(api.getState().locked, true);
  assert.equal(session.handlers.pause.name, 'ytScreenLockerMediaNoop');
  const rotated = context.__YTL_FACTORIES__.rebindMainGuard('a'.repeat(32), tokenB, {
    locked: false,
    blockMediaKeys: false,
    guardVolume: false
  });
  assert.equal(rotated.ok, true);
  assert.equal(api.getState().locked, false);
  assert.equal(api.getState().blockMediaKeys, false);
  assert.equal(api.update('c'.repeat(32), tokenA, { locked: true, blockMediaKeys: true, guardVolume: true }), false);
  assert.equal(api.getState().locked, false);
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
  assert.equal(api.update('wrong-seal', tokenB, { locked: true }), false);
  assert.equal(api.getState().locked, false);
});
