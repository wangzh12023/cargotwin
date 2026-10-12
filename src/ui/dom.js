// Minimal hyperscript helper: h('div#id.card.is-x', { onclick, dataset, style }, child, ...)
export function h(sel, attrs, ...children) {
  const m = sel.match(/^([a-z0-9-]*)((?:[#.][\w-]+)*)$/i);
  const tag = (m && m[1]) || 'div';
  const el = document.createElement(tag);
  if (m && m[2]) {
    const classes = [];
    for (const part of m[2].match(/[#.][\w-]+/g)) {
      if (part[0] === '#') el.id = part.slice(1);
      else classes.push(part.slice(1));
    }
    if (classes.length) el.className = classes.join(' ');
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

/** append() that skips null/false and flattens arrays (Element.append would print "null"). */
export function add(el, ...children) {
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Resolve a file in /public respecting Vite's base path. */
export function asset(path) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || './';
  return base.replace(/\/?$/, '/') + path.replace(/^\//, '');
}
