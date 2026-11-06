(function (root) {
  function createVideoGuard(options) {
    var opts = options || {};
    var view = opts.view || root;
    var doc = opts.document || (view && view.document) || null;
    var locked = false;
    var guardVolume = false;
    var blockMediaKeys = true;
    var restoring = false;
    var watched = new Set();
    var baselines = new WeakMap();
    var protoPatched = false;
    var origPause = null;
    var origPlay = null;
    var volDesc = null;
    var mutedDesc = null;

    function isVideo(node) {
      return !!node && String(node.tagName || '').toUpperCase() === 'VIDEO';
    }

    function currentSrc(video) {
      return video.currentSrc || video.src || '';
    }

    function capture(video) {
      return {
        volume: video.volume,
        muted: !!video.muted,
        src: currentSrc(video),
        wasPlaying: !video.paused && !video.ended && (video.readyState == null || video.readyState >= 2)
      };
    }

    function baseline(video) {
      var existing = baselines.get(video);
      if (!existing) {
        existing = capture(video);
        baselines.set(video, existing);
      }
      return existing;
    }

    function shouldGuard(video) {
      return locked && guardVolume && isVideo(video);
    }

    function shouldBlockPause(video) {
      if (restoring || !locked || !blockMediaKeys || !isVideo(video)) return false;
      if (video.ended) return false;
      if (typeof video.readyState === 'number' && video.readyState < 2) return false;
      var saved = baselines.get(video);
      if (!saved) return false;
      var src = currentSrc(video);
      if (src !== saved.src) {
        var fresh = capture(video);
        fresh.src = src;
        fresh.wasPlaying = false;
        baselines.set(video, fresh);
        return false;
      }
      return !!saved.wasPlaying;
    }

    function resume(video) {
      if (!origPlay || restoring) return;
      restoring = true;
      try {
        var ret = origPlay.call(video);
        if (ret && typeof ret.catch === 'function') ret.catch(function () {});
      } catch (err) {
        // Autoplay rejection is non-fatal; the next real play event refreshes state.
      } finally {
        restoring = false;
      }
    }

    function onPause(event) {
      var video = event && event.target;
      if (!video || restoring) return;
      if (!shouldBlockPause(video)) return;
      resume(video);
    }

    function onPlay(event) {
      var video = event && event.target;
      if (!video || !isVideo(video)) return;
      var saved = baseline(video);
      saved.wasPlaying = !video.ended;
      saved.src = currentSrc(video);
      baselines.set(video, saved);
    }

    function onEmptied(event) {
      var video = event && event.target;
      if (!video || !isVideo(video)) return;
      var fresh = capture(video);
      fresh.wasPlaying = false;
      baselines.set(video, fresh);
    }

    function onVolume(event) {
      var video = event && event.target;
      if (!video || restoring || !shouldGuard(video)) return;
      var saved = baselines.get(video);
      if (!saved) return;
      if (video.volume === saved.volume && !!video.muted === !!saved.muted) return;
      restoring = true;
      try {
        video.volume = saved.volume;
        video.muted = !!saved.muted;
      } finally {
        restoring = false;
      }
    }

    function listen(video, type, fn) {
      if (video && typeof video.addEventListener === 'function') {
        video.addEventListener(type, fn);
      }
    }

    function watch(video) {
      if (!isVideo(video) || watched.has(video)) return;
      watched.add(video);
      baseline(video);
      listen(video, 'pause', onPause);
      listen(video, 'play', onPlay);
      listen(video, 'emptied', onEmptied);
      listen(video, 'loadeddata', onEmptied);
      listen(video, 'volumechange', onVolume);
    }

    function patchPrototype() {
      if (protoPatched) return;
      var Ctor = view && view.HTMLMediaElement;
      var proto = Ctor && Ctor.prototype;
      if (!proto || proto.__ytScreenLockerPatched) {
        protoPatched = true;
        return;
      }
      volDesc = Object.getOwnPropertyDescriptor(proto, 'volume');
      mutedDesc = Object.getOwnPropertyDescriptor(proto, 'muted');
      origPause = proto.pause;
      origPlay = proto.play;

      if (volDesc && volDesc.set && volDesc.get) {
        Object.defineProperty(proto, 'volume', {
          configurable: true,
          enumerable: volDesc.enumerable,
          get: function () { return volDesc.get.call(this); },
          set: function (value) {
            if (shouldGuard(this) && !restoring) return;
            return volDesc.set.call(this, value);
          }
        });
      }
      if (mutedDesc && mutedDesc.set && mutedDesc.get) {
        Object.defineProperty(proto, 'muted', {
          configurable: true,
          enumerable: mutedDesc.enumerable,
          get: function () { return mutedDesc.get.call(this); },
          set: function (value) {
            if (shouldGuard(this) && !restoring) return;
            return mutedDesc.set.call(this, value);
          }
        });
      }
      if (typeof origPause === 'function') {
        proto.pause = function ytScreenLockerPause() {
          if (restoring) return;
          if (shouldBlockPause(this)) {
            resume(this);
            return;
          }
          return origPause.apply(this, arguments);
        };
      }
      try {
        Object.defineProperty(proto, '__ytScreenLockerPatched', { value: true });
      } catch (err) {
        proto.__ytScreenLockerPatched = true;
      }
      protoPatched = true;
    }

    function scan() {
      if (!doc || typeof doc.querySelectorAll !== 'function') return;
      var nodes = doc.querySelectorAll('video');
      for (var i = 0; i < nodes.length; i++) watch(nodes[i]);
    }

    function setState(next) {
      var wasLocked = locked;
      var incoming = next || {};
      locked = !!incoming.locked;
      guardVolume = !!incoming.guardVolume && locked;
      blockMediaKeys = incoming.blockMediaKeys !== false;
      if (locked && !wasLocked) {
        watched.forEach(function (video) {
          baselines.set(video, capture(video));
        });
      }
    }

    patchPrototype();
    scan();

    if (typeof view.MutationObserver === 'function' && doc && (doc.documentElement || doc.body)) {
      var scheduled = false;
      var observer = new view.MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        var schedule = view.requestAnimationFrame
          ? function (fn) { return view.requestAnimationFrame(fn); }
          : function (fn) { return setTimeout(fn, 50); };
        schedule(function () {
          scheduled = false;
          scan();
        });
      });
      try {
        observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true });
      } catch (err) {
        // Documents without a root yet are scanned on the next state push.
      }
    }

    return {
      watch: watch,
      scan: scan,
      setState: setState,
      shouldBlockPause: shouldBlockPause,
      baseline: baseline
    };
  }

  var api = { createVideoGuard: createVideoGuard };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }
  var existing = root.__YTL_FACTORIES__ || {};
  var next = Object.assign({}, existing, { createVideoGuard: createVideoGuard });
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
