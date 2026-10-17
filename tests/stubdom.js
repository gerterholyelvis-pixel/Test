// A tiny stand-in for the DOM, just enough to drive wbui.js in node (no jsdom in this repo): elements with children, classList, dataset, attributes,
// listeners that bubble, simple selectors (tag, .class, #id, [data-x], [data-x="v"], descendant space). Not a browser: no layout, every rect is 0.
class El {
  constructor(tag, doc) { this.tagName = String(tag).toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentNode = null; this.className = ''; this.dataset = {}; this.style = { setProperty() {} }; this._attrs = {}; this._l = {}; this._text = ''; this.scrollTop = 0; this.value = ''; this.disabled = false; this.tabIndex = -1; this.title = ''; this.id = ''; }
  get classList() {
    const self = this, list = () => String(self.className).split(/\s+/).filter(Boolean);
    return { contains: c => list().includes(c), add: (...cs) => { const l = list(); for (const c of cs) if (!l.includes(c)) l.push(c); self.className = l.join(' '); }, remove: (...cs) => { self.className = list().filter(c => !cs.includes(c)).join(' '); },
      toggle: (c, on) => { const has = list().includes(c); const want = on === undefined ? !has : !!on; if (want && !has) self.className = list().concat(c).join(' '); else if (!want && has) self.className = list().filter(x => x !== c).join(' '); return want; } };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = v == null ? '' : String(v); }
  appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] == null ? null : this._attrs[k]; }
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  dispatch(type, ev = {}) { ev.type = type; if (!ev.target) ev.target = this; if (!ev.preventDefault) ev.preventDefault = () => { ev.defaultPrevented = true; }; for (let n = this; n; n = n.parentNode) for (const f of n._l[type] || []) f(ev); return ev; }
  click() { return this.dispatch('click', { detail: 1 }); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, x: 0, y: 0 }; }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  matches(sel) {
    const parts = sel.match(/(\.[\w-]+|#[\w-]+|\[[^\]]+\]|^[a-zA-Z][\w-]*)/g) || [];
    return parts.every(p => {
      if (p[0] === '.') return this.classList.contains(p.slice(1));
      if (p[0] === '#') return this.id === p.slice(1);
      if (p[0] === '[') { const m = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(p); if (!m) return false; const k = m[1].startsWith('data-') ? m[1].slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()) : null; const v = k ? this.dataset[k] : this._attrs[m[1]]; return m[2] === undefined ? v !== undefined : String(v) === m[2]; }
      return this.tagName === p.toUpperCase();
    });
  }
  querySelectorAll(sel) {
    const chain = sel.trim().split(/\s+/), out = [];
    const walk = (node, depth) => { for (const c of node.children) { const want = chain[depth], ok = c.matches(want); if (ok && depth === chain.length - 1) out.push(c); walk(c, ok && depth < chain.length - 1 ? depth + 1 : depth); } };
    walk(this, 0); return [...new Set(out)];
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  all() { const o = []; (function w(n) { for (const c of n.children) { o.push(c); w(c); } })(this); return o; }
}
function makeDoc() { const doc = { activeElement: null, createElement: t => new El(t, doc) }; return doc; }
// fake timers: ctx.setTimeout / clearTimeout; fire() runs everything pending (in order), fireOne() the oldest
function makeTimers() {
  let n = 0; const q = [];
  return { setTimeout: (f, ms) => { q.push({ id: ++n, f, ms }); return n; }, clearTimeout: id => { const i = q.findIndex(t => t.id === id); if (i >= 0) q.splice(i, 1); },
    fire() { let g = 0; while (q.length && g++ < 500) q.shift().f(); }, fireOne() { if (q.length) q.shift().f(); }, pending: () => q.length, ms: () => q.map(t => t.ms) };
}
module.exports = { El, makeDoc, makeTimers };
