(function (root) {
  function derivePopupView(input) {
    var data = input || {};
    var isYouTube = !!data.isYouTube;
    var state = data.state || null;
    var isMac = !!data.isMac;
    var locked = !!(state && state.locked);
    var deep = !!(state && state.deepActive);
    var status = 'Open a YouTube tab';
    var tone = 'idle';
    if (isYouTube) {
      if (!state) {
        status = 'Connecting…';
        tone = 'idle';
      } else if (deep) {
        status = 'Deep Locked';
        tone = 'deep';
      } else if (locked) {
        status = 'Locked';
        tone = 'locked';
      } else {
        status = 'Unlocked';
        tone = 'open';
      }
    }
    var settings = (state && state.settings) || data.settings || {
      deepLock: true,
      blockMediaKeys: true,
      showPlayerButton: true
    };
    return {
      status: status,
      tone: tone,
      lockLabel: locked ? 'Unlock Screen' : 'Lock Screen',
      lockDisabled: !isYouTube || !state,
      deepLabel: deep ? 'Deep Lock Active' : 'Deep Lock (Fullscreen)',
      deepDisabled: !isYouTube || !state || deep,
      shortcut: isMac ? '⌘ + Shift + L' : 'Ctrl + Shift + L',
      settings: {
        deepLock: settings.deepLock !== false,
        blockMediaKeys: settings.blockMediaKeys !== false,
        showPlayerButton: settings.showPlayerButton !== false
      },
      needsGesture: !!(state && state.needsGesture)
    };
  }

  var api = { derivePopupView: derivePopupView };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
