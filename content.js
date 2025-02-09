class ScreenLocker {
  constructor() {
    this.isLocked = false;
    this.overlay = null;
    this.lockMessage = null;
    this.hideTimeout = null;
    this.isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    this.init();
    
    // 初始化时明确设置为解锁状态
    this.unlock();

    // 添加消息监听
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggleLock') {
        this.isLocked ? this.unlock() : this.lock();
        sendResponse({ isLocked: this.isLocked });
      }
    });
  }

  init() {
    // 创建覆盖层
    this.createOverlay();
    // 监听快捷键
    this.setupKeyboardListeners();
    // 监听鼠标事件
    this.setupMouseListeners();
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'yt-screen-lock-overlay';
    
    // 创建锁定提示
    this.lockMessage = document.createElement('div');
    this.lockMessage.className = 'lock-message';
    
    // 添加锁定图标
    this.lockMessage.innerHTML = `
      <svg class="lock-icon" viewBox="0 0 24 24">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/>
      </svg>
      <span>Screen Locked</span>
    `;

    this.overlay.appendChild(this.lockMessage);
    document.body.appendChild(this.overlay);

    // 添加鼠标事件监听
    this.setupMessageVisibility();
  }

  setupMessageVisibility() {
    // 创建一个区域来检测鼠标经过
    const hitArea = document.createElement('div');
    hitArea.style.cssText = `
      position: fixed;
      bottom: 0;
      right: 0;
      width: 200px;
      height: 100px;
      z-index: 9998;
      background: transparent;
    `;
    this.overlay.appendChild(hitArea);

    // 监听鼠标进入检测区域
    hitArea.addEventListener('mouseenter', () => {
      if (this.isLocked) {
        this.lockMessage.style.visibility = 'visible';
        this.lockMessage.style.opacity = '1';
        clearTimeout(this.hideTimeout);
      }
    });

    // 监听鼠标离开检测区域
    hitArea.addEventListener('mouseleave', () => {
      if (this.isLocked) {
        this.startHideTimeout();
      }
    });

    // 监听锁定提示的点击事件
    this.lockMessage.addEventListener('click', () => {
      if (this.isLocked) {
        this.unlock();
      }
    });
  }

  startHideTimeout() {
    clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => {
      if (this.isLocked) {
        this.lockMessage.style.opacity = '0';
        // 等待过渡动画完成后再隐藏元素
        setTimeout(() => {
          if (this.lockMessage.style.opacity === '0' && this.isLocked) {
            this.lockMessage.style.visibility = 'hidden';
          }
        }, 300);
      }
    }, 5000);
  }

  setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
      // 检查 Mac 和其他平台的组合键
      const isMacCombo = this.isMac && e.metaKey && e.shiftKey && e.key.toLowerCase() === 'l';
      const isOtherCombo = !this.isMac && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l';

      if (isMacCombo || isOtherCombo) {
        e.preventDefault();
        e.stopPropagation();
        this.isLocked ? this.unlock() : this.lock();
        return;
      }

      // 如果已锁定，阻止所有键盘输入
      if (this.isLocked) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);

    // 添加 keyup 事件处理
    document.addEventListener('keyup', (e) => {
      if (this.isLocked) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);

    // 添加 keypress 事件处理
    document.addEventListener('keypress', (e) => {
      if (this.isLocked) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);

    // 特别处理空格键和ESC键
    window.addEventListener('keydown', (e) => {
      if (this.isLocked) {
        if (e.key === ' ' || e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    }, true);
  }

  setupMouseListeners() {
    // 处理点击事件
    document.addEventListener('click', (e) => {
      if (this.isLocked && !this.lockMessage.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // 处理滚轮事件
    document.addEventListener('wheel', (e) => {
      if (this.isLocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { passive: false, capture: true });

    // 处理触控板滚动事件
    document.addEventListener('touchmove', (e) => {
      if (this.isLocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { passive: false, capture: true });
  }

  lock() {
    this.isLocked = true;
    if (this.overlay) {
      this.overlay.style.display = 'block';
      this.lockMessage.style.visibility = 'visible';
      this.lockMessage.style.opacity = '1';
      this.startHideTimeout();
    }
    chrome.storage.local.set({isLocked: true});
  }

  unlock() {
    this.isLocked = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
      this.lockMessage.style.visibility = 'hidden';
      this.lockMessage.style.opacity = '0';
      clearTimeout(this.hideTimeout);
    }
    chrome.storage.local.set({isLocked: false});
  }
}

// 初始化
const screenLocker = new ScreenLocker(); 