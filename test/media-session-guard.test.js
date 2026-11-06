const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createMediaSessionGuard, createMainController, ACTIONS } = require('../lib/media-session-guard');
const { deliverMainCommand } = require('../lib/background-controller');
const { bootMainRealm, openClosedShadow } = require('./helpers/main-realm');

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

test('page scripts cannot see a rebind hook or the closed command channel', () => {
  const realm = bootMainRealm();
  const context = realm.context;
  const seen = [];
  context.addEventListener('ytl-main-cmd', () => seen.push('window'), true);
  context.document.addEventListener('ytl-main-cmd', () => seen.push('document'), true);
  assert.equal(context.__YTL_FACTORIES__, undefined);
  const api = context.__YT_SCREEN_LOCKER_MAIN_GUARD__;
  assert.deepEqual(Object.getOwnPropertyNames(api).sort(), ['brand', 'ensureArmed', 'getState', 'update']);
  assert.equal(api.privilegedRebind, undefined);
  assert.equal(api.rebindMainGuard, undefined);
  const host = context.document.querySelector('[data-ytl-main-bridge="1"]');
  assert.ok(host);
  assert.equal(host.shadowRoot, null);
  assert.equal(context.document.querySelector('[data-ytl-role="main-inbox"]'), null);
  const guess = 'e'.repeat(40);
  const tokenA = 'token-aaaaaaaaaaaaaaa';
  assert.equal(api.ensureArmed(guess, tokenA), false);
  assert.equal(api.update(guess, tokenA, { locked: false, blockMediaKeys: false, guardVolume: false }), false);
  assert.equal(api.getState().locked, false);

  const previousDocument = global.document;
  const previousChrome = global.chrome;
  global.document = context.document;
  global.chrome = { dom: { openOrClosedShadowRoot: openClosedShadow } };
  try {
    const armed = deliverMainCommand('c'.repeat(32), tokenA, {
      locked: true,
      blockMediaKeys: true,
      guardVolume: true
    });
    assert.equal(armed.ok, true);
    assert.deepEqual(seen, []);
    assert.equal(api.getState().locked, true);
    assert.equal(api.update(guess, tokenA, { locked: false }), false);
    assert.equal(api.getState().locked, true);
    const dir = path.resolve(__dirname, '..');
    for (const file of ['lib/media-session-guard.js', 'lib/video-guard.js', 'main-world-guard.js']) {
      vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context, { filename: file });
    }
    assert.equal(context.__YTL_FACTORIES__, undefined);
    assert.equal(context.__YT_SCREEN_LOCKER_MAIN_GUARD__, api);
    const tokenB = 'token-bbbbbbbbbbbbbbb';
    const rotated = deliverMainCommand('a'.repeat(32), tokenB, {
      locked: false,
      blockMediaKeys: false,
      guardVolume: false
    });
    assert.equal(rotated.ok, true);
    assert.equal(api.getState().locked, false);
    assert.equal(api.getState().blockMediaKeys, false);
    assert.deepEqual(seen, []);
  } finally {
    global.document = previousDocument;
    global.chrome = previousChrome;
  }
});
