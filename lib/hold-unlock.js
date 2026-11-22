(function (root) {
  var DEFAULT_DURATION = (root.YTLock && root.YTLock.HOLD_MS) || 1000;

  function createHoldUnlock(options) {
    var opts = options || {};
    var durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : DEFAULT_DURATION;
    var now = opts.now || function () { return Date.now(); };
    var schedule = opts.schedule || function (fn, ms) { return setTimeout(fn, ms); };
    var clear = opts.clear || function (id) { clearTimeout(id); };
    var onProgress = opts.onProgress || function () {};
    var onComplete = opts.onComplete || function () {};
    var timer = null;
    var active = false;
    var start = 0;

    function getProgress() {
      if (!active) return 0;
      if (durationMs <= 0) return 1;
      return Math.min(1, Math.max(0, (now() - start) / durationMs));
    }

    function startHold() {
      if (active) return false;
      active = true;
      start = now();
      onProgress(0);
      timer = schedule(function () {
        active = false;
        timer = null;
        onProgress(1);
        onComplete();
      }, durationMs);
      return true;
    }

    function cancel() {
      if (!active) return false;
      active = false;
      if (timer != null) clear(timer);
      timer = null;
      onProgress(0);
      return true;
    }

    return {
      startHold: startHold,
      cancel: cancel,
      isActive: function () { return active; },
      getProgress: getProgress
    };
  }

  var api = { createHoldUnlock: createHoldUnlock };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
