(function (root) {
  function deps() {
    if (typeof module !== 'undefined' && module.exports) {
      return Object.assign(
        {},
        require('./constants'),
        require('./hostname'),
        require('./settings'),
        require('./script-files'),
        require('./tab-state'),
        require('./inject')
      );
    }
    return root.YTLock;
  }

  function createBackgroundController(options) {
    var lib = deps();
    var chromeApi = (options && options.chrome) || root.chrome;
    var tabState = lib.createTabStateStore();
    var memorySecret = null;

    function randomSecret() {
      var cryptoApi = root.crypto;
      if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
        var bytes = new Uint8Array(32);
        cryptoApi.getRandomValues(bytes);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
          var piece = bytes[i].toString(16);
          hex += piece.length === 1 ? '0' + piece : piece;
        }
        return hex;
      }
      return 'ytl-' + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + Date.now().toString(16);
    }

    async function getRuntimeSecret() {
      var session = chromeApi.storage && chromeApi.storage.session;
      try {
        if (session && typeof session.get === 'function') {
          var stored = await session.get('ytlRuntimeSecret');
          var existing = stored && stored.ytlRuntimeSecret;
          if (typeof existing === 'string' && existing.length >= 32) return existing;
          var created = randomSecret();
          if (typeof session.set === 'function') await session.set({ ytlRuntimeSecret: created });
          return created;
        }
      } catch (err) {
        // session storage is unavailable; keep an in-memory secret for this worker.
      }
      if (!memorySecret) memorySecret = randomSecret();
      return memorySecret;
    }

    function applyBadge(tabId, locked) {
      if (!chromeApi || !chromeApi.action || tabId == null) return Promise.resolve();
      var textPromise = chromeApi.action.setBadgeText({
        text: locked ? lib.BADGE_TEXT : '',
        tabId: tabId
      });
      var colorPromise = locked
        ? chromeApi.action.setBadgeBackgroundColor({ color: lib.BADGE_COLOR, tabId: tabId })
        : Promise.resolve();
      return Promise.all([textPromise, colorPromise]).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
    }

    function clearTab(tabId) {
      tabState.delete(tabId);
      return applyBadge(tabId, false);
    }

    async function injectFiles(tabId, files, world) {
      return chromeApi.scripting.executeScript({
        target: { tabId: tabId },
        files: files.slice(),
        world: world,
        injectImmediately: true
      });
    }

    async function ensureTab(tabId) {
      return lib.ensureTabScripts({
        tabId: tabId,
        ping: function (id) {
          return chromeApi.tabs.sendMessage(id, { action: 'ping' });
        },
        injectMain: function (id) {
          return injectFiles(id, lib.MAIN_FILES, 'MAIN');
        },
        injectIsolated: function (id) {
          return injectFiles(id, lib.ISOLATED_FILES, 'ISOLATED');
        }
      });
    }

    async function syncMain(tabId, message) {
      if (!chromeApi || !chromeApi.scripting || tabId == null) {
        return { ok: false, reason: 'no-scripting' };
      }
      var payload = message || {};
      var secret = await getRuntimeSecret();
      var last = { ok: false, reason: 'no-guard' };
      for (var attempt = 0; attempt < 4; attempt++) {
        try {
          var results = await chromeApi.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            injectImmediately: true,
            func: mainGuardApply,
            args: [secret, payload.token, payload.state]
          });
          var result = results && results[0] && results[0].result;
          if (result && result.ok) return result;
          last = result || last;
          if (last && last.reason === 'rejected') return last;
        } catch (err) {
          last = { ok: false, reason: String(err && err.message || err) };
        }
        if (attempt < 3) {
          await new Promise(function (resolve) { setTimeout(resolve, 40 * (attempt + 1)); });
        }
      }
      return last;
    }

    async function activeYouTubeTab() {
      var tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
      var tab = tabs && tabs[0];
      if (!tab || !lib.isYouTubeUrl(tab.url)) return null;
      return tab;
    }

    async function sendTab(tabId, message) {
      try {
        return await chromeApi.tabs.sendMessage(tabId, message);
      } catch (err) {
        if (!lib.isMissingReceiverError(err)) throw err;
        await ensureTab(tabId);
        return chromeApi.tabs.sendMessage(tabId, message);
      }
    }

    async function handleCommand(command) {
      if (command !== 'toggle-lock') return { ok: false, reason: 'ignored' };
      var tab = await activeYouTubeTab();
      if (!tab) return { ok: false, reason: 'not-youtube' };
      await ensureTab(tab.id);
      var response = await sendTab(tab.id, { action: 'toggleLock' });
      if (response && typeof response.locked === 'boolean') {
        tabState.set(tab.id, { locked: response.locked, deepActive: !!response.deepActive });
        await applyBadge(tab.id, response.locked);
      }
      return response || { ok: false };
    }

    function handleMessage(message, sender, sendResponse) {
      if (!message || typeof message !== 'object') return false;
      if (message.type === 'lock-state') {
        var tabId = sender && sender.tab && sender.tab.id;
        var snapshot = message.state || message;
        if (tabId != null) {
          tabState.set(tabId, {
            locked: !!snapshot.locked,
            deepActive: !!snapshot.deepActive
          });
          applyBadge(tabId, !!snapshot.locked);
        }
        return false;
      }
      if (message.type === 'sync-main') {
        var syncTabId = sender && sender.tab && sender.tab.id;
        syncMain(syncTabId, message).then(function (result) {
          sendResponse(result);
        }, function (err) {
          sendResponse({ ok: false, reason: String(err && err.message || err) });
        });
        return true;
      }
      if (message.type === 'ensure-tab') {
        ensureTab(message.tabId).then(function (result) {
          sendResponse(result);
        }, function (err) {
          sendResponse({ ok: false, reason: String(err && err.message || err) });
        });
        return true;
      }
      return false;
    }

    async function handleInstalled() {
      var defaults = lib.normalizeSettings(lib.DEFAULT_SETTINGS);
      try {
        var stored = await chromeApi.storage.local.get(lib.DEFAULT_SETTINGS);
        defaults = lib.normalizeSettings(stored);
      } catch (err) {
        defaults = lib.normalizeSettings(null);
      }
      try {
        await chromeApi.storage.local.set(defaults);
      } catch (err) {
        // Storage can be briefly unavailable during startup.
      }
      try {
        await chromeApi.storage.local.remove('isLocked');
      } catch (err) {
        // Legacy key cleanup is best-effort.
      }
      var tabs = [];
      try {
        tabs = await chromeApi.tabs.query({ url: [lib.YOUTUBE_HOST_PERMISSION] });
      } catch (err) {
        tabs = [];
      }
      for (var i = 0; i < tabs.length; i++) {
        try {
          await ensureTab(tabs[i].id);
        } catch (err) {
          // A discarded tab should not abort injection of the others.
        }
      }
      return { tabs: tabs.length };
    }

    function handleTabRemoved(tabId) {
      return clearTab(tabId);
    }

    function handleTabUpdated(tabId, info, tab) {
      if (!info || info.status !== 'loading') return Promise.resolve(false);
      var url = (tab && (tab.url || tab.pendingUrl)) || info.url || '';
      if (url && !lib.isYouTubeUrl(url)) return clearTab(tabId);
      return Promise.resolve(false);
    }

    return {
      ensureTab: ensureTab,
      handleCommand: handleCommand,
      handleMessage: handleMessage,
      handleInstalled: handleInstalled,
      handleTabRemoved: handleTabRemoved,
      handleTabUpdated: handleTabUpdated,
      syncMain: syncMain,
      tabState: tabState,
      applyBadge: applyBadge
    };
  }

  function mainGuardApply(secret, token, state) {
    var slot = globalThis.__YTL_FACTORIES__;
    if (!slot || typeof slot.rebindMainGuard !== 'function') {
      return { ok: false, reason: 'no-guard' };
    }
    return slot.rebindMainGuard(secret, token, state);
  }

  var api = {
    createBackgroundController: createBackgroundController,
    mainGuardApply: mainGuardApply
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
