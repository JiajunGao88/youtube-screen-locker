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

test('disabling media keys allows pause while volume stays guarded', () => {
  const Fake = createMediaClass();
  let plays = 0;
  const basePlay = Fake.prototype.play;
  Fake.prototype.play = function play() {
    plays += 1;
    return basePlay.call(this);
  };
  const video = new Fake();
  const guard = guardFor(Fake, [video]);
  guard.setState({ locked: true, blockMediaKeys: false, guardVolume: true });
  video.pause();
  assert.equal(video.paused, true);
  assert.equal(plays, 0);
  video.volume = 0.25;
  video.muted = true;
  assert.equal(video.volume, 1);
  assert.equal(video.muted, false);
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

test('an ad handoff keeps pause protection and the locked volume', () => {
  const Fake = createMediaClass();
  let plays = 0;
  const basePlay = Fake.prototype.play;
  Fake.prototype.play = function play() {
    plays += 1;
    return basePlay.call(this);
  };
  const video = new Fake();
  video.currentSrc = 'https://www.youtube.com/ad';
  video.volume = 0.8;
  video.muted = false;
  const guard = guardFor(Fake, [video]);
  guard.setState({ locked: true, blockMediaKeys: true, guardVolume: true });

  video._volume = 0.1;
  video._muted = true;
  video.currentSrc = '';
  video.readyState = 0;
  video.paused = true;
  video.emit('emptied');
  assert.equal(guard.baseline(video).volume, 0.8);
  assert.equal(guard.baseline(video).muted, false);
  assert.equal(guard.baseline(video).wasPlaying, false);

  video.paused = false;
  video.readyState = 0;
  video.currentSrc = '';
  video.emit('play');
  assert.equal(guard.baseline(video).wasPlaying, true);
  assert.equal(guard.baseline(video).volume, 0.8);

  video.readyState = 2;
  video.currentSrc = 'https://www.youtube.com/watch?v=main';
  video._volume = 0.05;
  video._muted = true;
  video.emit('loadeddata');
  assert.equal(guard.baseline(video).wasPlaying, true);
  assert.equal(guard.baseline(video).volume, 0.8);
  assert.equal(guard.baseline(video).muted, false);

  video.readyState = 4;
  video.paused = false;
  video.emit('playing');
  assert.equal(guard.baseline(video).wasPlaying, true);
  assert.equal(guard.baseline(video).src, 'https://www.youtube.com/watch?v=main');
  assert.equal(guard.baseline(video).volume, 0.8);

  video.pause();
  assert.equal(video.paused, false);
  assert.equal(plays >= 1, true);
  assert.equal(video.volume, 0.8);
  assert.equal(video.muted, false);
});

test('document_start waits for DOMContentLoaded before observing', () => {
  const Fake = createMediaClass();
  const video = new Fake();
  let observed = 0;
  const doc = {
    documentElement: null,
    body: null,
    readyState: 'loading',
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelectorAll() { return this.documentElement ? [video] : []; }
  };
  function Observer() {}
  Observer.prototype.observe = function observe() { observed += 1; };
  createVideoGuard({
    document: doc,
    view: {
      HTMLMediaElement: Fake,
      HTMLVideoElement: Fake,
      document: doc,
      MutationObserver: Observer
    }
  });
  assert.equal(observed, 0);
  assert.equal(typeof doc.listeners.DOMContentLoaded, 'function');
  doc.documentElement = { nodeName: 'HTML' };
  doc.body = { nodeName: 'BODY' };
  doc.listeners.DOMContentLoaded();
  doc.listeners.DOMContentLoaded();
  assert.equal(observed, 1);
  assert.equal(video.listeners.play.length >= 1, true);
  assert.equal(video.listeners.playing.length >= 1, true);
  assert.equal(video.listeners.loadeddata, undefined);
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
