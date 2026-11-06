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

function openSocket(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id && pending.has(payload.id)) {
      pending.get(payload.id)(payload);
      pending.delete(payload.id);
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  return ready.then(() => ({
    close() { socket.close(); },
    send(method, params) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve) => pending.set(id, resolve));
    }
  }));
}

async function assertChipGesture(send, kind) {
  const pointEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const chip = window.__YSL.chip;
      const rect = chip.getBoundingClientRect();
      window.__YSL.activation = null;
      window.__YSL.activations = [];
      window.__YSL.fullscreenCalls = 0;
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
        hidden: !!chip.hidden
      };
    })()`,
    returnByValue: true
  });
  const point = pointEval.result && pointEval.result.result && pointEval.result.result.value;
  assert.ok(point && point.w > 0 && point.h > 0, kind + ' chip has no layout ' + JSON.stringify(point));
  assert.equal(point.hidden, false, kind + ' chip is hidden');
  async function gesture(id) {
    if (kind === 'mouse') {
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1
      });
    } else {
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: point.x, y: point.y, id }]
      });
      await send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
    }
  }
  await gesture(1);
  await wait(80);
  await gesture(2);
  await wait(80);
  const outcome = await send('Runtime.evaluate', {
    expression: '({ activation: window.__YSL.activation, activations: window.__YSL.activations, calls: window.__YSL.fullscreenCalls, clicks: window.__YSL.playerClicks() })',
    returnByValue: true
  });
  const value = outcome.result && outcome.result.result && outcome.result.result.value;
  assert.equal(value.calls, 2, kind + ' second tap did not request fullscreen ' + JSON.stringify(value));
  assert.equal(value.activations.length, 2, kind + ' activations ' + JSON.stringify(value));
  assert.equal(value.activations.every(Boolean), true, kind + ' lost transient user activation ' + JSON.stringify(value));
  assert.equal(value.clicks, 0, kind + ' reached the player');
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
    '--touch-events=enabled',
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
    await assertChipGesture(send, 'mouse');
    const touchPage = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?${harnessUrl}`, 'PUT');
    const touchSocket = await openSocket(touchPage.webSocketDebuggerUrl);
    try {
      await touchSocket.send('Runtime.enable');
      let touchReady = null;
      for (let i = 0; i < 40; i += 1) {
        const evaluated = await touchSocket.send('Runtime.evaluate', {
          expression: 'document.documentElement.dataset.yslResult || ""',
          returnByValue: true
        });
        const value = evaluated.result && evaluated.result.result && evaluated.result.result.value;
        if (value) {
          touchReady = JSON.parse(value);
          break;
        }
        await wait(200);
      }
      assert.equal(touchReady && touchReady.ok, true);
      await assertChipGesture(touchSocket.send, 'touch');
      const hold = await touchSocket.send('Runtime.evaluate', {
        expression: `(() => {
          const rect = window.__YSL.hold.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, calls: window.__YSL.fullscreenCalls };
        })()`,
        returnByValue: true
      });
      const holdPoint = hold.result.result.value;
      const beforeHold = holdPoint.calls;
      await touchSocket.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: holdPoint.x, y: holdPoint.y, id: 3 }]
      });
      await touchSocket.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      const afterHold = await touchSocket.send('Runtime.evaluate', {
        expression: 'window.__YSL.fullscreenCalls',
        returnByValue: true
      });
      assert.equal(afterHold.result.result.value, beforeHold);
    } finally {
      touchSocket.close();
    }

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
