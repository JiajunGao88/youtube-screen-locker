(function (root) {
  var ISOLATED_FILES = Object.freeze([
    'lib/constants.js',
    'lib/platform.js',
    'lib/hostname.js',
    'lib/settings.js',
    'lib/hold-unlock.js',
    'lib/event-guard.js',
    'lib/fullscreen-lock.js',
    'lib/hud.js',
    'lib/screen-locker.js',
    'content.js'
  ]);

  var MAIN_FILES = Object.freeze([
    'lib/media-session-guard.js',
    'lib/video-guard.js',
    'main-world-guard.js'
  ]);

  var api = {
    ISOLATED_FILES: ISOLATED_FILES,
    MAIN_FILES: MAIN_FILES
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
