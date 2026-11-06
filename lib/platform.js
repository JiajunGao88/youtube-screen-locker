(function (root) {
  function isMacPlatform(nav) {
    var platform = '';
    if (nav) {
      if (nav.userAgentData && nav.userAgentData.platform) {
        platform = String(nav.userAgentData.platform);
      } else if (nav.platform) {
        platform = String(nav.platform);
      } else if (nav.userAgent) {
        platform = String(nav.userAgent);
      }
    }
    return /mac|iphone|ipad/i.test(platform);
  }

  function shortcutLabel(isMac) {
    return isMac ? '⌘+Shift+L' : 'Ctrl+Shift+L';
  }

  function shortcutHint(isMac) {
    return isMac ? '⌘ + Shift + L' : 'Ctrl + Shift + L';
  }

  var api = {
    isMacPlatform: isMacPlatform,
    shortcutLabel: shortcutLabel,
    shortcutHint: shortcutHint
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
