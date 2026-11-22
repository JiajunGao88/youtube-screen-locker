(function () {
  if (globalThis.__YT_SCREEN_LOCKER_ISOLATED_READY__) return;
  globalThis.__YT_SCREEN_LOCKER_ISOLATED_READY__ = true;

  var locker = YTLock.createScreenLocker({
    document: document,
    window: window,
    navigator: navigator,
    chrome: chrome
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    try {
      return locker.handleMessage(message, sendResponse);
    } catch (err) {
      try {
        sendResponse({ ok: false, error: String(err && err.message || err) });
      } catch (sendErr) {
        // The port may already be closed.
      }
      return false;
    }
  });
})();
