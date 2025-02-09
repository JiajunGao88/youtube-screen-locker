// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-lock') {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0] && tabs[0].url.includes('youtube.com')) {
      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'toggleLock'
      });
      // 更新存储状态
      if (response) {
        chrome.storage.local.set({isLocked: response.isLocked});
      }
    }
  }
});

// 监听扩展安装或更新
chrome.runtime.onInstalled.addListener(() => {
  // 初始化存储状态
  chrome.storage.local.set({isLocked: false});
}); 