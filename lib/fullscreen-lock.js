(function (root) {
  function findFullscreenTarget(doc) {
    if (!doc) return null;
    return (
      (doc.getElementById && doc.getElementById('movie_player')) ||
      (doc.querySelector && doc.querySelector('ytd-player')) ||
      (doc.querySelector && doc.querySelector('#shorts-player')) ||
      doc.documentElement ||
      null
    );
  }

  function selectHudParent(fullscreenElement, body) {
    return fullscreenElement || body || null;
  }

  function createFullscreenLock(options) {
    var opts = options || {};
    var getFullscreenElement = opts.getFullscreenElement || function () { return null; };
    var keyboard = opts.keyboard || null;
    var deepActive = false;

    function isDeepActive() {
      return deepActive;
    }

    async function tryLock() {
      if (!keyboard || typeof keyboard.lock !== 'function') {
        deepActive = false;
        return { ok: false, reason: 'unavailable' };
      }
      if (!getFullscreenElement()) {
        deepActive = false;
        return { ok: false, reason: 'not-fullscreen' };
      }
      try {
        await keyboard.lock();
        deepActive = true;
        return { ok: true };
      } catch (err) {
        deepActive = false;
        return { ok: false, reason: (err && err.name) || 'error' };
      }
    }

    function release() {
      deepActive = false;
      if (keyboard && typeof keyboard.unlock === 'function') {
        try {
          keyboard.unlock();
        } catch (err) {
          // Already unlocked, or the browser dropped the lock with fullscreen.
        }
      }
    }

    function handleFullscreenChange() {
      if (!getFullscreenElement()) {
        var wasDeep = deepActive;
        release();
        return { exited: true, wasDeep: wasDeep, deepActive: false };
      }
      return { exited: false, wasDeep: deepActive, deepActive: deepActive };
    }

    return {
      tryLock: tryLock,
      release: release,
      handleFullscreenChange: handleFullscreenChange,
      isDeepActive: isDeepActive
    };
  }

  var api = {
    findFullscreenTarget: findFullscreenTarget,
    selectHudParent: selectHudParent,
    createFullscreenLock: createFullscreenLock
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
