const test = require('node:test');
const assert = require('node:assert/strict');
const { createScreenLocker } = require('../lib/screen-locker');
const { YOUTUBE_SHORTCUT_KEYS } = require('../lib/event-guard');
const { createDocument, MiniEvent } = require('./helpers/mini-dom');
const { createClock } = require('./helpers/clock');

function chromeMock(settings) {
  const messages = [];
  return {
    messages,
    runtime: {
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve();
      },
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get(defaults, cb) {
          cb(Object.assign({}, defaults, settings || {}));
        },
        set(value) {
          if (value && Object.prototype.hasOwnProperty.call(value, 'isLocked')) {
            throw new Error('global isLocked must not be stored');
          }
        }
      },
      onChanged: { addListener() {} }
    }
  };
}

function setup(extra = {}) {
  const dom = createDocument();
  const clock = createClock();
  const chrome = extra.chrome || chromeMock(extra.settings);
  const nav = {
    platform: extra.platform || 'Win32',
    keyboard: extra.keyboard
  };
  const locker = createScreenLocker({
    document: dom.document,
    window: dom.window,
    navigator: nav,
    chrome,
    clock
  });
  return { ...dom, clock, chrome, nav, locker };
}

function fire(target, type, init) {
  const event = new MiniEvent(type, init);
  target.dispatchEvent(event);
  return event;
}

async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

test('per-tab lockers do not share or publish a global isLocked flag', () => {
  const first = setup();
  first.locker.lock();
  const second = setup();
  assert.equal(first.locker.getState().locked, true);
  assert.equal(second.locker.getState().locked, false);
  assert.equal(first.chrome.messages.some((message) => message.type === 'lock-state' && message.state.locked), true);
  assert.equal(JSON.stringify(first.chrome.messages).includes('"isLocked"'), false);
});

test('keyboard and pointer shortcuts are swallowed, including the YouTube set', () => {
  const env = setup();
  env.locker.lock();
  const wheel = env.window._listeners.find((listener) => listener.type === 'wheel');
  assert.equal(wheel.capture, true);
  assert.equal(wheel.passive, false);
  for (const key of YOUTUBE_SHORTCUT_KEYS) {
    const event = fire(env.document.body, 'keydown', { key, isTrusted: true });
    assert.equal(event.defaultPrevented, true, key);
    assert.equal(event._stopImmediate, true, key);
  }
  for (const type of ['keyup', 'keypress', 'beforeinput']) {
    const event = fire(env.document.body, type, { key: 'k', isTrusted: true });
    assert.equal(event.defaultPrevented, true, type);
  }
  const shiftN = fire(env.document.body, 'keydown', { key: 'N', shiftKey: true, isTrusted: true });
  assert.equal(shiftN.defaultPrevented, true);
  assert.equal(env.locker.getState().locked, true);
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'auxclick', 'dragstart', 'touchstart', 'touchend', 'touchmove', 'wheel', 'selectstart']) {
    const event = fire(env.document.body, type, { isTrusted: true, clientX: 1, clientY: 1 });
    assert.equal(event.defaultPrevented, true, type);
  }
});

test('Ctrl+Shift+L toggles on Windows and Cmd+Shift+L toggles on macOS', () => {
  const win = setup();
  fire(win.document.body, 'keydown', { key: 'l', code: 'KeyL', ctrlKey: true, shiftKey: true, isTrusted: true });
  assert.equal(win.locker.getState().locked, true);
  win.clock.advance(500);
  fire(win.document.body, 'keydown', { key: 'l', ctrlKey: true, shiftKey: true, isTrusted: true });
  assert.equal(win.locker.getState().locked, false);
  const untrusted = fire(win.document.body, 'keydown', { key: 'l', ctrlKey: true, shiftKey: true, isTrusted: false });
  assert.equal(untrusted.defaultPrevented, true);
  assert.equal(win.locker.getState().locked, false);

  const mac = setup({ platform: 'MacIntel' });
  fire(mac.document.body, 'keydown', { key: 'l', metaKey: true, shiftKey: true, isTrusted: true });
  assert.equal(mac.locker.getState().locked, true);
  mac.clock.advance(500);
  fire(mac.document.body, 'keydown', { key: 'l', ctrlKey: true, shiftKey: true, isTrusted: true });
  assert.equal(mac.locker.getState().locked, true);
});

test('hold to unlock: short click and leaving do nothing, a full hold unlocks', () => {
  const env = setup();
  env.locker.lock();
  const hold = env.locker.debug.hud.holdBtn;
  hold._rect = { left: 100, top: 500, right: 240, bottom: 560, width: 140, height: 60 };
  fire(env.document.body, 'pointerdown', { clientX: 140, clientY: 520, isTrusted: true });
  fire(env.document.body, 'pointerup', { clientX: 140, clientY: 520, isTrusted: true });
  env.clock.advance(50);
  assert.equal(env.locker.getState().locked, true);

  fire(env.document.body, 'pointerdown', { clientX: 140, clientY: 520, isTrusted: true });
  fire(env.document.body, 'pointermove', { clientX: 2, clientY: 2, isTrusted: true });
  env.clock.advance(50);
  assert.equal(env.locker.getState().locked, true);

  fire(env.document.body, 'pointerdown', { clientX: 140, clientY: 520, isTrusted: true });
  env.clock.advance(999);
  assert.equal(env.locker.getState().locked, true);
  env.clock.advance(1);
  assert.equal(env.locker.getState().locked, false);
});

test('an untrusted or spoofed page event cannot unlock', () => {
  const env = setup();
  env.locker.lock();
  const hold = env.locker.debug.hud.holdBtn;
  hold._rect = { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 };
  fire(env.document, 'pointerdown', { clientX: 20, clientY: 20, isTrusted: false });
  env.clock.advance(5000);
  fire(env.document, 'yt-screen-locker-cmd', { detail: { state: { locked: false } }, isTrusted: false });
  assert.equal(env.locker.getState().locked, true);
});

test('fullscreen reparents the hud and keyboard.lock follows fullscreen', async () => {
  const calls = [];
  const env = setup({
    keyboard: {
      lock: async () => { calls.push('lock'); },
      unlock: () => { calls.push('unlock'); }
    }
  });
  const player = env.document.createElement('div');
  player.id = 'movie_player';
  env.document.body.appendChild(player);
  env.document.fullscreenElement = player;
  env.locker.lock();
  await flush();
  assert.deepEqual(calls, ['lock']);
  assert.equal(env.locker.getState().deepActive, true);
  assert.equal(env.locker.debug.hud.host.parentNode, player);
  assert.equal(env.locker.debug.hud.host.style.zIndex, '2147483647');
  assert.equal(env.locker.debug.hud.shadow._mode, 'closed');
  assert.equal(env.locker.debug.hud.host.shadowRoot, null);

  env.document.fullscreenElement = null;
  fire(env.document, 'fullscreenchange');
  assert.equal(calls.includes('unlock'), true);
  assert.equal(env.locker.getState().locked, true);
  assert.equal(env.locker.getState().deepActive, false);
  assert.equal(env.locker.debug.hud.host.parentNode, env.document.body);
});

test('deep lock without a user gesture asks for the in-page chip', async () => {
  const env = setup({ keyboard: { lock: async () => {}, unlock() {} } });
  const player = env.document.createElement('div');
  player.id = 'movie_player';
  player.requestFullscreen = async () => {
    const error = new Error('gesture');
    error.name = 'NotAllowedError';
    throw error;
  };
  env.document.body.appendChild(player);
  const state = await env.locker.deepLock();
  assert.equal(state.locked, true);
  assert.equal(state.deepActive, false);
  assert.equal(state.needsGesture, true);
  assert.equal(env.locker.debug.hud.chip.hidden, false);

  player.requestFullscreen = async () => {
    env.document.fullscreenElement = player;
  };
  env.locker.debug.hud.chip._rect = { left: 10, top: 10, right: 200, bottom: 40, width: 190, height: 30 };
  fire(env.document.body, 'pointerdown', { clientX: 20, clientY: 20, isTrusted: true });
  fire(env.document.body, 'pointerup', { clientX: 20, clientY: 20, isTrusted: true });
  await flush();
  assert.equal(env.locker.getState().deepActive, true);
  assert.equal(env.document.fullscreenElement, player);
});

test('keyboard.lock is skipped safely when the API is missing', async () => {
  const env = setup();
  env.document.fullscreenElement = env.document.body;
  env.locker.lock();
  await flush();
  assert.equal(env.locker.getState().locked, true);
  assert.equal(env.locker.getState().deepActive, false);
  assert.equal(env.locker.getState().needsGesture, false);
  assert.equal(env.locker.debug.hud.chip.hidden, true);
});

test('the player button locks with one click and does not unlock', () => {
  const env = setup();
  const bar = env.document.createElement('div');
  bar.className = 'ytp-right-controls';
  env.document.body.appendChild(bar);
  env.locker.applySettings({ showPlayerButton: true });
  const button = bar.querySelector('.ytl-lock-btn');
  assert.ok(button);
  fire(button, 'click', { isTrusted: true });
  assert.equal(env.locker.getState().locked, true);
  fire(button, 'click', { isTrusted: true });
  assert.equal(env.locker.getState().locked, true);
  env.locker.applySettings({ showPlayerButton: false });
  assert.equal(bar.querySelector('.ytl-lock-btn'), null);
});

test('a second finger or long-press menu does not abort the hold', () => {
  const env = setup();
  env.locker.lock();
  const hold = env.locker.debug.hud.holdBtn;
  hold._rect = { left: 100, top: 500, right: 240, bottom: 560, width: 140, height: 60 };
  fire(env.document.body, 'pointerdown', { pointerId: 1, clientX: 140, clientY: 520, isTrusted: true });
  fire(env.document.body, 'pointerdown', { pointerId: 2, clientX: 8, clientY: 8, isTrusted: true });
  fire(env.document.body, 'pointermove', { pointerId: 2, clientX: 8, clientY: 8, isTrusted: true });
  fire(env.document.body, 'pointerup', { pointerId: 2, clientX: 8, clientY: 8, isTrusted: true });
  fire(env.document.body, 'pointercancel', { pointerId: 2, clientX: 8, clientY: 8, isTrusted: true });
  const menu = fire(env.document.body, 'contextmenu', { pointerId: 1, clientX: 140, clientY: 520, isTrusted: true });
  assert.equal(menu.defaultPrevented, true);
  env.clock.advance(999);
  assert.equal(env.locker.getState().locked, true);
  env.clock.advance(1);
  assert.equal(env.locker.getState().locked, false);
});

test('an empty touchend list does not release a pointer-tracked hold', () => {
  const env = setup();
  env.locker.lock();
  const hold = env.locker.debug.hud.holdBtn;
  hold._rect = { left: 100, top: 500, right: 240, bottom: 560, width: 140, height: 60 };
  fire(env.document.body, 'pointerdown', { pointerId: 4, clientX: 140, clientY: 520, isTrusted: true });
  fire(env.document.body, 'touchend', {
    isTrusted: true,
    touches: { length: 0 },
    changedTouches: { length: 1, 0: { clientX: 4, clientY: 4 } }
  });
  env.clock.advance(1000);
  assert.equal(env.locker.getState().locked, false);
});

test('a delayed command does not undo the keydown, and an explicit unlock is immediate', () => {
  const env = setup();
  fire(env.document.body, 'keydown', { key: 'l', ctrlKey: true, shiftKey: true, isTrusted: true });
  assert.equal(env.locker.getState().locked, true);
  env.clock.advance(800);
  let response;
  env.locker.handleMessage({ action: 'toggleLock' }, (value) => { response = value; });
  assert.equal(response.locked, true);
  env.clock.advance(800);
  env.locker.handleMessage({ action: 'toggleLock' }, (value) => { response = value; });
  assert.equal(response.locked, false);

  const follow = setup();
  follow.locker.handleMessage({ action: 'toggleLock' }, (value) => { response = value; });
  assert.equal(response.locked, true);
  follow.clock.advance(200);
  fire(follow.document.body, 'keydown', { key: 'l', ctrlKey: true, shiftKey: true, isTrusted: true });
  assert.equal(follow.locker.getState().locked, true);
  follow.clock.advance(500);
  fire(follow.document.body, 'keydown', { key: 'l', ctrlKey: true, shiftKey: true, isTrusted: true });
  assert.equal(follow.locker.getState().locked, false);

  const direct = setup();
  direct.locker.handleMessage({ action: 'lock' }, (value) => { response = value; });
  direct.locker.handleMessage({ action: 'unlock' }, (value) => { response = value; });
  assert.equal(response.locked, false);
  direct.locker.handleMessage({ action: 'lock' }, (value) => { response = value; });
  assert.equal(response.locked, true);
});

test('the deep-lock chip follows the setting and reappears with the hud', () => {
  const off = setup({ keyboard: { lock: async () => {}, unlock() {} } });
  off.locker.applySettings({ deepLock: false });
  off.locker.lock();
  assert.equal(off.locker.debug.hud.chip.hidden, true);
  assert.equal(off.locker.debug.hud.chip.dataset.ytlActive, '0');

  const on = setup({ keyboard: { lock: async () => {}, unlock() {} } });
  on.locker.lock();
  assert.equal(on.locker.debug.hud.chip.hidden, false);
  assert.equal(on.locker.debug.hud.chip.dataset.ytlActive, '1');
  on.clock.advance(4000);
  assert.equal(on.locker.debug.hud.chip.dataset.ytlActive, '0');
  fire(on.document.body, 'pointermove', { clientX: 1200, clientY: 680, isTrusted: true });
  assert.equal(on.locker.debug.hud.isShown(), true);
  assert.equal(on.locker.debug.hud.chip.dataset.ytlActive, '1');
});

test('the player button engages keyboard lock when already fullscreen', async () => {
  const calls = [];
  const env = setup({
    keyboard: {
      lock: async () => { calls.push('lock'); },
      unlock() {}
    }
  });
  const player = env.document.createElement('div');
  player.id = 'movie_player';
  const bar = env.document.createElement('div');
  bar.className = 'ytp-right-controls';
  player.appendChild(bar);
  env.document.body.appendChild(player);
  env.document.fullscreenElement = player;
  env.locker.applySettings({ showPlayerButton: true, deepLock: true });
  fire(bar.querySelector('.ytl-lock-btn'), 'click', { isTrusted: true });
  await flush();
  assert.equal(env.locker.getState().locked, true);
  assert.equal(env.locker.getState().deepActive, true);
  assert.equal(calls.includes('lock'), true);
});

test('cancelling a hold after the first hide window schedules another auto-hide', () => {
  const env = setup();
  env.locker.lock();
  const hold = env.locker.debug.hud.holdBtn;
  hold._rect = { left: 100, top: 500, right: 240, bottom: 560, width: 140, height: 60 };
  env.clock.advance(3500);
  fire(env.document.body, 'pointerdown', { pointerId: 7, clientX: 140, clientY: 520, isTrusted: true });
  env.clock.advance(600);
  assert.equal(env.locker.getState().locked, true);
  assert.equal(env.locker.debug.hud.isShown(), true);
  fire(env.document.body, 'pointerup', { pointerId: 7, clientX: 140, clientY: 520, isTrusted: true });
  assert.equal(env.locker.debug.hud.isShown(), true);
  env.clock.advance(3999);
  assert.equal(env.locker.debug.hud.isShown(), true);
  env.clock.advance(1);
  assert.equal(env.locker.debug.hud.isShown(), false);
  assert.equal(env.locker.getState().locked, true);
});

test('messages report per-tab state and ping responds', () => {
  const env = setup();
  let ping;
  env.locker.handleMessage({ action: 'ping' }, (response) => { ping = response; });
  assert.deepEqual(ping, { ok: true });
  let toggled;
  env.locker.handleMessage({ action: 'toggleLock' }, (response) => { toggled = response; });
  assert.equal(toggled.locked, true);
  let unlocked;
  env.locker.handleMessage({ action: 'unlock' }, (response) => { unlocked = response; });
  assert.equal(unlocked.locked, false);
});
