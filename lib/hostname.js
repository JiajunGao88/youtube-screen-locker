(function (root) {
  function isYouTubeUrl(raw) {
    if (!raw || typeof raw !== 'string') return false;
    try {
      var url = new URL(raw);
      return /(^|\.)youtube\.com$/i.test(url.hostname);
    } catch (err) {
      return false;
    }
  }

  var api = { isYouTubeUrl: isYouTubeUrl };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
