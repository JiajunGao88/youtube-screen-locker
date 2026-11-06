const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundController } = require('../lib/background-controller');
const { bootMainRealm, openClosedShadow } = require('./helpers/main-realm');
const { ISOLATED_FILES, MAIN_FILES } = require('../lib/script-files');

function createChrome(options = {}) {
  const scripts = [];
  const badges = [];
  const content = new Map();
  const storage = {
    removed: null,
    saved: null,
    local: {
      get: async () => ({ deepLock: true, blockMediaKeys: true, showPlayerButton: true }),
      set: async (value) => { storage.saved = value; },
      remove: async (key) => { storage.removed = key; }
    }
  };
  const chrome = {
    scripts,
    badges,
    content,
    storage,
    action: {
      setBadgeText: async (detail) => { badges.push(detail); },
      setBadgeBackgroundColor: async () => {}
    },
    scripting: {
      executeScript: async (detail) => {
        scripts.push(detail);
        if (typeof detail.func === 'function') {
          return [{ result: detail.func(...detail.args) }];
        }
        if (detail.world === 'ISOLATED') {
          content.set(detail.target.tabId, async (message) => {
            if (message.action === 'ping') return { ok: true };
            if (message.action === 'toggleLock') return { ok: true, locked: true, deepActive: false };
            return { ok: true, locked: false, deepActive: false };
          });
        }
        return [{ result: true }];
      }
    },
    tabs: {
      query: async (q) => options.tabs || [],
      sendMessage: async (tabId, message) => {
        const handler = content.get(tabId);
        if (!handler) {
          const error = new Error('Could not establish connection. Receiving end does not exist.');
          throw error;
        }
        return handler(message);
      }
    }
  };
  return chrome;
}

test('a pre-existing tab gets both worlds injected once', async () => {
  const chrome = createChrome();
  const controller = createBackgroundController({ chrome });
  const first = await controller.ensureTab(7);
  assert.equal(first.injected, true);
  assert.deepEqual(chrome.scripts[0].files, [...MAIN_FILES]);
  assert.equal(chrome.scripts[0].world, 'MAIN');
  assert.deepEqual(chrome.scripts[1].files, [...ISOLATED_FILES]);
  assert.equal(chrome.scripts[1].world, 'ISOLATED');
  const second = await controller.ensureTab(7);
  assert.equal(second.injected, false);
  assert.equal(chrome.scripts.length, 2);
});

test('lock state is per tab and drives that tab badge', async () => {
  const chrome = createChrome();
  const controller = createBackgroundController({ chrome });
  controller.handleMessage({ type: 'lock-state', state: { locked: true, deepActive: true } }, { tab: { id: 1 } });
  controller.handleMessage({ type: 'lock-state', state: { locked: false, deepActive: false } }, { tab: { id: 2 } });
  assert.equal(controller.tabState.get(1).locked, true);
  assert.equal(controller.tabState.get(2).locked, false);
  assert.equal(chrome.badges.find((badge) => badge.tabId === 1).text, 'LOCK');
  assert.equal(chrome.badges.find((badge) => badge.tabId === 2).text, '');
  await controller.handleTabRemoved(1);
  assert.equal(controller.tabState.get(1), null);
});

test('the shortcut ignores non-YouTube tabs and toggles a YouTube tab', async () => {
  const chrome = createChrome({
    tabs: [{ id: 4, url: 'https://example.com/?q=youtube.com' }]
  });
  const controller = createBackgroundController({ chrome });
  const skipped = await controller.handleCommand('toggle-lock');
  assert.equal(skipped.reason, 'not-youtube');
  chrome.tabs.query = async () => [{ id: 9, url: 'https://www.youtube.com/watch?v=abc' }];
  const toggled = await controller.handleCommand('toggle-lock');
  assert.equal(toggled.locked, true);
  assert.equal(controller.tabState.get(9).locked, true);
});

test('install clears the legacy flag and a rotated secret can rebind an open tab', async () => {
  const chrome = createChrome({ tabs: [] });
  const sessionStore = {};
  chrome.storage.session = {
    async get(key) { return { [key]: sessionStore[key] }; },
    async set(value) { Object.assign(sessionStore, value); }
  };
  const controller = createBackgroundController({ chrome });
  await controller.handleInstalled();
  assert.equal(chrome.storage.removed, 'isLocked');
  assert.equal(chrome.storage.saved.deepLock, true);
  assert.equal(Object.prototype.hasOwnProperty.call(chrome.storage.saved, 'isLocked'), false);

  const realm = bootMainRealm();
  const api = realm.context.__YT_SCREEN_LOCKER_MAIN_GUARD__;
  assert.equal(realm.context.__YTL_FACTORIES__, undefined);
  const guess = 'f'.repeat(40);
  assert.equal(api.ensureArmed(guess, 'token-aaaaaaaaaaaaaaa'), false);
  assert.equal(api.update(guess, 'token-aaaaaaaaaaaaaaa', { locked: true, blockMediaKeys: true, guardVolume: true }), false);

  const previousDocument = global.document;
  const previousChrome = global.chrome;
  global.document = realm.context.document;
  global.chrome = { dom: { openOrClosedShadowRoot: openClosedShadow } };
  try {
    const first = await new Promise((resolve) => {
      controller.handleMessage({
        type: 'sync-main',
        token: 'token-aaaaaaaaaaaaaaa',
        state: { locked: true, blockMediaKeys: true, guardVolume: true }
      }, { tab: { id: 3 } }, resolve);
    });
    assert.equal(first.ok, true);
    assert.equal(chrome.scripts.at(-1).world, 'ISOLATED');
    assert.equal(api.getState().locked, true);
    assert.equal(api.update(guess, 'token-aaaaaaaaaaaaaaa', { locked: false }), false);

    sessionStore.ytlRuntimeSecret = 'ab'.repeat(32);
    const second = await new Promise((resolve) => {
      controller.handleMessage({
        type: 'sync-main',
        token: 'token-bbbbbbbbbbbbbbb',
        state: { locked: false, blockMediaKeys: false, guardVolume: false }
      }, { tab: { id: 3 } }, resolve);
    });
    assert.equal(second.ok, true);
    assert.equal(api.getState().locked, false);
    assert.equal(api.getState().blockMediaKeys, false);
    assert.equal(realm.context.__YTL_FACTORIES__, undefined);
  } finally {
    global.document = previousDocument;
    global.chrome = previousChrome;
  }
});

test('navigation away from YouTube clears the badge', async () => {
  const chrome = createChrome();
  const controller = createBackgroundController({ chrome });
  controller.tabState.set(5, { locked: true });
  await controller.handleTabUpdated(5, { status: 'loading' }, { url: 'https://example.com/' });
  assert.equal(controller.tabState.get(5), null);
  await controller.handleTabUpdated(6, { status: 'loading' }, { url: 'https://www.youtube.com/watch?v=1' });
  assert.equal(controller.tabState.get(6), null);
});
