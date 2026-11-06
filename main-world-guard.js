(function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  var existing = root.__YT_SCREEN_LOCKER_MAIN_GUARD__;
  if (existing && existing.brand === 'yt-screen-locker-main-v2') {
    try { delete root.__YTL_FACTORIES__; } catch (err) {}
    return;
  }

  var factories = root.__YTL_FACTORIES__;
  if (!factories || typeof factories.createMainController !== 'function') return;

  var doc = root.document;
  var nativeCreateElement = root.Document.prototype.createElement;
  var nativeAttachShadow = root.Element.prototype.attachShadow;
  var nativeGetAttribute = root.Element.prototype.getAttribute;
  var nativeSetAttribute = root.Element.prototype.setAttribute;
  var nativeRemoveAttribute = root.Element.prototype.removeAttribute;
  var nativeAddEventListener = root.EventTarget.prototype.addEventListener;
  var nativeAppendChild = root.Node.prototype.appendChild;
  var nativeParse = root.JSON.parse;
  var nativeStringify = root.JSON.stringify;

  var controller = factories.createMainController({
    mediaSession: root.navigator && root.navigator.mediaSession,
    document: doc,
    view: root,
    createVideoGuard: factories.createVideoGuard
  });
  try { delete root.__YTL_FACTORIES__; } catch (err) {}

  var bridgeHost = nativeCreateElement.call(doc, 'span');
  nativeSetAttribute.call(bridgeHost, 'data-ytl-main-bridge', '1');
  bridgeHost.hidden = true;
  try {
    bridgeHost.style.setProperty('display', 'none', 'important');
  } catch (err) {
    nativeSetAttribute.call(bridgeHost, 'style', 'display:none!important');
  }
  var shadow = nativeAttachShadow.call(bridgeHost, { mode: 'closed' });
  var inbox = nativeCreateElement.call(doc, 'span');
  nativeSetAttribute.call(inbox, 'data-ytl-role', 'main-inbox');
  nativeAppendChild.call(shadow, inbox);

  function ensureAttached() {
    var parent = doc.documentElement || doc.body;
    if (!parent) return;
    if (bridgeHost.parentNode !== parent) nativeAppendChild.call(parent, bridgeHost);
  }

  nativeAddEventListener.call(inbox, 'ytl-main-cmd', function () {
    ensureAttached();
    var raw = nativeGetAttribute.call(inbox, 'data-ytl-cmd');
    nativeRemoveAttribute.call(inbox, 'data-ytl-cmd');
    var result = { ok: false, reason: 'bad-cmd' };
    try {
      var command = raw ? nativeParse(raw) : null;
      if (command) result = controller.privilegedRebind(command.secret, command.token, command.state);
    } catch (err) {
      result = { ok: false, reason: 'bad-cmd' };
    }
    try {
      nativeSetAttribute.call(inbox, 'data-ytl-ack', nativeStringify(result));
    } catch (err) {}
  });

  ensureAttached();
  if ((!doc.documentElement && !doc.body) || !bridgeHost.parentNode) {
    nativeAddEventListener.call(doc, 'DOMContentLoaded', ensureAttached);
  }
  if (typeof root.MutationObserver === 'function' && (doc.documentElement || doc.body)) {
    try {
      var observer = new root.MutationObserver(function () { ensureAttached(); });
      observer.observe(doc.documentElement || doc.body, { childList: true });
    } catch (err) {}
  }

  var api = {
    brand: 'yt-screen-locker-main-v2',
    ensureArmed: function (secret, token) { return controller.ensureArmed(secret, token); },
    update: function (secret, token, state) { return controller.update(secret, token, state); },
    getState: function () { return controller.getState(); }
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
})();
