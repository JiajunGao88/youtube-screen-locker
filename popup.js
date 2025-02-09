document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleLock');
  const statusSpan = document.getElementById('lockStatus');
  const shortcutInfo = document.querySelector('.shortcut-info');
  
  // 检测平台
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  // 根据平台更新快捷键提示
  shortcutInfo.textContent = `Key Combo: ${isMac ? '⌘ + ⇧ + L' : 'Ctrl + Shift + L'}`;

  // 检查当前标签页是否是 YouTube
  async function checkIfYouTube() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    return tabs[0]?.url?.includes('youtube.com') || false;
  }

  // 更新界面状态
  async function updateUI() {
    const isYouTube = await checkIfYouTube();
    
    if (!isYouTube) {
      statusSpan.textContent = 'Only works on YouTube';
      toggleButton.disabled = true;
      return;
    }

    // 获取当前状态
    chrome.storage.local.get(['isLocked'], function(result) {
      statusSpan.textContent = result.isLocked ? 'Locked' : 'Unlocked';
      toggleButton.disabled = false;
    });
  }

  // 初始化UI
  updateUI();

  // 切换按钮点击事件
  toggleButton.addEventListener('click', async function() {
    const isYouTube = await checkIfYouTube();
    if (!isYouTube) {
      return;
    }

    try {
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      const tab = tabs[0];
      
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'toggleLock'
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.log('Error:', chrome.runtime.lastError);
            return;
          }
          
          if (response) {
            statusSpan.textContent = response.isLocked ? 'Locked' : 'Unlocked';
            chrome.storage.local.set({isLocked: response.isLocked});
          }
        });
      }
    } catch (error) {
      console.error('Error:', error);
      statusSpan.textContent = 'Error';
    }
  });

  // 添加storage变化监听器
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (changes.isLocked) {
      statusSpan.textContent = changes.isLocked.newValue ? 'Locked' : 'Unlocked';
    }
  });
}); 