importScripts(
  'lib/constants.js',
  'lib/platform.js',
  'lib/hostname.js',
  'lib/settings.js',
  'lib/script-files.js',
  'lib/tab-state.js',
  'lib/inject.js',
  'lib/background-controller.js'
);

var ytlBackground = YTLock.createBackgroundController({ chrome: chrome });

chrome.commands.onCommand.addListener(function (command) {
  Promise.resolve(ytlBackground.handleCommand(command)).catch(function (err) {
    console.warn('YouTube Screen Locker command failed', err);
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  try {
    return ytlBackground.handleMessage(message, sender, sendResponse);
  } catch (err) {
    try {
      sendResponse({ ok: false, reason: String(err && err.message || err) });
    } catch (sendErr) {
      // Ignore a closed port.
    }
    return false;
  }
});

chrome.runtime.onInstalled.addListener(function () {
  Promise.resolve(ytlBackground.handleInstalled()).catch(function (err) {
    console.warn('YouTube Screen Locker install hook failed', err);
  });
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  Promise.resolve(ytlBackground.handleTabRemoved(tabId)).catch(function () {});
});

chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
  Promise.resolve(ytlBackground.handleTabUpdated(tabId, info, tab)).catch(function () {});
});
