(function (root) {
  function deps() {
    if (typeof module !== 'undefined' && module.exports) {
      return Object.assign(
        {},
        require('./constants'),
        require('./platform'),
        require('./settings'),
        require('./hold-unlock'),
        require('./event-guard'),
        require('./fullscreen-lock'),
        require('./hud')
      );
    }
    return root.YTLock;
  }

  var PLAYER_CSS = [
    '.ytl-lock-btn.ytp-button {',
    '  width: 48px; height: 100%; padding: 0; border: 0; background: transparent;',
    '  color: #fff; opacity: .95; cursor: pointer; display: inline-flex;',
    '  align-items: center; justify-content: center;',
    '}',
    '.ytl-lock-btn.ytp-button svg { width: 20px; height: 20px; fill: currentColor; pointer-events: none; }',
    '.ytl-lock-btn.ytp-button[data-locked="1"] { color: #ff2d55; }',
    '.ytl-lock-btn.ytp-button:hover { opacity: 1; }'
  ].join('\n');

  function createToken() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }
    return 'ytl-' + Math.random().toString(36).slice(2) + Date.now().toString(36) + '-token';
  }

  function eventPoint(event) {
    var touch = event && event.touches && event.touches[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
    var changed = event && event.changedTouches && event.changedTouches[0];
    if (changed) return { x: changed.clientX, y: changed.clientY };
    return { x: event && event.clientX || 0, y: event && event.clientY || 0 };
  }

  function pointInElement(el, x, y) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    if (el.dataset && el.dataset.ytlActive === '0') return false;
    var rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function inRevealZone(win, x, y) {
    var width = win && typeof win.innerWidth === 'number' ? win.innerWidth : 0;
    var height = win && typeof win.innerHeight === 'number' ? win.innerHeight : 0;
    if (!width || !height) return false;
    return x >= width - 280 && y >= height - 200;
  }

  function trusted(event) {
    return !event || event.isTrusted !== false;
  }

  function createScreenLocker(options) {
    var lib = deps();
    var opts = options || {};
    var doc = opts.document;
    var win = opts.window || root;
    var nav = opts.navigator || (win && win.navigator) || root.navigator || {};
    var chromeApi = opts.chrome || root.chrome;
    var isMac = lib.isMacPlatform(nav);
    var shortcut = lib.shortcutLabel(isMac);
    var settings = lib.normalizeSettings(opts.settings || null);
    var token = opts.token || createToken();
    var clock = opts.clock || null;
    var schedule = clock && clock.schedule ? clock.schedule : function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = clock && clock.clear ? clock.clear : function (id) { clearTimeout(id); };
    var now = clock && clock.now ? clock.now : function () { return Date.now(); };
    var raf = opts.requestAnimationFrame || (win && win.requestAnimationFrame
      ? function (fn) { return win.requestAnimationFrame(fn); }
      : function (fn) { return schedule(fn, 16); });
    var cancelRaf = opts.cancelAnimationFrame || (win && win.cancelAnimationFrame
      ? function (id) { return win.cancelAnimationFrame(id); }
      : function (id) { clearTimer(id); });

    var locked = false;
    var needsGesture = false;
    var lastToggle = -Infinity;
    var hideTimer = null;
    var pulseTimer = null;
    var rafId = null;
    var chipPointer = false;
    var mounted = false;
    var hud = null;
    var playerButtons = [];
    var fullscreen = lib.createFullscreenLock({
      getFullscreenElement: function () { return doc.fullscreenElement || null; },
      keyboard: nav.keyboard || (opts.keyboard || null)
    });

    var hold = lib.createHoldUnlock({
      durationMs: lib.HOLD_MS,
      now: now,
      schedule: schedule,
      clear: clearTimer,
      onProgress: function (value) {
        if (hud) hud.setProgress(value);
      },
      onComplete: function () {
        stopTicker();
        unlock();
      }
    });

    function getState() {
      return {
        ok: true,
        locked: locked,
        deepActive: fullscreen.isDeepActive(),
        needsGesture: needsGesture,
        settings: {
          deepLock: settings.deepLock,
          blockMediaKeys: settings.blockMediaKeys,
          showPlayerButton: settings.showPlayerButton
        },
        shortcut: shortcut
      };
    }

    function publish() {
      var state = getState();
      if (typeof opts.onState === 'function') opts.onState(state);
      if (!chromeApi || !chromeApi.runtime || typeof chromeApi.runtime.sendMessage !== 'function') return;
      try {
        var sent = chromeApi.runtime.sendMessage({ type: 'lock-state', state: state });
        if (sent && typeof sent.catch === 'function') sent.catch(function () {});
      } catch (err) {
        // The service worker may be restarting.
      }
      try {
        var sync = chromeApi.runtime.sendMessage({
          type: 'sync-main',
          token: token,
          state: {
            locked: locked,
            blockMediaKeys: settings.blockMediaKeys !== false,
            guardVolume: locked
          }
        });
        if (sync && typeof sync.catch === 'function') sync.catch(function () {});
      } catch (err) {
        // MAIN-world sync is retried by the service worker.
      }
    }

    function render() {
      if (!hud) return;
      var deep = fullscreen.isDeepActive();
      var fullscreenElement = doc.fullscreenElement || null;
      var showChip = locked && !deep;
      hud.setMode({
        deepActive: deep,
        showChip: showChip,
        chipLabel: fullscreenElement ? 'Enable System Key Shield' : 'Go Fullscreen Deep Lock',
        shortcut: shortcut
      });
      updatePlayerButtonState();
    }

    function reveal(pulse) {
      if (!locked || !hud) return;
      hud.setShown(true);
      if (hideTimer != null) clearTimer(hideTimer);
      hideTimer = schedule(function () {
        if (hold.isActive()) return;
        if (hud) hud.setShown(false);
      }, lib.HUD_VISIBLE_MS);
      if (pulse) {
        hud.pulse();
        if (pulseTimer != null) clearTimer(pulseTimer);
        pulseTimer = schedule(function () {
          if (hud && hud.pill && hud.pill.classList) hud.pill.classList.remove('is-pulsing');
        }, 700);
      }
      render();
    }

    function ensureStyle() {
      if (!doc.getElementById) return;
      if (doc.getElementById('ytl-player-style')) return;
      var style = doc.createElement('style');
      style.id = 'ytl-player-style';
      style.textContent = PLAYER_CSS;
      var parent = doc.head || doc.documentElement || doc.body;
      if (parent) parent.appendChild(style);
    }

    function findControlBars() {
      if (!doc.querySelectorAll) return [];
      var primary = '#movie_player .ytp-right-controls, #shorts-player .ytp-right-controls, ytd-shorts .ytp-right-controls';
      var nodes = Array.prototype.slice.call(doc.querySelectorAll(primary));
      if (!nodes.length) nodes = Array.prototype.slice.call(doc.querySelectorAll('.ytp-right-controls'));
      return nodes;
    }

    function updatePlayerButtonState() {
      for (var i = 0; i < playerButtons.length; i++) {
        var btn = playerButtons[i];
        if (!btn || !btn.isConnected && btn.parentNode == null) continue;
        btn.setAttribute('data-locked', locked ? '1' : '0');
        btn.setAttribute('aria-label', locked ? 'Screen locked' : 'Lock screen');
        btn.title = locked ? 'Screen locked' : 'Lock screen';
      }
    }

    function removePlayerButtons() {
      for (var i = 0; i < playerButtons.length; i++) {
        var btn = playerButtons[i];
        if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      }
      playerButtons = [];
    }

    function ensurePlayerButton() {
      if (!settings.showPlayerButton) {
        removePlayerButtons();
        return;
      }
      ensureStyle();
      var bars = findControlBars();
      for (var i = 0; i < bars.length; i++) {
        var bar = bars[i];
        if (bar.querySelector && bar.querySelector('.ytl-lock-btn')) {
          var existing = bar.querySelector('.ytl-lock-btn');
          if (playerButtons.indexOf(existing) === -1) playerButtons.push(existing);
          continue;
        }
        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'ytp-button ytl-lock-btn';
        btn.setAttribute('aria-label', 'Lock screen');
        btn.innerHTML = hud ? hud.lockSvg : lib.LOCK_SVG;
        btn.addEventListener('click', onPlayerClick, true);
        bar.insertBefore ? bar.insertBefore(btn, bar.firstChild) : bar.appendChild(btn);
        playerButtons.push(btn);
      }
      updatePlayerButtonState();
    }

    function onPlayerClick(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!locked) lock();
    }

    function parentForHud() {
      return lib.selectHudParent(doc.fullscreenElement || null, doc.body || null);
    }

    function ensureHost() {
      if (!hud) return;
      var parent = parentForHud();
      if (!parent) return;
      if (hud.host.parentNode !== parent) parent.appendChild(hud.host);
      lib.setHostLayout(hud.host, locked);
    }

    function mount() {
      if (mounted || !doc.body) return;
      hud = lib.mountHud(doc, { shortcut: shortcut });
      mounted = true;
      ensureHost();
      ensurePlayerButton();
      render();
    }

    function whenBodyReady(fn) {
      if (doc.body) fn();
      else if (doc.addEventListener) doc.addEventListener('DOMContentLoaded', fn, { once: true });
    }

    function stopTicker() {
      if (rafId != null) cancelRaf(rafId);
      rafId = null;
    }

    function tick() {
      if (!hold.isActive()) return;
      if (hud) hud.setProgress(hold.getProgress());
      rafId = raf(tick);
    }

    function beginHold() {
      if (!locked || !hud || !hud.isShown()) return;
      if (hold.startHold()) {
        stopTicker();
        rafId = raf(tick);
      }
    }

    function endHold() {
      stopTicker();
      hold.cancel();
    }

    function onHoldTarget(event) {
      if (!hud || !hud.isShown()) return false;
      var point = eventPoint(event);
      return pointInElement(hud.holdBtn, point.x, point.y);
    }

    function onChipTarget(event) {
      if (!hud || !hud.isShown() || !hud.chip || hud.chip.hidden) return false;
      var point = eventPoint(event);
      return pointInElement(hud.chip, point.x, point.y);
    }

    async function engageKeyboardLock() {
      var result = await fullscreen.tryLock();
      needsGesture = !result.ok;
      render();
      publish();
      return result;
    }

    async function requestDeepLock() {
      if (!locked) lock({ skipDeep: true });
      reveal(false);
      try {
        if (doc.fullscreenElement) {
          await engageKeyboardLock();
        } else {
          var target = lib.findFullscreenTarget(doc);
          if (!target || typeof target.requestFullscreen !== 'function') {
            needsGesture = true;
          } else {
            await target.requestFullscreen();
            await engageKeyboardLock();
          }
        }
      } catch (err) {
        needsGesture = true;
      }
      render();
      publish();
      return getState();
    }

    function lock(lockOpts) {
      var flags = lockOpts || {};
      locked = true;
      whenBodyReady(function () {
        mount();
        ensureHost();
        if (hud) {
          lib.setHostLayout(hud.host, true);
          reveal(false);
        }
      });
      if (!flags.skipDeep && settings.deepLock && doc.fullscreenElement) {
        engageKeyboardLock();
      }
      render();
      publish();
      return getState();
    }

    function unlock() {
      endHold();
      locked = false;
      needsGesture = false;
      fullscreen.release();
      if (hideTimer != null) clearTimer(hideTimer);
      if (hud) {
        hud.setShown(false);
        hud.setProgress(0);
        lib.setHostLayout(hud.host, false);
      }
      render();
      publish();
      return getState();
    }

    function toggle() {
      var t = now();
      if (t - lastToggle < lib.TOGGLE_DEBOUNCE_MS) return getState();
      lastToggle = t;
      return locked ? unlock() : lock();
    }

    function onKeyboard(event) {
      var decision = lib.evaluateKeyboardEvent(event, { locked: locked, isMac: isMac });
      if (decision.isUnlock && event.type === 'keydown') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (trusted(event)) toggle();
        return;
      }
      if (!locked || !decision.block) return;
      if (event.cancelable !== false) event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'keydown' && trusted(event)) reveal(true);
    }

    function onPointer(event) {
      var onControl = onHoldTarget(event) || onChipTarget(event);
      var decision = lib.classifyPointerEvent(event.type, {
        locked: locked,
        onUnlockControl: onControl
      });
      if (!decision.stop) return;
      var point = eventPoint(event);
      var press = event.type === 'pointerdown' || event.type === 'mousedown' || event.type === 'touchstart';
      var release = event.type === 'pointerup' || event.type === 'pointercancel' || event.type === 'mouseup' || event.type === 'touchend' || event.type === 'touchcancel';
      var move = event.type === 'pointermove' || event.type === 'mousemove' || event.type === 'touchmove';
      if (move) {
        if (trusted(event) && inRevealZone(win, point.x, point.y)) reveal(false);
        if (hold.isActive() && !onHoldTarget(event)) endHold();
      }
      if (trusted(event) && press && onHoldTarget(event)) {
        beginHold();
      } else if (trusted(event) && press && onChipTarget(event)) {
        chipPointer = true;
      }
      if (release) {
        var releaseChip = chipPointer && trusted(event) && onChipTarget(event);
        endHold();
        chipPointer = false;
        if (releaseChip) requestDeepLock();
      }
      if (event.cancelable !== false) event.preventDefault();
      event.stopImmediatePropagation();
    }

    function onFullscreenChange() {
      var change = fullscreen.handleFullscreenChange();
      ensureHost();
      if (change.exited) {
        needsGesture = locked && settings.deepLock;
        if (locked) reveal(false);
      } else if (locked && settings.deepLock && !fullscreen.isDeepActive()) {
        engageKeyboardLock();
      }
      render();
      publish();
    }

    function bind(target, type, handler, captureOpts) {
      if (target && target.addEventListener) target.addEventListener(type, handler, captureOpts);
    }

    for (var k = 0; k < lib.KEYBOARD_EVENT_TYPES.length; k++) {
      bind(win, lib.KEYBOARD_EVENT_TYPES[k], onKeyboard, true);
      if (doc !== win) bind(doc, lib.KEYBOARD_EVENT_TYPES[k], onKeyboard, true);
    }
    for (var p = 0; p < lib.MONITORED_POINTER_EVENTS.length; p++) {
      var type = lib.MONITORED_POINTER_EVENTS[p];
      var listenerOpts = lib.NON_PASSIVE_POINTER_EVENTS.indexOf(type) !== -1
        ? { capture: true, passive: false }
        : true;
      bind(win, type, onPointer, listenerOpts);
      if (doc !== win) bind(doc, type, onPointer, listenerOpts);
    }
    bind(doc, 'fullscreenchange', onFullscreenChange, true);
    bind(doc, 'webkitfullscreenchange', onFullscreenChange, true);
    bind(doc, 'yt-navigate-finish', function () {
      ensureHost();
      ensurePlayerButton();
    }, true);
    bind(doc, 'DOMContentLoaded', function () {
      mount();
      ensurePlayerButton();
    }, true);

    if (typeof win.MutationObserver === 'function' && doc.documentElement) {
      var moScheduled = false;
      var observer = new win.MutationObserver(function () {
        if (moScheduled) return;
        moScheduled = true;
        schedule(function () {
          moScheduled = false;
          if (locked && hud && !hud.host.isConnected) ensureHost();
          ensurePlayerButton();
        }, 50);
      });
      try {
        observer.observe(doc.documentElement, { childList: true, subtree: true });
      } catch (err) {
        // Observation is an enhancement; navigation events still repair the HUD.
      }
    }

    function readSettings() {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local) return;
      try {
        chromeApi.storage.local.get(lib.DEFAULT_SETTINGS, function (items) {
          applySettings(items || {});
        });
      } catch (err) {
        // Keep the defaults already applied.
      }
      if (chromeApi.storage.onChanged && chromeApi.storage.onChanged.addListener) {
        chromeApi.storage.onChanged.addListener(function (changes, area) {
          if (area !== 'local' || !changes) return;
          var next = {
            deepLock: settings.deepLock,
            blockMediaKeys: settings.blockMediaKeys,
            showPlayerButton: settings.showPlayerButton
          };
          lib.SETTING_KEYS.forEach(function (key) {
            if (changes[key]) next[key] = changes[key].newValue !== false && changes[key].newValue !== 'false';
          });
          applySettings(next);
        });
      }
    }

    function applySettings(next) {
      var prevDeep = settings.deepLock;
      settings = lib.normalizeSettings(Object.assign({}, settings, next || {}));
      if (!settings.deepLock && fullscreen.isDeepActive()) {
        fullscreen.release();
        needsGesture = false;
      } else if (settings.deepLock && !prevDeep && locked && doc.fullscreenElement) {
        engageKeyboardLock();
      }
      ensurePlayerButton();
      render();
      publish();
      return getState();
    }

    function handleMessage(msg, sendResponse) {
      if (!msg || typeof msg.action !== 'string') return false;
      if (msg.action === 'ping') {
        sendResponse({ ok: true });
        return false;
      }
      if (msg.action === 'getState') {
        sendResponse(getState());
        return false;
      }
      if (msg.action === 'toggleLock') {
        sendResponse(toggle());
        return false;
      }
      if (msg.action === 'lock') {
        sendResponse(lock());
        return false;
      }
      if (msg.action === 'unlock') {
        sendResponse(unlock());
        return false;
      }
      if (msg.action === 'applySettings') {
        sendResponse(applySettings(msg.settings || {}));
        return false;
      }
      if (msg.action === 'deepLock') {
        Promise.resolve(requestDeepLock()).then(function () {
          sendResponse(getState());
        }, function (err) {
          sendResponse({ ok: false, error: String(err && err.message || err) });
        });
        return true;
      }
      return false;
    }

    whenBodyReady(mount);
    readSettings();

    return {
      lock: lock,
      unlock: unlock,
      toggle: toggle,
      deepLock: requestDeepLock,
      getState: getState,
      handleMessage: handleMessage,
      applySettings: applySettings,
      debug: {
        get hud() { return hud; },
        get hold() { return hold; },
        token: token
      }
    };
  }

  var api = { createScreenLocker: createScreenLocker, PLAYER_CSS: PLAYER_CSS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
