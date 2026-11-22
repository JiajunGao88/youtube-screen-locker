(function (root) {
  var HOLD_MS = 1000;
  var HUD_VISIBLE_MS = 4000;
  // A cold MV3 service worker can deliver chrome.commands long after the
  // content-script keydown already toggled. Suppress that echo, but not a
  // later intentional press. Deep Lock does the reverse: keyboard.lock()
  // delivers the chord to the page after the command may already have run.
  var COMMAND_AFTER_KEY_MS = 1500;
  var KEY_AFTER_COMMAND_MS = 600;
  var SAME_GESTURE_MS = 250;
  var BADGE_TEXT = 'LOCK';
  var BADGE_COLOR = '#e11d48';
  var HUD_Z_INDEX = '2147483647';
  var YOUTUBE_HOST_PERMISSION = '*://*.youtube.com/*';
  var api = {
    HOLD_MS: HOLD_MS,
    HUD_VISIBLE_MS: HUD_VISIBLE_MS,
    COMMAND_AFTER_KEY_MS: COMMAND_AFTER_KEY_MS,
    KEY_AFTER_COMMAND_MS: KEY_AFTER_COMMAND_MS,
    SAME_GESTURE_MS: SAME_GESTURE_MS,
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
