const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../lib/event-guard');

test('required pointer events are all monitored', () => {
  for (const type of [
    'click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick',
    'contextmenu', 'auxclick', 'dragstart', 'touchstart', 'touchend',
    'touchmove', 'wheel', 'selectstart'
  ]) {
    assert.equal(guard.REQUIRED_POINTER_EVENTS.includes(type), true, type);
    assert.equal(guard.classifyPointerEvent(type, { locked: true }).stop, true, type);
    assert.equal(guard.classifyPointerEvent(type, { locked: false }).stop, false, type);
  }
});

test('wheel and touch listeners are non-passive', () => {
  for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend']) {
    assert.equal(guard.NON_PASSIVE_POINTER_EVENTS.includes(type), true, type);
  }
});

test('unlock control events are stopped but marked as controls', () => {
  const decision = guard.classifyPointerEvent('pointerdown', { locked: true, onUnlockControl: true });
  assert.equal(decision.stop, true);
  assert.equal(decision.onUnlockControl, true);
});

test('YouTube shortcut keys are blocked while locked and the unlock chord is recognized', () => {
  for (const key of guard.YOUTUBE_SHORTCUT_KEYS) {
    const decision = guard.evaluateKeyboardEvent({ key, shiftKey: false, ctrlKey: false, metaKey: false }, { locked: true, isMac: false });
    assert.equal(decision.block, true, key);
    assert.equal(decision.isUnlock, false, key);
  }
  const shiftN = guard.evaluateKeyboardEvent({ key: 'N', shiftKey: true, ctrlKey: false, metaKey: false }, { locked: true, isMac: false });
  assert.equal(shiftN.block, true);
  assert.equal(shiftN.isUnlock, false);
  const win = guard.evaluateKeyboardEvent({ key: 'l', code: 'KeyL', shiftKey: true, ctrlKey: true, metaKey: false }, { locked: true, isMac: false });
  assert.equal(win.isUnlock, true);
  const mac = guard.evaluateKeyboardEvent({ key: 'L', code: 'KeyL', shiftKey: true, ctrlKey: false, metaKey: true }, { locked: false, isMac: true });
  assert.equal(mac.isUnlock, true);
  assert.equal(mac.block, false);
  const wrongMac = guard.evaluateKeyboardEvent({ key: 'l', shiftKey: true, ctrlKey: true, metaKey: false }, { locked: true, isMac: true });
  assert.equal(wrongMac.isUnlock, false);
  assert.equal(wrongMac.block, true);
});

test('keyboard event types include the capture set', () => {
  assert.deepEqual([...guard.KEYBOARD_EVENT_TYPES], ['keydown', 'keyup', 'keypress', 'beforeinput']);
});
