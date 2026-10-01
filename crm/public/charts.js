// Hand-built inline SVG charts. No library, no dual axes, one series per chart
// (the title names the series, so no legend is needed).
//
// Mark specs: bars are thin, capped at 24px, with a 4px rounded data-end and a
// square baseline, separated by a 2px surface gap. Lines are 2px with >=8px
// markers. Grid and axes are recessive hairlines; all text wears ink tokens,
// never the series colour. Every chart has a tooltip, keyboard readout and a
// table view of the same numbers.

import { el, svg, clear, append } from './dom.js';
import { EM_DASH, longDate, shortDate } from './format.js';

const INK = '#000000';
const INK_2 = '#4B4B4B';
const INK_3 = '#8A8A8A';
const LINE = '#E5E7EB';
const LINE_INK = '#D7D5D1';
const TRACK = '#F1EEEA';
const SURFACE = '#FFFFFF';
const SLOT_HI = '#F6F3F0';

const PLOT_H = 130;
const PAD_T = 14;
const PAD_R = 12;
const PAD_B = 24;
const BAR_MAX = 24;
const BAR_GAP = 2;          // the surface gap between adjacent bars
const RADIUS = 4;

function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

function niceMax(value, integer) {
  if (!(value > 0)) return 1;
  const steps = integer ? [2, 4, 6, 8, 10] : [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const mag = 10 ** Math.floor(Math.log10(value));
  for (const m of steps) {
    const candidate = Number((m * mag).toPrecision(12));
    if (value <= candidate + 1e-9) return candidate;
  }
  return 10 * mag;
}

function makeScale(rawMax, integer) {
  if (integer && rawMax <= 4) {
    const max = Math.max(1, Math.ceil(rawMax));
    return { max, ticks: Array.from({ length: max + 1 }, (_, i) => i) };
  }
  const max = niceMax(rawMax, integer);
  return { max, ticks: [0, max / 2, max] };
}

/** A column with a square baseline and a rounded data-end. */
function columnPath(x, y, w, h, r = RADIUS) {
  if (!(h > 0.02) || !(w > 0)) return '';
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const bottom = y + h;
  return `M${x} ${bottom} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} `
    + `L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${bottom} Z`;
}

/** A horizontal bar growing right from a square baseline. */
function rowPath(x, y, w, h, r = RADIUS) {
  if (!(w > 0.02)) return '';
  const rr = Math.max(0, Math.min(r, h / 2, w));
  return `M${x} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} `
    + `L${x + w} ${y + h - rr} Q${x + w} ${y + h} ${x + w - rr} ${y + h} L${x} ${y + h} Z`;
}

function axisText(props, value) {
  return svg('text', {
    'font-family': 'Inter, sans-serif',
    'font-size': 10,
    'font-weight': 500,
    fill: INK_3,
    ...props,
  }, String(value));
}

function pickLabelIndices(count, plotWidth) {
  if (count <= 1) return [0];
  const room = Math.max(2, Math.floor(plotWidth / 66));
  if (count <= room) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (room - 1);
  const out = new Set();
  for (let i = 0; i < room; i += 1) out.add(Math.round(i * step));
  out.add(count - 1);
  return [...out].sort((a, b) => a - b);
}

function card({ title, sub, accessibleName }) {
  const titleNode = el('div', { class: 'chart-title', text: title });
  const subNode = el('div', { class: 'chart-sub', text: sub || '' });
  const toggle = el('button', {
    class: 'btn btn-sm chart-toggle', type: 'button', 'aria-pressed': 'false',
  }, 'Table');
  const total = el('div', { class: 'chart-total nums' });
  const body = el('div', { class: 'chart-body' });
  const tip = el('div', { class: 'chart-tip', hidden: true, role: 'presentation' });
  const tableWrap = el('div', { class: 'data-table-wrap', hidden: true });
  const root = el('section', { class: 'chart-card', 'aria-label': accessibleName || title }, [
    el('div', { class: 'chart-head' }, [el('div', {}, [titleNode, subNode]), toggle]),
    total,
    body,
    tableWrap,
  ]);
  body.appendChild(tip);

  toggle.addEventListener('click', () => {
    const showTable = tableWrap.hidden;
    tableWrap.hidden = !showTable;
    body.hidden = showTable;
    toggle.setAttribute('aria-pressed', showTable ? 'true' : 'false');
    clear(toggle);
    toggle.appendChild(document.createTextNode(showTable ? 'Chart' : 'Table'));
  });

  return { root, body, tip, total, subNode, tableWrap };
}

function dataTable(headers, rows) {
  return el('table', { class: 'data-table' }, [
    el('thead', {}, el('tr', {}, headers.map((h, i) =>
      el('th', { class: i === 0 ? '' : 'num', scope: 'col', text: h })))),
    el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((cell, i) =>
      el('td', { class: i === 0 ? '' : 'num', text: cell }))))),
  ]);
}

/**
 * One series over time. `kind` is 'bar' or 'line'.
 * points: [{ date: 'YYYY-MM-DD', value: number }] — zero days included, so a
 * quiet day renders as an empty slot rather than being dropped.
 */
export function timeSeries({
  title,
  sub = '',
  kind = 'bar',
  points = [],
  color = '#7BB5A8',
  formatValue = (v) => String(v),
  formatTick = (v) => String(v),
  formatTotal = null,
  integer = true,
  totalLabel = 'total',
}) {
  const n = points.length;
  const values = points.map((p) => Number(p.value) || 0);
  const sum = values.reduce((a, b) => a + b, 0);
  const rawMax = values.length ? Math.max(...values) : 0;
  const maxIndex = values.indexOf(rawMax);
  const scale = makeScale(rawMax, integer);

  const quiet = sum === 0 ? 'no activity in this window' : '';
  const ui = card({
    title,
    sub: [sub, quiet].filter(Boolean).join(' · '),
    accessibleName: `${title}: ${(formatTotal || formatValue)(sum)} ${totalLabel} over ${n} days`,
  });
  ui.total.textContent = n ? `${(formatTotal || formatValue)(sum)} ${totalLabel}` : EM_DASH;

  append(ui.tableWrap, dataTable(['Date', title], points.map((p) =>
    [shortDate(p.date), formatValue(Number(p.value) || 0)])));

  let geo = null;
  let svgNode = null;
  let hoverIndex = -1;

  function hideTip() {
    hoverIndex = -1;
    ui.tip.hidden = true;
    if (geo) {
      geo.slotHi.setAttribute('opacity', '0');
      if (geo.crosshair) geo.crosshair.setAttribute('opacity', '0');
      if (geo.focusDot) geo.focusDot.setAttribute('opacity', '0');
    }
  }

  function showTip(index) {
    if (!geo || index < 0 || index >= n) return;
    hoverIndex = index;
    const point = points[index];
    const value = Number(point.value) || 0;
    const cx = geo.padL + geo.slotW * (index + 0.5);
    const cy = geo.yOf(value);

    clear(ui.tip);
    append(ui.tip, [
      el('div', { class: 'tip-value' }, [
        el('span', { class: 'tip-key', style: { background: color } }),
        el('span', { text: formatValue(value) }),
      ]),
      el('div', { class: 'tip-label', text: longDate(point.date) }),
    ]);
    ui.tip.hidden = false;

    const width = ui.body.clientWidth || geo.width;
    const tipW = ui.tip.offsetWidth;
    const tipH = ui.tip.offsetHeight;
    ui.tip.style.left = `${clamp(cx - tipW / 2, 0, Math.max(0, width - tipW))}px`;
    ui.tip.style.top = `${Math.max(0, cy - tipH - 12)}px`;

    geo.slotHi.setAttribute('x', String(geo.padL + geo.slotW * index));
    geo.slotHi.setAttribute('width', String(Math.max(1, geo.slotW)));
    geo.slotHi.setAttribute('opacity', '1');
    if (geo.crosshair) {
      geo.crosshair.setAttribute('x1', String(cx));
      geo.crosshair.setAttribute('x2', String(cx));
      geo.crosshair.setAttribute('opacity', '1');
    }
    if (geo.focusDot) {
      geo.focusDot.setAttribute('cx', String(cx));
      geo.focusDot.setAttribute('cy', String(cy));
      geo.focusDot.setAttribute('opacity', '1');
    }
  }

  function render() {
    const width = Math.max(240, Math.round(ui.body.clientWidth || 320));
    const tickLabels = scale.ticks.map(formatTick);
    const widest = tickLabels.reduce((a, t) => Math.max(a, t.length), 1);
    const padL = clamp(widest * 6.6 + 10, 26, 58);
    const plotW = Math.max(40, width - padL - PAD_R);
    const height = PAD_T + PLOT_H + PAD_B;
    const slotW = n > 0 ? plotW / n : plotW;
    const yOf = (v) => PAD_T + PLOT_H - (clamp(v, 0, scale.max) / scale.max) * PLOT_H;

    svgNode = svg('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: 'img',
      tabindex: '0',
      'aria-label': `${title}. ${n} days, ${(formatTotal || formatValue)(sum)} ${totalLabel}.`
        + ' Use the left and right arrow keys to read each day.',
    });

    // recessive grid, drawn first
    const grid = svg('g', {});
    for (const tick of scale.ticks) {
      const y = yOf(tick);
      grid.appendChild(svg('line', {
        x1: padL, x2: padL + plotW, y1: y, y2: y,
        stroke: tick === 0 ? LINE_INK : LINE, 'stroke-width': 1,
      }));
      grid.appendChild(axisText({ x: padL - 8, y: y + 3.5, 'text-anchor': 'end' }, formatTick(tick)));
    }
    svgNode.appendChild(grid);

    const slotHi = svg('rect', {
      x: padL, y: PAD_T, width: Math.max(1, slotW), height: PLOT_H,
      fill: SLOT_HI, opacity: '0',
    });
    svgNode.appendChild(slotHi);

    let crosshair = null;
    let focusDot = null;

    if (kind === 'line' && n > 0) {
      const coords = points.map((p, i) => [padL + slotW * (i + 0.5), yOf(Number(p.value) || 0)]);
      const baseline = yOf(0);
      const area = `M${coords[0][0]} ${baseline} `
        + coords.map(([x, y]) => `L${x} ${y}`).join(' ')
        + ` L${coords[coords.length - 1][0]} ${baseline} Z`;
      svgNode.appendChild(svg('path', { d: area, fill: color, opacity: '0.1' }));
      if (n === 1) {
        svgNode.appendChild(svg('circle', { cx: coords[0][0], cy: coords[0][1], r: 4, fill: color }));
      } else {
        svgNode.appendChild(svg('path', {
          d: `M${coords.map(([x, y]) => `${x} ${y}`).join(' L')}`,
          fill: 'none', stroke: color, 'stroke-width': 2,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        }));
      }
      crosshair = svg('line', {
        x1: padL, x2: padL, y1: PAD_T, y2: PAD_T + PLOT_H,
        stroke: LINE_INK, 'stroke-width': 1, opacity: '0',
      });
      svgNode.appendChild(crosshair);
      focusDot = svg('circle', {
        cx: padL, cy: PAD_T, r: 4.5, fill: color,
        stroke: SURFACE, 'stroke-width': 2, opacity: '0',
      });
      svgNode.appendChild(focusDot);
    } else if (n > 0) {
      const barW = Math.max(1.5, Math.min(BAR_MAX, slotW - BAR_GAP));
      const bars = svg('g', {});
      points.forEach((p, i) => {
        const value = clamp(Number(p.value) || 0, 0, scale.max);
        const y = yOf(value);
        const h = PAD_T + PLOT_H - y;
        const d = columnPath(padL + slotW * i + (slotW - barW) / 2, y, barW, h);
        if (d) bars.appendChild(svg('path', { d, fill: color }));
      });
      svgNode.appendChild(bars);
    }

    // one selective direct label: the extreme
    if (n > 0 && rawMax > 0) {
      const cx = padL + slotW * (maxIndex + 0.5);
      const text = formatValue(rawMax);
      const half = text.length * 3.4 + 3;
      svgNode.appendChild(svg('text', {
        x: clamp(cx, padL + half, padL + plotW - half),
        y: Math.max(10, yOf(rawMax) - 7),
        'text-anchor': 'middle',
        'font-family': 'Inter, sans-serif', 'font-size': 11, 'font-weight': 600,
        fill: INK_2,
      }, text));
      if (kind === 'line' && n > 1) {
        svgNode.appendChild(svg('circle', {
          cx, cy: yOf(rawMax), r: 4, fill: color, stroke: SURFACE, 'stroke-width': 2,
        }));
        const lastIndex = n - 1;
        const lastValue = values[lastIndex];
        const lastX = padL + slotW * (lastIndex + 0.5);
        if (Math.abs(lastIndex - maxIndex) * slotW > 58 && lastValue > 0) {
          const lastText = formatValue(lastValue);
          svgNode.appendChild(svg('text', {
            x: Math.min(padL + plotW, lastX + 6), y: Math.max(10, yOf(lastValue) - 7),
            'text-anchor': 'end',
            'font-family': 'Inter, sans-serif', 'font-size': 11, 'font-weight': 500,
            fill: INK_3,
          }, lastText));
          svgNode.appendChild(svg('circle', {
            cx: lastX, cy: yOf(lastValue), r: 4, fill: color, stroke: SURFACE, 'stroke-width': 2,
          }));
        }
      }
    }

    // x axis labels
    const labelIndices = pickLabelIndices(n, plotW);
    labelIndices.forEach((i) => {
      if (!points[i]) return;
      const cx = padL + slotW * (i + 0.5);
      const first = i === labelIndices[0];
      const last = i === labelIndices[labelIndices.length - 1];
      svgNode.appendChild(axisText({
        x: first ? Math.max(padL, cx - 6) : last ? Math.min(padL + plotW, cx + 6) : cx,
        y: PAD_T + PLOT_H + 15,
        'text-anchor': first ? 'start' : last ? 'end' : 'middle',
      }, shortDate(points[i].date)));
    });

    // one big hit layer: the pointer only has to be nearest, never dead-centre
    svgNode.appendChild(svg('rect', {
      x: padL, y: 0, width: plotW, height,
      fill: 'transparent', style: 'cursor:crosshair',
    }));

    geo = { padL, plotW, slotW, width, yOf, slotHi, crosshair, focusDot };

    svgNode.addEventListener('pointermove', (event) => {
      const rect = svgNode.getBoundingClientRect();
      if (!rect.width || n === 0) return;
      const px = (event.clientX - rect.left) * (width / rect.width);
      if (px < padL - 4 || px > padL + plotW + 4) { hideTip(); return; }
      showTip(clamp(Math.round((px - padL - slotW / 2) / slotW), 0, n - 1));
    });
    svgNode.addEventListener('pointerleave', hideTip);
    svgNode.addEventListener('focus', () => { if (n) showTip(hoverIndex >= 0 ? hoverIndex : n - 1); });
    svgNode.addEventListener('blur', hideTip);
    svgNode.addEventListener('keydown', (event) => {
      if (!n) return;
      const start = hoverIndex >= 0 ? hoverIndex : n - 1;
      let next = null;
      if (event.key === 'ArrowRight') next = Math.min(n - 1, start + 1);
      else if (event.key === 'ArrowLeft') next = Math.max(0, start - 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = n - 1;
      else if (event.key === 'Escape') { hideTip(); return; }
      if (next === null) return;
      event.preventDefault();
      showTip(next);
    });

    const previous = ui.body.querySelector('svg');
    if (previous) previous.remove();
    ui.body.insertBefore(svgNode, ui.tip);
  }

  render();

  let frame = 0;
  let lastWidth = ui.body.clientWidth;
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      const width = ui.body.clientWidth;
      if (!width || Math.abs(width - lastWidth) < 4) return;
      lastWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { hideTip(); render(); });
    })
    : null;
  if (observer) observer.observe(ui.body);

  return {
    root: ui.root,
    destroy() {
      if (observer) observer.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}

/**
 * The acquisition funnel: horizontal bars with the conversion rate between
 * each pair of steps. Ordered categories, so the sage ramp deepens with depth.
 */
export function funnelChart({ steps = [], conversions = [], formatRate }) {
  const ui = card({
    title: 'Funnel',
    sub: 'lead → contacted → booked → won, this window',
    accessibleName: 'Acquisition funnel',
  });
  ui.total.remove();

  const top = Math.max(1, ...steps.map((s) => Number(s.value) || 0));

  append(ui.tableWrap, dataTable(['Step', 'Leads', 'From previous'], steps.map((step, i) => [
    step.label,
    String(Number(step.value) || 0),
    i === 0 ? '—' : formatRate(conversions[i - 1]?.value),
  ])));

  const ROW_H = 44;
  const GAP_H = 30;
  const BAR_H = 12;
  let svgNode = null;
  let hoverIndex = -1;
  let rowHighlight = null;
  let rowGeometry = [];

  function hideTip() {
    hoverIndex = -1;
    ui.tip.hidden = true;
    if (rowHighlight) rowHighlight.setAttribute('opacity', '0');
  }

  function showTip(index) {
    const step = steps[index];
    const row = rowGeometry[index];
    if (!step || !row) return;
    hoverIndex = index;
    const value = Number(step.value) || 0;
    const share = top > 0 ? value / top : null;

    clear(ui.tip);
    append(ui.tip, [
      el('div', { class: 'tip-value' }, [
        el('span', { class: 'tip-key', style: { background: step.color } }),
        el('span', { text: String(value) }),
      ]),
      el('div', {
        class: 'tip-label',
        text: index === 0
          ? step.label
          : `${step.label} · ${formatRate(share)} of leads`,
      }),
    ]);
    ui.tip.hidden = false;

    const width = ui.body.clientWidth || row.width;
    const tipW = ui.tip.offsetWidth;
    const tipH = ui.tip.offsetHeight;
    ui.tip.style.left = `${clamp(row.barEnd - tipW / 2, 0, Math.max(0, width - tipW))}px`;
    ui.tip.style.top = `${Math.max(0, row.barY - tipH - 8)}px`;

    if (rowHighlight) {
      rowHighlight.setAttribute('y', String(row.y - 4));
      rowHighlight.setAttribute('opacity', '1');
    }
  }

  function render() {
    const width = Math.max(240, Math.round(ui.body.clientWidth || 320));
    const height = steps.length * ROW_H + Math.max(0, steps.length - 1) * GAP_H + 6;
    rowGeometry = [];
    svgNode = svg('svg', {
      viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', tabindex: '0',
      'aria-label': 'Acquisition funnel. Use the up and down arrow keys to read each step,'
        + ' or switch to the table view.',
    });
    rowHighlight = svg('rect', {
      x: -4, y: -99, width: width + 8, height: ROW_H + 8, rx: 2, fill: SLOT_HI, opacity: '0',
    });
    svgNode.appendChild(rowHighlight);

    steps.forEach((step, i) => {
      const value = Number(step.value) || 0;
      const y = i * (ROW_H + GAP_H);
      const barY = y + 24;

      svgNode.appendChild(svg('text', {
        x: 0, y: y + 12, 'font-family': 'Inter, sans-serif', 'font-size': 13,
        'font-weight': 600, fill: INK,
      }, step.label));
      svgNode.appendChild(svg('text', {
        x: width, y: y + 13, 'text-anchor': 'end', 'font-family': 'Inter, sans-serif',
        'font-size': 15, 'font-weight': 600, fill: INK,
        style: 'font-variant-numeric:tabular-nums',
      }, String(value)));

      svgNode.appendChild(svg('rect', { x: 0, y: barY, width, height: BAR_H, rx: 2, fill: TRACK }));
      const w = (value / top) * width;
      const d = rowPath(0, barY, w, BAR_H);
      if (d) svgNode.appendChild(svg('path', { d, fill: step.color }));

      rowGeometry.push({ y, barY, barEnd: Math.max(28, w), width });

      if (i < steps.length - 1) {
        const conversion = conversions[i];
        const gapY = barY + BAR_H;
        svgNode.appendChild(svg('line', {
          x1: 6, x2: 6, y1: gapY + 3, y2: gapY + GAP_H - 2,
          stroke: LINE, 'stroke-width': 1,
        }));
        svgNode.appendChild(svg('text', {
          x: 18, y: gapY + GAP_H - 7, 'font-family': 'Inter, sans-serif', 'font-size': 12, fill: INK_2,
        }, [
          svg('tspan', { 'font-weight': 600, fill: INK, style: 'font-variant-numeric:tabular-nums' },
            formatRate(conversion?.value)),
          svg('tspan', {}, ` ${conversion?.label || ''}`),
        ]));
      }
    });

    // hit targets: the whole row, not just the painted bar
    steps.forEach((step, i) => {
      const hit = svg('rect', {
        x: 0, y: i * (ROW_H + GAP_H) - 4, width, height: ROW_H + 8, fill: 'transparent',
      });
      hit.addEventListener('pointerenter', () => showTip(i));
      hit.addEventListener('pointermove', () => { if (hoverIndex !== i) showTip(i); });
      svgNode.appendChild(hit);
    });
    svgNode.addEventListener('pointerleave', hideTip);
    svgNode.addEventListener('focus', () => showTip(hoverIndex >= 0 ? hoverIndex : 0));
    svgNode.addEventListener('blur', hideTip);
    svgNode.addEventListener('keydown', (event) => {
      const start = hoverIndex >= 0 ? hoverIndex : 0;
      let next = null;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Math.min(steps.length - 1, start + 1);
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0, start - 1);
      else if (event.key === 'Escape') { hideTip(); return; }
      if (next === null) return;
      event.preventDefault();
      showTip(next);
    });

    const previous = ui.body.querySelector('svg');
    if (previous) previous.remove();
    ui.body.insertBefore(svgNode, ui.tip);
  }

  render();

  let frame = 0;
  let lastWidth = ui.body.clientWidth;
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      const width = ui.body.clientWidth;
      if (!width || Math.abs(width - lastWidth) < 4) return;
      lastWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { hideTip(); render(); });
    })
    : null;
  if (observer) observer.observe(ui.body);

  return {
    root: ui.root,
    destroy() {
      if (observer) observer.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
