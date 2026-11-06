(function (root) {
  // Duplicate of lib/constants.js SEAL. Intentionally not copied onto the page
  // global: only module.exports (Node tests) and this closure can see it.
  var SEAL = 'yt-screen-locker-v2::7c2e9a4b-1d6f-4e8a-9b3c';
  var ACTIONS = Object.freeze([
    'play',
    'pause',
    'stop',
    'previoustrack',
    'nexttrack',
    'seekbackward',
    'seekforward',
    'seekto'
  ]);
  var NOOP = function ytScreenLockerMediaNoop() {};

  function createMediaSessionGuard(mediaSession, options) {
    var opts = options || {};
    var doc = opts.document || null;
    var lateInjected = typeof opts.lateInjected === 'boolean'
      ? opts.lateInjected
      : !!(doc && doc.readyState && doc.readyState !== 'loading');
    var saved = new Map();
    var overridden = new Set();
    var installed = new Map();
    var locked = false;
    var blockMediaKeys = true;
    var orig = null;

    function moviePlayer() {
      if (!doc || typeof doc.getElementById !== 'function') return null;
      return doc.getElementById('movie_player');
    }

    function activeVideo() {
      var movie = moviePlayer();
      if (movie && typeof movie.querySelector === 'function') {
        var nested = movie.querySelector('video');
        if (nested) return nested;
      }
      if (doc && typeof doc.querySelector === 'function') return doc.querySelector('video');
      return null;
    }

    function callPlayer(method) {
      var player = moviePlayer();
      if (player && typeof player[method] === 'function') {
        player[method]();
        return true;
      }
      return false;
    }

    function bridgeHandler(action) {
      if (action === 'stop') return null;
      return function ytScreenLockerBridge(details) {
        var info = details || {};
        if (action === 'play') {
          if (!callPlayer('playVideo')) {
            var playing = activeVideo();
            if (playing && typeof playing.play === 'function') playing.play();
          }
          return;
        }
        if (action === 'pause') {
          if (!callPlayer('pauseVideo')) {
            var pausing = activeVideo();
            if (pausing && typeof pausing.pause === 'function') pausing.pause();
          }
          return;
        }
        if (action === 'nexttrack') {
          callPlayer('nextVideo');
          return;
        }
        if (action === 'previoustrack') {
          callPlayer('previousVideo');
          return;
        }
        var video = activeVideo();
        if (!video) return;
        if (action === 'seekbackward') {
          video.currentTime = video.currentTime - (info.seekOffset || 10);
        } else if (action === 'seekforward') {
          video.currentTime = video.currentTime + (info.seekOffset || 10);
        } else if (action === 'seekto' && typeof info.seekTime === 'number') {
          video.currentTime = info.seekTime;
        }
      };
    }

    if (mediaSession && typeof mediaSession.setActionHandler === 'function') {
      orig = mediaSession.setActionHandler.bind(mediaSession);
      var patched = function ytScreenLockerSetActionHandler(action, handler) {
        saved.set(action, handler);
        if (locked && blockMediaKeys && ACTIONS.indexOf(action) !== -1) {
          installed.set(action, NOOP);
          return orig(action, NOOP);
        }
        installed.set(action, handler);
        return orig(action, handler);
      };
      patched.ytScreenLocker = true;
      try {
        Object.defineProperty(mediaSession, 'setActionHandler', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: patched
        });
      } catch (err) {
        mediaSession.setActionHandler = patched;
      }
    }

    function safeSet(action, handler) {
      if (!orig) return;
      try {
        installed.set(action, handler);
        orig(action, handler);
      } catch (err) {
        // The browser rejects unknown actions; ignore and keep going.
      }
    }

    function apply() {
      if (!orig) return;
      if (locked && blockMediaKeys) {
        for (var i = 0; i < ACTIONS.length; i++) {
          overridden.add(ACTIONS[i]);
          safeSet(ACTIONS[i], NOOP);
        }
        return;
      }
      for (var j = 0; j < ACTIONS.length; j++) {
        var action = ACTIONS[j];
        if (saved.has(action)) {
          safeSet(action, saved.get(action));
        } else if (overridden.has(action)) {
          safeSet(action, lateInjected ? bridgeHandler(action) : null);
        }
      }
    }

    function setActive(nextLocked, nextBlock) {
      locked = !!nextLocked;
      blockMediaKeys = nextBlock !== false;
      apply();
    }

    function reassert() {
      if (locked && blockMediaKeys) apply();
    }

    return {
      setActive: setActive,
      reassert: reassert,
      noop: NOOP,
      getInstalled: function (action) { return installed.get(action); },
      getSaved: function (action) { return saved.has(action) ? saved.get(action) : undefined; }
    };
  }

  function createMainController(options) {
    var opts = options || {};
    var sessionGuard = createMediaSessionGuard(opts.mediaSession, {
      document: opts.document,
      lateInjected: opts.lateInjected
    });
    var videoFactory = opts.createVideoGuard;
    var videoGuard = videoFactory
      ? videoFactory({ document: opts.document, view: opts.view || root })
      : { setState: function () {}, scan: function () {} };
    var armedToken = null;
    var state = { locked: false, blockMediaKeys: true, guardVolume: false };

    function ensureArmed(seal, token) {
      if (seal !== SEAL) return false;
      if (typeof token !== 'string' || token.length < 16) return false;
      if (armedToken == null) {
        armedToken = token;
        return true;
      }
      return armedToken === token;
    }

    function update(seal, token, next) {
      if (!ensureArmed(seal, token)) return false;
      if (!next || typeof next !== 'object') return false;
      state = {
        locked: !!next.locked,
        blockMediaKeys: next.blockMediaKeys !== false,
        guardVolume: !!next.guardVolume && !!next.locked
      };
      sessionGuard.setActive(state.locked, state.blockMediaKeys);
      try {
        videoGuard.setState(state);
        videoGuard.scan();
      } catch (err) {
        // A broken player node should not wedge the media-key guard.
      }
      return true;
    }

    function handleExternalEvent(detail) {
      if (!detail || typeof detail !== 'object') return false;
      return update(detail.seal, detail.token, detail.state);
    }

    function getState() {
      return {
        locked: state.locked,
        blockMediaKeys: state.blockMediaKeys,
        guardVolume: state.guardVolume
      };
    }

    return {
      ensureArmed: ensureArmed,
      update: update,
      handleExternalEvent: handleExternalEvent,
      getState: getState,
      sessionGuard: sessionGuard,
      videoGuard: videoGuard
    };
  }

  var api = {
    SEAL: SEAL,
    ACTIONS: ACTIONS,
    createMediaSessionGuard: createMediaSessionGuard,
    createMainController: createMainController
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  var existing = root.__YTL_FACTORIES__ || {};
  var next = Object.assign({}, existing, {
    createMediaSessionGuard: createMediaSessionGuard,
    createMainController: createMainController,
    MEDIA_ACTIONS: ACTIONS
  });
  try {
    Object.defineProperty(root, '__YTL_FACTORIES__', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: next
    });
  } catch (err) {
    if (root.__YTL_FACTORIES__) Object.assign(root.__YTL_FACTORIES__, next);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
