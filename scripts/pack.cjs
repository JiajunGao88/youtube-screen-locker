const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_PATHS = [
  'manifest.json',
  'background.js',
  'content.js',
  'main-world-guard.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'lib',
  'icons'
];

const OMIT_BASENAMES = new Set(['.DS_Store', 'Thumbs.db']);

function collectRuntimeFiles(root) {
  const files = [];
  function walk(abs, rel) {
    const base = path.basename(abs);
    if (OMIT_BASENAMES.has(base)) return;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(abs)) {
        walk(path.join(abs, name), rel ? `${rel}/${name}` : name);
      }
      return;
    }
    files.push(rel.replace(/\\/g, '/'));
  }
  for (const rel of RUNTIME_PATHS) {
    walk(path.join(root, rel), rel);
  }
  return files.sort();
}

function isPackagedPath(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  if (OMIT_BASENAMES.has(base)) return false;
  return RUNTIME_PATHS.some((entry) => normalized === entry || normalized.startsWith(`${entry}/`));
}

module.exports = {
  RUNTIME_PATHS,
  collectRuntimeFiles,
  isPackagedPath
};
