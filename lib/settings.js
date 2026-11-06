(function (root) {
  var DEFAULT_SETTINGS = Object.freeze({
    deepLock: true,
    blockMediaKeys: true,
    showPlayerButton: true
  });

  var SETTING_KEYS = Object.freeze(['deepLock', 'blockMediaKeys', 'showPlayerButton']);

  function normalizeSettings(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    function flag(key) {
      if (!Object.prototype.hasOwnProperty.call(src, key) || src[key] == null) return true;
      return src[key] !== false && src[key] !== 'false' && src[key] !== 0;
    }
    return {
      deepLock: flag('deepLock'),
      blockMediaKeys: flag('blockMediaKeys'),
      showPlayerButton: flag('showPlayerButton')
    };
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SETTING_KEYS: SETTING_KEYS,
    normalizeSettings: normalizeSettings
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
