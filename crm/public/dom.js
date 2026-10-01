// Tiny DOM helpers. Everything that comes from the API is inserted as text,
// never as markup.

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(node, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
}

export function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else node.appendChild(child);
  }
  return node;
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, children);
  return node;
}

export function svg(tag, props = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function frag(children) {
  return append(document.createDocumentFragment(), children);
}

/** A labelled form control. `options` turns it into a <select>. */
export function field(label, props = {}, options = null) {
  let control;
  if (options) {
    control = el('select', props, options.map(([value, text]) => el('option', { value, text })));
    if (props.value !== undefined) control.value = String(props.value);
  } else if (props.tag === 'textarea') {
    const { tag, value, ...rest } = props;
    control = el('textarea', rest);
    if (value !== undefined && value !== null) control.value = String(value);
  } else {
    control = el('input', { type: 'text', ...props });
  }
  const id = props.id || `f${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return { wrap: el('div', { class: 'field' }, [el('label', { for: id, text: label }), control]), control };
}

export function skeleton(lines = 3) {
  const widths = ['w-30', 'w-80', 'w-55', 'w-80'];
  return el('div', { class: 'skeleton', 'aria-hidden': 'true' },
    Array.from({ length: lines }, (_, i) => el('div', { class: `sk-line ${widths[i % widths.length]}` })));
}

export function stateBlock({ title, body, actions = [], alert = false }) {
  return el('div', { class: alert ? 'state state-alert' : 'state' }, [
    el('h3', { text: title }),
    body ? el('p', { text: body }) : null,
    actions.length ? el('div', { class: 'state-actions' }, actions) : null,
  ]);
}
