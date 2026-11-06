const test = require('node:test');
const assert = require('node:assert/strict');
const { createHoldUnlock } = require('../lib/hold-unlock');
const { createClock } = require('./helpers/clock');

function harness() {
  const clock = createClock();
  let unlocked = false;
  const progress = [];
  const hold = createHoldUnlock({
    durationMs: 1000,
    now: () => clock.now(),
    schedule: (fn, ms) => clock.schedule(fn, ms),
    clear: (id) => clock.clear(id),
    onProgress: (value) => progress.push(value),
    onComplete: () => { unlocked = true; }
  });
  return { clock, hold, progress, unlocked: () => unlocked };
}

test('a short press does not unlock', () => {
  const env = harness();
  assert.equal(env.hold.startHold(), true);
  env.clock.advance(200);
  assert.equal(env.hold.cancel(), true);
  env.clock.advance(5000);
  assert.equal(env.unlocked(), false);
  assert.equal(env.hold.isActive(), false);
});

test('holding for the full duration unlocks', () => {
  const env = harness();
  env.hold.startHold();
  env.clock.advance(999);
  assert.equal(env.unlocked(), false);
  env.clock.advance(1);
  assert.equal(env.unlocked(), true);
  assert.deepEqual(env.progress.at(-1), 1);
});

test('leaving mid-hold cancels the timer', () => {
  const env = harness();
  env.hold.startHold();
  env.clock.advance(600);
  assert.equal(env.hold.getProgress() > 0.5, true);
  assert.equal(env.hold.cancel(), true);
  assert.equal(env.progress.at(-1), 0);
  env.clock.advance(5000);
  assert.equal(env.unlocked(), false);
});
