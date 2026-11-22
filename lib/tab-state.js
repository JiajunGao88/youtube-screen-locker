(function (root) {
  function createTabStateStore() {
    var map = new Map();
    return {
      set: function (tabId, state) {
        map.set(tabId, state);
      },
      get: function (tabId) {
        return map.has(tabId) ? map.get(tabId) : null;
      },
      delete: function (tabId) {
        map.delete(tabId);
      },
      keys: function () {
        return Array.from(map.keys());
      },
      size: function () {
        return map.size;
      }
    };
  }

  var api = { createTabStateStore: createTabStateStore };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
