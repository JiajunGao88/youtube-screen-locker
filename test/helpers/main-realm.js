const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(tag) {
  const el = Object.create(Element.prototype);
  el.tagName = String(tag).toUpperCase();
  el._attrs = {};
  el.childNodes = [];
  el.parentNode = null;
  el._listeners = [];
  el.hidden = false;
  el.style = { setProperty() {} };
  return el;
}

function matches(el, selector) {
  const attr = /^\[([^=\]]+)="([^"]+)"\]$/.exec(selector);
  if (!attr || !el.getAttribute) return false;
  return el.getAttribute(attr[1]) === attr[2];
}

function queryLight(node, selector, out) {
  const children = node && node.childNodes ? node.childNodes : [];
  for (const child of children) {
    if (matches(child, selector)) out.push(child);
    queryLight(child, selector, out);
  }
}

function EventTarget() {}
EventTarget.prototype.addEventListener = function addEventListener(type, fn) {
  this._listeners = this._listeners || [];
  this._listeners.push({ type, fn });
};
EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
  const list = (this._listeners || []).filter((entry) => entry.type === event.type);
  for (const entry of list) entry.fn.call(this, event);
  return true;
};

function Node() {}
Node.prototype = Object.create(EventTarget.prototype);
Node.prototype.appendChild = function appendChild(child) {
  if (child.parentNode && child.parentNode.childNodes) {
    const index = child.parentNode.childNodes.indexOf(child);
    if (index >= 0) child.parentNode.childNodes.splice(index, 1);
  }
  child.parentNode = this;
  this.childNodes = this.childNodes || [];
  this.childNodes.push(child);
  return child;
};

function Element() {}
Element.prototype = Object.create(Node.prototype);
Element.prototype.setAttribute = function setAttribute(name, value) {
  this._attrs[name] = String(value);
};
Element.prototype.getAttribute = function getAttribute(name) {
  return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
};
Element.prototype.removeAttribute = function removeAttribute(name) {
  delete this._attrs[name];
};
Element.prototype.attachShadow = function attachShadow(options) {
  const shadow = createElement('#shadow-root');
  shadow.host = this;
  this._mode = options && options.mode;
  this._closed = shadow;
  return shadow;
};
Element.prototype.querySelector = function querySelector(selector) {
  const found = [];
  queryLight(this, selector, found);
  return found[0] || null;
};
Object.defineProperty(Element.prototype, 'shadowRoot', {
  get() { return this._mode === 'closed' ? null : this._closed || null; }
});

function Document() {}
Document.prototype = Object.create(EventTarget.prototype);
Document.prototype.createElement = function create(tag) { return createElement(tag); };
Document.prototype.querySelector = function querySelector(selector) {
  const found = [];
  queryLight(this.documentElement, selector, found);
  return found[0] || null;
};
Document.prototype.querySelectorAll = function querySelectorAll() { return []; };
Document.prototype.addEventListener = EventTarget.prototype.addEventListener;

function bootMainRealm() {
  const documentElement = createElement('html');
  const body = createElement('body');
  documentElement.appendChild(body);
  const document = Object.create(Document.prototype);
  document.documentElement = documentElement;
  document.body = body;
  document._listeners = [];
  const listeners = { window: [], document: [] };
  document.addEventListener = function addEventListener(type, fn) {
    listeners.document.push({ type, fn });
    EventTarget.prototype.addEventListener.call(this, type, fn);
  };
  const context = {
    console,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Error,
    Date,
    Math,
    JSON,
    EventTarget,
    Node,
    Element,
    Document,
    Event,
    document,
    navigator: {
      mediaSession: {
        handlers: {},
        setActionHandler(action, handler) { this.handlers[action] = handler; }
      }
    }
  };
  context.globalThis = context;
  context.window = context;
  context.addEventListener = function addEventListener(type, fn) {
    listeners.window.push({ type, fn });
  };
  vm.createContext(context);
  const dir = path.resolve(__dirname, '../..');
  for (const file of [
    'lib/media-session-guard.js',
    'lib/video-guard.js',
    'main-world-guard.js'
  ]) {
    vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context, { filename: file });
  }
  return { context, listeners };
}

function openClosedShadow(host) {
  return host && host._closed || null;
}

module.exports = { bootMainRealm, openClosedShadow };
