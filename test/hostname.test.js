const test = require('node:test');
const assert = require('node:assert/strict');
const { isYouTubeUrl } = require('../lib/hostname');

test('hostname check accepts YouTube hosts only', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=abc'), true);
  assert.equal(isYouTubeUrl('https://youtube.com/'), true);
  assert.equal(isYouTubeUrl('https://music.youtube.com/'), true);
  assert.equal(isYouTubeUrl('https://m.youtube.com/shorts/abc'), true);
  assert.equal(isYouTubeUrl('http://www.youtube.com/'), true);
});

test('hostname check rejects lookalike and embedded strings', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com.evil.com/watch'), false);
  assert.equal(isYouTubeUrl('https://evil.com/?u=youtube.com'), false);
  assert.equal(isYouTubeUrl('https://notyoutube.com/'), false);
  assert.equal(isYouTubeUrl('https://youtu.be/abc'), false);
  assert.equal(isYouTubeUrl('not a url'), false);
  assert.equal(isYouTubeUrl(''), false);
  assert.equal(isYouTubeUrl(undefined), false);
});
