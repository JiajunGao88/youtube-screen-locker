const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chromeBin = ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome'].find((bin) => fs.existsSync(bin));

function serve(rootDir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const filePath = path.join(rootDir, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, method) {
  const response = await fetch(url, { method: method || 'GET' });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${method || 'GET'} ${url} returned ${response.status}: ${text.slice(0, 180)}`);
  }
}

test('headless Chrome DOM harness has no console errors', { timeout: 60000 }, async (t) => {
  if (!chromeBin) {
    t.skip('Chrome is not installed');
    return;
  }
  const server = await serve(root);
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ytl-chrome-'));
  const logFd = fs.openSync(path.join(profile, 'chrome.log'), 'a');
  const debugPort = 9333 + Math.floor(Math.random() * 200);
  const proc = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--disable-extensions-except=' + root,
    '--load-extension=' + root,
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + debugPort,
    '--remote-allow-origins=*',
    'about:blank'
  ], { detached: true, stdio: ['ignore', logFd, logFd] });

  try {
    let targets = [];
    for (let i = 0; i < 40; i += 1) {
      try {
        targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
        if (targets.length) break;
      } catch (err) {
        await wait(250);
      }
    }
    assert.equal(targets.length > 0, true, 'Chrome debugging endpoint did not come up');

    const harnessUrl = `http://127.0.0.1:${port}/test/fixtures/harness.html`;
    const opened = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?${harnessUrl}`, 'PUT');
    assert.ok(opened.webSocketDebuggerUrl);
    const socket = new WebSocket(opened.webSocketDebuggerUrl);
    const messages = [];
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      messages.push(payload);
      if (payload.id && pending.has(payload.id)) {
        pending.get(payload.id)(payload);
        pending.delete(payload.id);
      }
    });
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', reject);
    });
    function send(method, params) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve) => pending.set(id, resolve));
    }
    await send('Runtime.enable');
    let result = null;
    for (let i = 0; i < 40; i += 1) {
      const evaluated = await send('Runtime.evaluate', {
        expression: 'document.documentElement.dataset.yslResult || ""',
        returnByValue: true
      });
      const value = evaluated.result && evaluated.result.result && evaluated.result.result.value;
      if (value) {
        result = JSON.parse(value);
        break;
      }
      await wait(200);
    }
    assert.ok(result, 'harness did not report a result');
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);

    const exceptions = messages.filter((message) => message.method === 'Runtime.exceptionThrown');
    assert.deepEqual(exceptions, []);

    // Branded Chrome 137+ ignores --load-extension. When a build does start the
    // service worker, confirm the shipped manifest. Otherwise the page harness
    // above is the browser check.
    let worker = null;
    for (let i = 0; i < 8; i += 1) {
      const list = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      worker = list.find((target) => (target.url || '').includes('background.js'));
      if (worker) break;
      await wait(150);
    }
    if (worker && worker.webSocketDebuggerUrl) {
      const workerSocket = new WebSocket(worker.webSocketDebuggerUrl);
      const workerPending = new Map();
      let workerId = 1;
      workerSocket.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data);
        if (payload.id && workerPending.has(payload.id)) {
          workerPending.get(payload.id)(payload);
          workerPending.delete(payload.id);
        }
      });
      await new Promise((resolve, reject) => {
        workerSocket.addEventListener('open', resolve);
        workerSocket.addEventListener('error', reject);
      });
      const manifestValue = await new Promise((resolve) => {
        const id = workerId++;
        workerPending.set(id, resolve);
        workerSocket.send(JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: {
            expression: 'chrome.runtime.getManifest().version + ":" + chrome.runtime.getManifest().permissions.join(",")',
            returnByValue: true
          }
        }));
      });
      const reported = manifestValue.result && manifestValue.result.result && manifestValue.result.result.value;
      assert.equal(reported, '2.0.0:activeTab,storage,scripting');
      workerSocket.close();
    }
    socket.close();
  } finally {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch (err) { proc.kill('SIGKILL'); }
    fs.closeSync(logFd);
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
