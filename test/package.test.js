const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { collectRuntimeFiles } = require('../scripts/pack.cjs');

const root = path.resolve(__dirname, '..');

test('the store zip lists runtime files only', () => {
  const files = collectRuntimeFiles(root);
  assert.equal(files.includes('manifest.json'), true);
  assert.equal(files.includes('background.js'), true);
  assert.equal(files.includes('lib/screen-locker.js'), true);
  assert.equal(files.includes('icons/icon128.png'), true);
  for (const file of files) {
    assert.equal(file.startsWith('test/'), false, file);
    assert.equal(file.startsWith('scripts/'), false, file);
    assert.equal(file.includes('node_modules'), false, file);
    assert.equal(file.includes('.git'), false, file);
    assert.notEqual(file, 'TODOLIST.txt');
    assert.notEqual(file, 'styles.css');
  }
});

test('npm pack produces a zip without dev files', () => {
  const built = spawnSync(process.execPath, ['scripts/build-zip.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr || built.stdout);
  const zipPath = built.stdout.trim().split('\n').pop();
  const listed = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const listing = listed.stdout;
  assert.match(listing, /manifest\.json/);
  assert.match(listing, /main-world-guard\.js/);
  assert.doesNotMatch(listing, /TODOLIST/);
  assert.doesNotMatch(listing, /node_modules/);
  assert.doesNotMatch(listing, /\btest\//);
  assert.doesNotMatch(listing, /styles\.css/);
});
