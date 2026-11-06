# YouTube Screen Locker

Lock a YouTube tab so accidental clicks, player shortcuts, and hardware media keys do not interrupt playback. Version 2.0.0 keeps the Chrome Web Store permission set warning-free for existing users: `activeTab`, `storage`, `scripting`, and `*://*.youtube.com/*` only.

`scripting` shows no install warning. A second content script runs in the page **MAIN** world at `document_start` (Chrome 111+) and also shows no extra warning. The extension does **not** request `tabs`, `notifications`, `nativeMessaging`, `webNavigation`, or any broader host permission. Those would disable the extension for current users on update.

## What it does

- **Standard lock** blocks page keyboard shortcuts and pointer, mouse, touch, wheel, double-click, and context-menu input on that tab only.
- **Hold to unlock** (1 second) or press `Ctrl+Shift+L` (`⌘+Shift+L` on macOS). A short click does not unlock.
- **Deep Lock** calls `Element.requestFullscreen()` on the player and then `navigator.keyboard.lock()` so fullscreen can intercept browser and, on Windows, system shortcuts.
- **Media Session guard** swaps YouTube's `play` / `pause` / `next` / `previous` / seek handlers for a no-op while locked, which keeps Chromium from falling through to its default pause. Player volume, mute, and accidental pause are guarded in the page world and restored on unlock.
- **Player button** (on by default) sits in `.ytp-right-controls`.
- **Toolbar badge** shows `LOCK` on the locked tab.

Lock state is **per tab**. It is not stored in one global `isLocked` flag.

## Install from source

1. `npm test`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this directory.
3. Open a YouTube watch or Shorts page. If the tab was already open, use the popup once: the service worker injects the content scripts with `chrome.scripting` so a reload is not required.

`npm run zip` writes `dist/youtube-screen-locker-2.0.0.zip` for the Chrome Web Store. The zip contains the runtime files only.

## Architecture

| Piece | World | Role |
| --- | --- | --- |
| `content.js` + `lib/screen-locker.js` | Isolated | Source of truth for the lock, DOM shield, HUD, player button |
| `main-world-guard.js` | MAIN | Media Session and `<video>` guards |
| `background.js` | Service worker | Commands, per-tab badge, script recovery, one-way MAIN sync |
| `popup.html` | Extension page | Status, lock / deep lock, three settings |

The isolated world owns the lock. It pushes `{ locked, blockMediaKeys, guardVolume }` into the MAIN world through `chrome.scripting.executeScript`, with a per-session token. Page scripts cannot read that token and cannot unlock the shield. A forged `yt-screen-locker-cmd` event is ignored. Unlock gestures also require a trusted browser event (`event.isTrusted`), so a page script cannot synthesize `Ctrl+Shift+L` or a 1 second hold.

The HUD lives in a **closed shadow tree** and is re-parented into `document.fullscreenElement` (or `document.body`) at `z-index: 2147483647`. Hit testing for Hold and the fullscreen chip is done from the isolated world, because `composedPath()` does not expose closed-shadow internals to outside listeners.

If Deep Lock is requested from the popup or a command, the content frame may not have transient user activation. Fullscreen then shows a **Go Fullscreen Deep Lock** chip. Clicking that chip runs inside the page and can call `requestFullscreen()` plus `keyboard.lock()`.

## Keyboard and platform truth table

`navigator.keyboard.lock()` only works while the document is in **JavaScript fullscreen** (`document.fullscreenElement`). Browser fullscreen (F11) does not enable it. Holding Escape for about 1.5 seconds is Chromium's own escape hatch (`kHoldEscapeTime`); this extension listens for `fullscreenchange`, calls `keyboard.unlock()`, and keeps the screen lock so you are not trapped. The HUD tells you the shortcut and the hold button.

| Input | Windows, JS fullscreen + Keyboard Lock | macOS, JS fullscreen + Keyboard Lock | Windowed standard lock |
| --- | --- | --- | --- |
| YouTube keys (`Space`, `K`, `J`, `L`, `F`, arrows, `0-9`, …) | Swallowed | Swallowed | Swallowed |
| `Ctrl/⌘+Shift+L` | Unlocks | Unlocks | Unlocks |
| Browser shortcuts (`Ctrl+W`, `Ctrl+T`, `Ctrl+N`) | Delivered to the page and swallowed | Browser shortcuts Chrome still sees, including `⌘+W` / `⌘+T`, can be swallowed. `⌘+Tab` is not. | Not an OS hook |
| Windows key, `Win+D` / `Win+E` / `Win+Tab`, `Alt+Tab`, `Alt+F4` | Chromium's low-level hook can deliver these to the page; the extension swallows them | No OS modifier hook (`keyboard_hook_mac.mm` returns null). Mission Control and `⌘+Tab` stay with the OS | Not intercepted |
| Single `Escape` | Swallowed. Does not immediately leave fullscreen while Keyboard Lock is active | Same for keys the browser receives | Swallowed at the page. The browser may still exit fullscreen on its own |
| Hold `Escape` ~1.5s | Browser exits fullscreen and Keyboard Lock | Same when the browser is handling the key | N/A |
| Hardware play / pause / next / previous | Swallowed by the Media Session no-op | Same | Same when Block Media Keys is on |
| OS master volume, mute, `Ctrl+Alt+Del` | Not blockable from an extension | Not blockable | Not blockable |

OS volume keys are handled by Windows `hidserv` and macOS `coreaudiod`, outside Chrome. Blocking them would require a native component and a new permission warning. This extension does not do that. It does keep YouTube's `<video>.volume` and `.muted` from changing while locked, and it does not fight `ended`, buffering (`readyState < 2`), or an ad source change.

## Settings

Stored in `chrome.storage.local` (not the lock itself):

| Key | Default | Meaning |
| --- | --- | --- |
| `deepLock` | on | When the tab is already in JS fullscreen, also call `keyboard.lock()` |
| `blockMediaKeys` | on | Install Media Session no-op handlers while locked |
| `showPlayerButton` | on | Lock icon in the player bar |

The legacy global key `isLocked` is removed on update.

## Tests

```bash
npm test
```

Node's built-in test runner covers the manifest permission boundary, hostname checks, the hold state machine, keyboard and pointer decisions, fullscreen and `keyboard.lock` / `unlock`, per-tab badges, Media Session save/restore, spoofed unlocks, the video guard, and a DOM harness. If Chrome is installed, `test/browser-harness.test.js` loads the unpacked extension and checks the shadow HUD, event cancellation, and the service worker manifest in headless Chrome.

## Permissions diff (1.1 → 2.0.0)

```json
"permissions": ["activeTab", "storage", "scripting"]
```

`host_permissions` and every `content_scripts.matches` entry stay `*://*.youtube.com/*`. `minimum_chrome_version` is `111`.
