(function (root) {
  function isMissingReceiverError(err) {
    var msg = String((err && (err.message || err)) || '');
    return /Receiving end does not exist|Could not establish connection|message port closed/i.test(msg);
  }

  async function ensureTabScripts(options) {
    var opts = options || {};
    var tabId = opts.tabId;
    try {
      var res = await opts.ping(tabId);
      if (res && res.ok) return { ok: true, injected: false };
    } catch (err) {
      if (!isMissingReceiverError(err)) {
        // Still try to inject. A dead content script is the common failure.
      }
    }
    await opts.injectMain(tabId);
    await opts.injectIsolated(tabId);
    return { ok: true, injected: true };
  }

  var api = {
    isMissingReceiverError: isMissingReceiverError,
    ensureTabScripts: ensureTabScripts
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
