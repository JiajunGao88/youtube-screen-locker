import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { collectRuntimeFiles } = require('./pack.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, `youtube-screen-locker-${manifest.version}.zip`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ytl-pack-'));

for (const rel of collectRuntimeFiles(root)) {
  const from = path.join(root, rel);
  const to = path.join(stage, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outFile)) fs.rmSync(outFile);
const zip = spawnSync('zip', ['-r', '-X', outFile, '.'], { cwd: stage, encoding: 'utf8' });
fs.rmSync(stage, { recursive: true, force: true });
if (zip.status !== 0) {
  console.error(zip.stderr || zip.stdout);
  process.exit(zip.status || 1);
}

const artifactDir = '/opt/cursor/artifacts';
if (fs.existsSync(artifactDir)) {
  fs.copyFileSync(outFile, path.join(artifactDir, path.basename(outFile)));
}

console.log(outFile);
