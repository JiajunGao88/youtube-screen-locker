(function (root) {
  var REQUIRED_POINTER_EVENTS = Object.freeze([
    'click',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'dblclick',
    'contextmenu',
    'auxclick',
    'dragstart',
    'touchstart',
    'touchend',
    'touchmove',
    'wheel',
    'selectstart'
  ]);

  var EXTRA_POINTER_EVENTS = Object.freeze([
    'pointermove',
    'pointercancel',
    'mousemove',
    'mouseover',
    'pointerover'
  ]);

  var MONITORED_POINTER_EVENTS = Object.freeze(
    REQUIRED_POINTER_EVENTS.concat(EXTRA_POINTER_EVENTS)
  );

  var NON_PASSIVE_POINTER_EVENTS = Object.freeze([
    'wheel',
    'touchstart',
    'touchmove',
    'touchend',
    'pointermove',
    'mousemove'
  ]);

  var KEYBOARD_EVENT_TYPES = Object.freeze([
    'keydown',
    'keyup',
    'keypress',
    'beforeinput'
  ]);

  // Representative YouTube shortcut surface. The locker blocks every key while
  // locked; this list is the minimum the tests and the HUD promise cover.
  var YOUTUBE_SHORTCUT_KEYS = Object.freeze([
    ' ', 'k', 'j', 'l', 'f', 'm', 'c', 't', 'i',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', '/', 'Escape',
    'MediaPlayPause', 'MediaTrackNext', 'MediaTrackPrevious',
    'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute',
    'Meta', 'MetaLeft', 'MetaRight'
  ]);

  function isLKey(event) {
    if (!event) return false;
    var key = String(event.key || '').toLowerCase();
    if (key === 'l') return true;
    return event.code === 'KeyL';
  }

  function isUnlockShortcut(event, isMac) {
    if (!isLKey(event)) return false;
    if (!event.shiftKey || event.altKey) return false;
    if (isMac) return !!event.metaKey && !event.ctrlKey;
    return !!event.ctrlKey && !event.metaKey;
  }

  function evaluateKeyboardEvent(event, options) {
    var opts = options || {};
    var unlock = isUnlockShortcut(event, !!opts.isMac);
    if (!opts.locked) {
      return { block: false, isUnlock: unlock };
    }
    if (unlock) {
      return { block: true, isUnlock: true };
    }
    return { block: true, isUnlock: false };
  }

  function isMonitoredPointerEvent(type) {
    return MONITORED_POINTER_EVENTS.indexOf(type) !== -1;
  }

  function classifyPointerEvent(type, options) {
    var opts = options || {};
    if (!opts.locked || !isMonitoredPointerEvent(type)) {
      return { stop: false, onUnlockControl: false };
    }
    if (opts.onUnlockControl) {
      return { stop: true, onUnlockControl: true };
    }
    return { stop: true, onUnlockControl: false };
  }

  var api = {
    REQUIRED_POINTER_EVENTS: REQUIRED_POINTER_EVENTS,
    MONITORED_POINTER_EVENTS: MONITORED_POINTER_EVENTS,
    NON_PASSIVE_POINTER_EVENTS: NON_PASSIVE_POINTER_EVENTS,
    KEYBOARD_EVENT_TYPES: KEYBOARD_EVENT_TYPES,
    YOUTUBE_SHORTCUT_KEYS: YOUTUBE_SHORTCUT_KEYS,
    isUnlockShortcut: isUnlockShortcut,
    evaluateKeyboardEvent: evaluateKeyboardEvent,
    classifyPointerEvent: classifyPointerEvent
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
