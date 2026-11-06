class MiniEvent {
  constructor(type, init) {
    const options = init || {};
    this.type = type;
    this.bubbles = options.bubbles !== false;
    this.composed = options.composed !== false;
    this.cancelable = options.cancelable !== false;
    this.key = options.key;
    this.code = options.code;
    this.shiftKey = !!options.shiftKey;
    this.ctrlKey = !!options.ctrlKey;
    this.metaKey = !!options.metaKey;
    this.altKey = !!options.altKey;
    this.clientX = options.clientX || 0;
    this.clientY = options.clientY || 0;
    this.touches = options.touches;
    this.changedTouches = options.changedTouches;
    this.pointerId = typeof options.pointerId === 'number' ? options.pointerId : undefined;
    this.pointerType = options.pointerType;
    this.isTrusted = options.isTrusted !== false;
    this.detail = options.detail;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stop = false;
    this._stopImmediate = false;
    this._path = [];
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stop = true;
  }

  stopImmediatePropagation() {
    this._stopImmediate = true;
    this._stop = true;
  }

  composedPath() {
    return this._path.slice();
  }
}

function createClassList(el) {
  const names = new Set();
  function sync() {
    el._className = Array.from(names).join(' ');
  }
  return {
    add(...items) {
      items.forEach((name) => { if (name) names.add(name); });
      sync();
    },
    remove(...items) {
      items.forEach((name) => names.delete(name));
      sync();
    },
    contains(name) {
      return names.has(name);
    },
    toggle(name, force) {
      const has = names.has(name);
      const next = force === undefined ? !has : !!force;
      if (next) names.add(name);
      else names.delete(name);
      sync();
      return next;
    },
    _replace(value) {
      names.clear();
      String(value || '').split(/\s+/).filter(Boolean).forEach((name) => names.add(name));
      sync();
    }
  };
}

class StyleMap {
  constructor() {
    this._props = {};
  }

  setProperty(name, value) {
    const camel = String(name).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    this[camel] = value;
    this._props[name] = value;
  }
}

class MiniNode {
  constructor(tag, ownerDocument) {
    this.nodeType = tag === '#shadow-root' ? 'shadow' : 'element';
    this.tagName = String(tag || '').toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = ownerDocument || null;
    this.parentNode = null;
    this.childNodes = [];
    this.host = null;
    this._shadow = null;
    this._listeners = [];
    this._classList = createClassList(this);
    this._style = new StyleMap();
    this._dataset = {};
    this._id = '';
    this.hidden = false;
    this.type = '';
    this.title = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  get id() { return this._id; }
  set id(value) { this._id = String(value || ''); }

  get className() { return this._className || ''; }
  set className(value) { this._classList._replace(value); }

  get classList() { return this._classList; }
  get style() { return this._style; }
  get dataset() { return this._dataset; }

  get shadowRoot() {
    return null;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get isConnected() {
    let current = this;
    while (current) {
      if (current === this.ownerDocument) return true;
      current = current.parentNode || current.host || null;
    }
    return false;
  }

  setAttribute(name, value) {
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
    this['attr_' + name] = String(value);
  }

  getAttribute(name) {
    if (name === 'id') return this.id;
    return this['attr_' + name];
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const index = ref ? this.childNodes.indexOf(ref) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    if (child.parentNode === this) child.parentNode = null;
    return child;
  }

  attachShadow(options) {
    const shadow = new MiniNode('#shadow-root', this.ownerDocument);
    shadow.host = this;
    shadow._mode = options && options.mode;
    this._shadow = shadow;
    return shadow;
  }

  addEventListener(type, fn, options) {
    const capture = options === true || !!(options && options.capture);
    const passive = !!(options && options.passive);
    const once = !!(options && options.once);
    this._listeners.push({ type, fn, capture, passive, once });
  }

  dispatchEvent(event) {
    const path = ancestors(this);
    const view = this.ownerDocument && this.ownerDocument.defaultView;
    if (view && path[path.length - 1] !== view) path.push(view);
    event._path = path.slice();
    event.target = this;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      invoke(path[index], event, true);
      if (event._stop) return !event.defaultPrevented;
    }
    if (event.bubbles) {
      for (let index = 1; index < path.length; index += 1) {
        invoke(path[index], event, false);
        if (event._stop) break;
      }
    }
    return !event.defaultPrevented;
  }

  getBoundingClientRect() {
    return this._rect;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return queryAll(this, selector);
  }
}

function ancestors(node) {
  const chain = [];
  let current = node;
  while (current) {
    chain.push(current);
    if (current.parentNode) current = current.parentNode;
    else if (current.host) current = current.host;
    else current = null;
  }
  return chain;
}

function invoke(node, event, capture) {
  const list = node._listeners.filter((listener) => listener.type === event.type && listener.capture === capture);
  for (const listener of list.slice()) {
    if (event._stopImmediate) return;
    event.currentTarget = node;
    listener.fn.call(node, event);
    if (listener.once) {
      node._listeners = node._listeners.filter((item) => item !== listener);
    }
    if (event._stopImmediate) return;
  }
}

function matchesToken(node, token) {
  if (!node || node.nodeType === 'shadow' || node === node.ownerDocument || node === (node.ownerDocument && node.ownerDocument.defaultView)) {
    return false;
  }
  if (token.startsWith('#')) return node.id === token.slice(1);
  if (token.startsWith('.')) return node.classList.contains(token.slice(1));
  return node.tagName === token.toUpperCase();
}

function matchesSelector(node, parts) {
  if (!matchesToken(node, parts[parts.length - 1])) return false;
  let part = parts.length - 2;
  let parent = node.parentNode || node.host;
  while (parent && part >= 0) {
    if (matchesToken(parent, parts[part])) part -= 1;
    parent = parent.parentNode || parent.host;
  }
  return part < 0;
}

function walk(node, visit) {
  visit(node);
  if (node._shadow) walk(node._shadow, visit);
  node.childNodes.forEach((child) => walk(child, visit));
}

function queryAll(root, selector) {
  const found = [];
  String(selector || '').split(',').map((part) => part.trim()).filter(Boolean).forEach((group) => {
    const parts = group.split(/\s+/);
    walk(root, (node) => {
      if (matchesSelector(node, parts)) found.push(node);
    });
  });
  return found;
}

function createDocument() {
  const document = new MiniNode('#document');
  document.ownerDocument = document;
  document.fullscreenElement = null;
  document.readyState = 'complete';
  const windowNode = new MiniNode('#window', document);
  document.defaultView = windowNode;
  windowNode.document = document;
  windowNode.innerWidth = 1280;
  windowNode.innerHeight = 720;

  document.createElement = function createElement(tag) {
    return new MiniNode(tag, document);
  };
  const documentElement = document.createElement('html');
  const head = document.createElement('head');
  const body = document.createElement('body');
  document.appendChild(documentElement);
  documentElement.appendChild(head);
  documentElement.appendChild(body);
  document.documentElement = documentElement;
  document.head = head;
  document.body = body;
  document.getElementById = function getElementById(id) {
    let found = null;
    walk(document, (node) => {
      if (!found && node.id === id) found = node;
    });
    return found;
  };

  return { document, window: windowNode };
}

module.exports = { MiniEvent, createDocument };
