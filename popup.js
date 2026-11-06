document.addEventListener('DOMContentLoaded', function () {
  var statusEl = document.getElementById('lockStatus');
  var toggleBtn = document.getElementById('toggleLock');
  var deepBtn = document.getElementById('deepLock');
  var shortcutEl = document.getElementById('shortcutInfo');
  var gestureEl = document.getElementById('gestureNote');
  var versionEl = document.getElementById('version');
  var deepToggle = document.getElementById('deepLockToggle');
  var mediaToggle = document.getElementById('mediaKeysToggle');
  var playerToggle = document.getElementById('playerButtonToggle');
  var isMac = YTLock.isMacPlatform(navigator);
  var tabId = null;
  var viewState = null;

  try {
    versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
  } catch (err) {
    versionEl.textContent = 'v2.0.0';
  }

  function paint(isYouTube, state) {
    viewState = state;
    var view = YTLock.derivePopupView({
      isYouTube: isYouTube,
      state: state,
      isMac: isMac,
      settings: state && state.settings
    });
    statusEl.textContent = view.status;
    statusEl.className = 'pill ' + (view.tone === 'open' ? 'open' : view.tone === 'idle' ? '' : view.tone);
    toggleBtn.textContent = view.lockLabel;
    toggleBtn.disabled = view.lockDisabled;
    deepBtn.textContent = view.deepLabel;
    deepBtn.disabled = view.deepDisabled;
    shortcutEl.textContent = view.shortcut;
    deepToggle.checked = view.settings.deepLock;
    mediaToggle.checked = view.settings.blockMediaKeys;
    playerToggle.checked = view.settings.showPlayerButton;
    gestureEl.hidden = !(isYouTube && state && state.needsGesture && state.locked && !state.deepActive);
  }

  async function activeTab() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0];
  }

  async function refresh() {
    var tab = await activeTab();
    tabId = tab && tab.id;
    var onYouTube = !!(tab && YTLock.isYouTubeUrl(tab.url));
    if (!onYouTube) {
      paint(false, null);
      return;
    }
    paint(true, null);
    try {
      await chrome.runtime.sendMessage({ type: 'ensure-tab', tabId: tab.id });
      var state = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });
      paint(true, state);
    } catch (err) {
      statusEl.textContent = 'Reload the YouTube tab';
      toggleBtn.disabled = true;
      deepBtn.disabled = true;
    }
  }

  async function command(action) {
    if (tabId == null) return;
    try {
      await chrome.runtime.sendMessage({ type: 'ensure-tab', tabId: tabId });
      var state = await chrome.tabs.sendMessage(tabId, { action: action });
      paint(true, state);
    } catch (err) {
      statusEl.textContent = 'Could not reach the tab';
    }
  }

  toggleBtn.addEventListener('click', function () {
    var action = viewState && viewState.locked ? 'unlock' : 'lock';
    command(action);
  });
  deepBtn.addEventListener('click', function () { command('deepLock'); });

  function persist(partial) {
    chrome.storage.local.set(partial);
  }

  deepToggle.addEventListener('change', function () {
    persist({ deepLock: deepToggle.checked });
  });
  mediaToggle.addEventListener('change', function () {
    persist({ blockMediaKeys: mediaToggle.checked });
  });
  playerToggle.addEventListener('change', function () {
    persist({ showPlayerButton: playerToggle.checked });
  });

  chrome.runtime.onMessage.addListener(function (message, sender) {
    if (!message || message.type !== 'lock-state') return;
    if (!sender.tab || sender.tab.id !== tabId || !message.state) return;
    paint(true, message.state);
  });

  refresh();
});
