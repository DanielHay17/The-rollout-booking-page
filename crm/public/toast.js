import { el, clear } from './dom.js';

const host = document.getElementById('toasts');
const MAX = 3;

export function toast(message, { alert = false, timeout = alert ? 7000 : 3600 } = {}) {
  if (!host) return () => {};
  const node = el('div', { class: alert ? 'toast is-alert' : 'toast' }, [
    el('span', { text: message }),
    el('button', {
      class: 'toast-close', type: 'button', 'aria-label': 'Dismiss',
      onClick: () => node.remove(),
    }, '×'),
  ]);
  host.appendChild(node);
  while (host.children.length > MAX) host.firstElementChild.remove();
  const timer = setTimeout(() => node.remove(), timeout);
  return () => { clearTimeout(timer); node.remove(); };
}

export function clearToasts() { if (host) clear(host); }
