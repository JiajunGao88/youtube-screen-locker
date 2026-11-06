(function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  var existing = root.__YT_SCREEN_LOCKER_MAIN_GUARD__;
  if (existing && existing.brand === 'yt-screen-locker-main-v2') return;

  var factories = root.__YTL_FACTORIES__;
  if (!factories || typeof factories.createMainController !== 'function') return;

  var controller = factories.createMainController({
    mediaSession: root.navigator && root.navigator.mediaSession,
    document: root.document,
    view: root,
    createVideoGuard: factories.createVideoGuard
  });

  var api = {
    brand: 'yt-screen-locker-main-v2',
    ensureArmed: function (seal, token) { return controller.ensureArmed(seal, token); },
    update: function (seal, token, state) { return controller.update(seal, token, state); },
    getState: function () { return controller.getState(); },
    handleExternalEvent: function (detail) { return controller.handleExternalEvent(detail); }
  };

  try {
    Object.defineProperty(root, '__YT_SCREEN_LOCKER_MAIN_GUARD__', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: api
    });
  } catch (err) {
    root.__YT_SCREEN_LOCKER_MAIN_GUARD__ = api;
  }

  if (root.document && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('yt-screen-locker-cmd', function (event) {
      controller.handleExternalEvent(event && event.detail);
    });
  }
})();
