(function (root) {
  // Keep this seal identical to lib/media-session-guard.js.
  // It lives in the extension origin only. The MAIN-world file duplicates the
  // string inside a closure and must not copy it onto the page global.
  var SEAL = 'yt-screen-locker-v2::7c2e9a4b-1d6f-4e8a-9b3c';
  var HOLD_MS = 1000;
  var HUD_VISIBLE_MS = 4000;
  var TOGGLE_DEBOUNCE_MS = 400;
  var BADGE_TEXT = 'LOCK';
  var BADGE_COLOR = '#e11d48';
  var HUD_Z_INDEX = '2147483647';
  var YOUTUBE_HOST_PERMISSION = '*://*.youtube.com/*';
  var api = {
    SEAL: SEAL,
    HOLD_MS: HOLD_MS,
    HUD_VISIBLE_MS: HUD_VISIBLE_MS,
    TOGGLE_DEBOUNCE_MS: TOGGLE_DEBOUNCE_MS,
    BADGE_TEXT: BADGE_TEXT,
    BADGE_COLOR: BADGE_COLOR,
    HUD_Z_INDEX: HUD_Z_INDEX,
    YOUTUBE_HOST_PERMISSION: YOUTUBE_HOST_PERMISSION
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
