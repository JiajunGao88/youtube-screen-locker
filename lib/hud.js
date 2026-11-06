(function (root) {
  var HUD_CSS = [
    ':host { all: initial; }',
    '.shield {',
    '  position: fixed; inset: 0; z-index: 1;',
    '  background: transparent; pointer-events: auto;',
    '  touch-action: none; user-select: none; -webkit-user-select: none;',
    '}',
    '.pill, .chip, .hold {',
    '  touch-action: none;',
    '  user-select: none;',
    '  -webkit-user-select: none;',
    '  -webkit-touch-callout: none;',
    '}',
    '.pill {',
    '  position: fixed; right: 20px; bottom: 20px; z-index: 3;',
    '  width: min(280px, calc(100vw - 32px));',
    '  display: flex; flex-direction: column; gap: 10px;',
    '  padding: 14px 14px 12px;',
    '  border-radius: 18px;',
    '  color: #f5f5f6;',
    '  background: rgba(15, 15, 18, 0.86);',
    '  border: 1px solid rgba(255, 255, 255, 0.10);',
    '  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.06);',
    '  backdrop-filter: blur(16px);',
    '  font: 500 13px/1.35 system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  pointer-events: auto;',
    '  opacity: 1; transform: translateY(0);',
    '  transition: opacity .4s ease, transform .4s ease;',
    '}',
    '.pill.is-hidden { opacity: 0; visibility: hidden; transform: translateY(8px); pointer-events: none; }',
    '.pill.is-pulsing { animation: ytl-pulse .6s ease; }',
    '@keyframes ytl-pulse {',
    '  0% { box-shadow: 0 0 0 0 rgba(255, 45, 85, 0.55); }',
    '  100% { box-shadow: 0 18px 50px rgba(0,0,0,.45), 0 0 0 14px rgba(255, 45, 85, 0); }',
    '}',
    '.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
    '.badge {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  padding: 4px 8px; border-radius: 999px;',
    '  background: rgba(255, 45, 85, 0.16); color: #ffd0da;',
    '  font-size: 11px; letter-spacing: .04em; text-transform: uppercase;',
    '}',
    '.dot { width: 7px; height: 7px; border-radius: 50%; background: #ff2d55; box-shadow: 0 0 0 3px rgba(255,45,85,.18); }',
    '.hint { color: #b9b9c1; font-size: 12px; }',
    '.chip, .hold {',
    '  appearance: none; border: 0; cursor: pointer; font: inherit; color: inherit;',
    '}',
    '.chip {',
    '  border-radius: 999px; padding: 7px 10px;',
    '  background: transparent; color: #ffd0da;',
    '  border: 1px solid rgba(255, 45, 85, 0.55);',
    '}',
    '.chip[hidden] { display: none; }',
    '.hold {',
    '  position: relative; overflow: hidden; text-align: left;',
    '  border-radius: 999px; padding: 10px 14px 10px 44px;',
    '  background: #221318; color: white;',
    '}',
    '.fill {',
    '  position: absolute; inset: 0 auto 0 0; width: calc(var(--p, 0) * 100%);',
    '  background: linear-gradient(90deg, #9f1239, #ff2d55);',
    '  pointer-events: none;',
    '}',
    '.ring {',
    '  position: absolute; left: 12px; top: 50%; width: 20px; height: 20px;',
    '  transform: translateY(-50%); border-radius: 50%;',
    '  background: conic-gradient(#fff calc(var(--p, 0) * 360deg), rgba(255,255,255,.18) 0);',
    '  pointer-events: none;',
    '}',
    '.ring::after {',
    '  content: ""; position: absolute; inset: 3px; border-radius: 50%; background: #221318;',
    '}',
    '.hold-label { position: relative; z-index: 1; font-weight: 600; }',
    '.sub { color: #d4d4d8; font-size: 11px; font-weight: 500; }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .pill, .fill { transition: none; animation: none; }',
    '}'
  ].join('\n');

  var LOCK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z"/></svg>';

  function mountHud(doc, options) {
    var opts = options || {};
    var host = doc.createElement('div');
    host.id = 'yt-screen-lock-root';
    host.setAttribute('data-ytl-host', '1');
    setHostLayout(host, false);

    var shadow = host.attachShadow({ mode: 'closed' });
    var style = doc.createElement('style');
    style.textContent = HUD_CSS;

    var shield = doc.createElement('div');
    shield.className = 'shield';
    shield.setAttribute('data-ytl-role', 'shield');

    var pill = doc.createElement('div');
    pill.className = 'pill is-hidden';
    pill.setAttribute('role', 'status');
    pill.setAttribute('data-ytl-role', 'pill');

    var row = doc.createElement('div');
    row.className = 'row';
    var badge = doc.createElement('span');
    badge.className = 'badge';
    var dot = doc.createElement('span');
    dot.className = 'dot';
    var badgeText = doc.createElement('span');
    badgeText.setAttribute('data-ytl-role', 'badge-text');
    badgeText.textContent = 'Locked';
    badge.appendChild(dot);
    badge.appendChild(badgeText);
    var hint = doc.createElement('span');
    hint.className = 'hint';
    hint.textContent = opts.shortcut || 'Ctrl+Shift+L';
    row.appendChild(badge);
    row.appendChild(hint);

    var sub = doc.createElement('div');
    sub.className = 'sub';
    sub.setAttribute('data-ytl-role', 'sub');
    sub.textContent = 'Hold the button for 1 second, or use the shortcut.';

    var chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.hidden = true;
    chip.setAttribute('data-ytl-role', 'deep-chip');
    chip.textContent = 'Go Fullscreen Deep Lock';

    var holdBtn = doc.createElement('button');
    holdBtn.type = 'button';
    holdBtn.className = 'hold';
    holdBtn.setAttribute('data-ytl-role', 'hold');
    holdBtn.setAttribute('aria-label', 'Hold for 1 second to unlock');
    holdBtn.style.setProperty('--p', '0');
    holdBtn.innerHTML = '<span class="fill"></span><span class="ring"></span><span class="hold-label">Hold 1s to Unlock</span>';

    pill.appendChild(row);
    pill.appendChild(sub);
    pill.appendChild(chip);
    pill.appendChild(holdBtn);
    shadow.appendChild(style);
    shadow.appendChild(shield);
    shadow.appendChild(pill);

    var shown = false;

    function setShown(visible) {
      shown = !!visible;
      pill.classList.toggle('is-hidden', !shown);
      pill.setAttribute('aria-hidden', shown ? 'false' : 'true');
      holdBtn.dataset.ytlActive = shown ? '1' : '0';
      chip.dataset.ytlActive = shown && !chip.hidden ? '1' : '0';
    }

    function setProgress(value) {
      var p = Math.max(0, Math.min(1, Number(value) || 0));
      holdBtn.style.setProperty('--p', String(p));
    }

    function setMode(mode) {
      var deep = mode && mode.deepActive;
      badgeText.textContent = deep ? 'Deep Locked · Fullscreen' : 'Locked';
      if (mode && mode.deepActive) {
        sub.textContent = 'Hold Esc about 1.5s leaves fullscreen. Hold the button or the shortcut unlocks.';
      } else {
        sub.textContent = 'Accidental clicks stay blocked. Hold the button for 1 second to unlock.';
      }
      var showChip = !!(mode && mode.showChip);
      chip.hidden = !showChip;
      chip.dataset.ytlActive = showChip && shown ? '1' : '0';
      chip.textContent = mode && mode.chipLabel ? mode.chipLabel : 'Go Fullscreen Deep Lock';
      if (mode && mode.shortcut) hint.textContent = mode.shortcut;
    }

    function pulse() {
      pill.classList.remove('is-pulsing');
      // Restart the animation even if a pulse is already running.
      void pill.offsetWidth;
      pill.classList.add('is-pulsing');
    }

    setShown(false);

    return {
      host: host,
      shadow: shadow,
      shield: shield,
      pill: pill,
      holdBtn: holdBtn,
      chip: chip,
      hint: hint,
      setShown: setShown,
      isShown: function () { return shown; },
      setProgress: setProgress,
      setMode: setMode,
      pulse: pulse,
      lockSvg: LOCK_SVG
    };
  }

  function setHostLayout(host, visible) {
    var style = host.style;
    style.setProperty('all', 'initial', 'important');
    style.setProperty('position', 'fixed', 'important');
    style.setProperty('inset', '0', 'important');
    style.setProperty('width', '100%', 'important');
    style.setProperty('height', '100%', 'important');
    style.setProperty('z-index', '2147483647', 'important');
    style.setProperty('pointer-events', 'none', 'important');
    style.setProperty('display', visible ? 'block' : 'none', 'important');
  }

  var api = {
    mountHud: mountHud,
    setHostLayout: setHostLayout,
    HUD_CSS: HUD_CSS,
    LOCK_SVG: LOCK_SVG
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  var ns = root.YTLock || (root.YTLock = {});
  Object.assign(ns, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
