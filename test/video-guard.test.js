const test = require('node:test');
const assert = require('node:assert/strict');
const { createVideoGuard } = require('../lib/video-guard');

function createMediaClass() {
  class FakeMedia {
    constructor() {
      this.tagName = 'VIDEO';
      this._volume = 1;
      this._muted = false;
      this.ended = false;
      this.readyState = 4;
      this.currentSrc = 'https://www.youtube.com/watch?v=a';
      this.src = this.currentSrc;
      this.paused = false;
      this.listeners = {};
    }

    get volume() { return this._volume; }
    set volume(value) {
      if (this._volume === value) return;
      this._volume = Number(value);
      this.emit('volumechange');
    }

    get muted() { return this._muted; }
    set muted(value) {
      const next = !!value;
      if (this._muted === next) return;
      this._muted = next;
      this.emit('volumechange');
    }

    pause() {
      this.paused = true;
      this.emit('pause');
    }

    play() {
      this.paused = false;
      this.emit('play');
      return Promise.resolve();
    }

    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    }

    emit(type) {
      for (const fn of (this.listeners[type] || []).slice()) fn({ type, target: this });
    }
  }
  return FakeMedia;
}

function guardFor(Fake, videos = []) {
  const doc = { querySelectorAll() { return videos; }, documentElement: {} };
  return createVideoGuard({
    document: doc,
    view: { HTMLMediaElement: Fake, HTMLVideoElement: Fake, document: doc }
  });
}

test('volume, mute, and accidental pause are held while locked', () => {
  const Fake = createMediaClass();
  let plays = 0;
  const basePlay = Fake.prototype.play;
  Fake.prototype.play = function play() {
    plays += 1;
    return basePlay.call(this);
  };
  const video = new Fake();
  const guard = guardFor(Fake, [video]);
  guard.setState({ locked: true, guardVolume: true });
  video.volume = 0.2;
  video.muted = true;
  assert.equal(video.volume, 1);
  assert.equal(video.muted, false);
  video.pause();
  assert.equal(video.paused, false);
  assert.equal(plays, 1);
});

test('natural end, buffering, and ad source changes are not forced back to play', () => {
  const Fake = createMediaClass();
  let plays = 0;
  const basePlay = Fake.prototype.play;
  Fake.prototype.play = function play() {
    plays += 1;
    return basePlay.call(this);
  };
  const video = new Fake();
  const guard = guardFor(Fake, [video]);
  guard.setState({ locked: true, guardVolume: true });

  video.ended = true;
  video.pause();
  assert.equal(video.paused, true);
  assert.equal(plays, 0);

  video.paused = false;
  video.ended = false;
  video.readyState = 1;
  video.pause();
  assert.equal(video.paused, true);
  assert.equal(plays, 0);

  video.paused = false;
  video.readyState = 4;
  video.currentSrc = 'https://www.youtube.com/ad';
  video.pause();
  assert.equal(video.paused, true);
  assert.equal(plays, 0);
});

test('a paused video is not autoplayed, and unlock restores control', () => {
  const Fake = createMediaClass();
  const video = new Fake();
  video.paused = true;
  const guard = guardFor(Fake, [video]);
  guard.setState({ locked: true, guardVolume: true });
  video.pause();
  assert.equal(video.paused, true);
  guard.setState({ locked: false, guardVolume: false });
  video.volume = 0.4;
  video.muted = true;
  assert.equal(video.volume, 0.4);
  assert.equal(video.muted, true);
  video.paused = false;
  video.pause();
  assert.equal(video.paused, true);
});

test('re-entrant pause from play() does not loop', () => {
  const Fake = createMediaClass();
  let calls = 0;
  Fake.prototype.play = function play() {
    calls += 1;
    if (calls > 3) throw new Error('resume loop');
    this.paused = false;
    this.pause();
    return Promise.resolve();
  };
  const video = new Fake();
  const guard = guardFor(Fake, [video]);
  guard.setState({ locked: true, guardVolume: true });
  video.pause();
  assert.equal(calls, 1);
  assert.equal(video.paused, false);
  assert.equal(guard.shouldBlockPause(video), true);
});

test('volume changes made under the prototype are restored without looping', () => {
  const Fake = createMediaClass();
  const video = new Fake();
  const guard = guardFor(Fake, [video]);
  guard.setState({ locked: true, guardVolume: true });
  video._volume = 0.15;
  video.emit('volumechange');
  assert.equal(video.volume, 1);
});

test('non-video media is left alone', () => {
  const Fake = createMediaClass();
  const audio = new Fake();
  audio.tagName = 'AUDIO';
  const guard = guardFor(Fake, []);
  guard.watch(audio);
  guard.setState({ locked: true, guardVolume: true });
  audio.volume = 0.3;
  assert.equal(audio.volume, 0.3);
});
