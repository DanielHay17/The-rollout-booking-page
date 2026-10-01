// Dashboard — the daily report, the unit economics and exactly which campaigns
// are running. Three endpoints, one date range, every zero-denominator ratio
// rendered as an em dash.

import { api } from './api.js';
import { el, clear, append, skeleton, stateBlock } from './dom.js';
import {
  EM_DASH, int, longDate, money, moneyTick, pct, ratio, shiftISO, STAGES, todayISO,
} from './format.js';
import { funnelChart, timeSeries } from './charts.js';

const RANGES = [7, 30, 90];

const SERIES = {
  spend: '#1A1A1A',
  leads: '#7BB5A8',
  booked: '#5A9387',
  won: '#37645A',
};

const FUNNEL_COLORS = ['#7BB5A8', '#5A9387', '#47786B', '#37645A'];

function stat(label, value, note, { accent = false } = {}) {
  return el('div', { class: accent ? 'stat is-accent' : 'stat' }, [
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: value === EM_DASH ? 'stat-value is-dash' : 'stat-value', text: value }),
    note ? el('div', { class: 'stat-note', text: note }) : null,
  ]);
}

function sectionHead(title, hint) {
  return el('div', { class: 'section-head' }, [
    el('h2', { text: title }),
    hint ? el('span', { class: 'hint', text: hint }) : null,
  ]);
}

function magnitude(value, max) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 76)) : 0;
  return el('span', { class: 'mag-track' }, el('span', { class: 'mag-bar', style: { width: `${width}px` } }));
}

export function createDashboardView(ctx) {
  const root = el('div', { class: 'view-dashboard' });
  let charts = [];
  let loading = false;
  let loaded = null;        // { summary, daily, campaigns } — whichever resolved
  let syncing = false;

  function destroyCharts() {
    for (const chart of charts) chart.destroy();
    charts = [];
  }

  function windowOf() {
    const days = ctx.state.range;
    return { from: shiftISO(-(days - 1)), to: todayISO() };
  }

  /* --------------------------------------------------------------- pieces */

  function controls(summaryWindow) {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Date range' },
      RANGES.map((days) => el('button', {
        type: 'button',
        'aria-pressed': days === ctx.state.range ? 'true' : 'false',
        text: `Last ${days} days`,
        onClick: () => { if (days !== ctx.state.range) ctx.setRange(days); },
      })));

    const note = summaryWindow
      ? `${longDate(summaryWindow.from)} to ${longDate(summaryWindow.to)} · ${int(summaryWindow.days ?? ctx.state.range)} days · AUD`
      : 'AUD';

    const beehiivBtn = el('button', { class: 'btn btn-sm', type: 'button', text: 'Pull beehiiv subscribers' });
    const metaBtn = el('button', { class: 'btn btn-sm', type: 'button', text: 'Pull Meta spend' });

    async function runSync(button, label, call, describe) {
      if (syncing) return;
      syncing = true;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Pulling…';
      try {
        const result = await call();
        ctx.notify(describe(result));
        const errors = Array.isArray(result.errors) ? result.errors : [];
        if (errors.length) ctx.notify(`${label}: ${errors[0]}`, { alert: true });
        ctx.onDataChanged();
        await load({ soft: true });
      } catch (err) {
        if (!ctx.fatal(err)) ctx.notify(`${label} sync failed — ${err.message}`, { alert: true });
      } finally {
        syncing = false;
        button.disabled = false;
        button.textContent = original;
      }
    }

    beehiivBtn.addEventListener('click', () => runSync(beehiivBtn, 'beehiiv', api.syncBeehiiv, (r) =>
      `beehiiv: ${int(r.created ?? 0)} new leads, ${int(r.updated ?? 0)} updated, ${int(r.skipped ?? 0)} unchanged.`));
    metaBtn.addEventListener('click', () => runSync(metaBtn, 'Meta', api.syncMeta, (r) =>
      `Meta: ${int(r.campaigns ?? 0)} campaigns and ${int(r.days ?? 0)} days of spend refreshed.`));

    return el('div', { class: 'controls-row' }, [
      seg,
      el('span', { class: 'window-note', text: note }),
      el('span', { class: 'spacer' }),
      beehiivBtn,
      metaBtn,
    ]);
  }

  function statRow(summary) {
    const leads = summary.leads || {};
    return el('div', { class: 'stat-row' }, [
      stat('Spend', money(summary.spend_cents), 'Meta ads, this window'),
      stat('Leads', int(leads.total),
        `${int(leads.paid ?? 0)} paid · ${int(leads.organic ?? 0)} organic`),
      stat('Cost per lead', money(summary.cost_per_lead_cents), 'blended: spend ÷ paid leads'),
      stat('Booked', int(summary.booked), 'calls put in the diary'),
      stat('Cost per booked call', money(summary.cost_per_booked_cents), 'spend ÷ calls booked'),
      stat('Won', int(summary.won), `customers closed · ${money(summary.revenue_cents)} revenue`),
      stat('True CAC', money(summary.cac_cents), 'spend ÷ customers won', { accent: true }),
      stat('LTV', money(summary.ltv_cents), 'all time: won revenue ÷ customers'),
      stat('LTV : CAC', ratio(summary.ltv_cac_ratio), 'lifetime value per dollar of CAC'),
      stat('ROAS', ratio(summary.roas), 'revenue ÷ spend, this window'),
    ]);
  }

  function dailySection(days) {
    const specs = [
      {
        title: 'Ad spend', sub: 'per day, from Meta', kind: 'line', color: SERIES.spend,
        value: (d) => Number(d.spend_cents) || 0, money: true, totalLabel: 'spent',
      },
      {
        title: 'New leads', sub: 'per day, new beehiiv subscribers', kind: 'bar', color: SERIES.leads,
        value: (d) => Number(d.new_leads) || 0, money: false, totalLabel: 'new leads',
      },
      {
        title: 'Calls booked', sub: 'per day', kind: 'bar', color: SERIES.booked,
        value: (d) => Number(d.booked) || 0, money: false, totalLabel: 'booked',
      },
      {
        title: 'Customers won', sub: 'per day', kind: 'bar', color: SERIES.won,
        value: (d) => Number(d.won) || 0, money: false, totalLabel: 'won',
      },
    ];

    const grid = el('div', { class: 'chart-grid' });
    for (const spec of specs) {
      const chart = timeSeries({
        title: spec.title,
        sub: spec.sub,
        kind: spec.kind,
        color: spec.color,
        points: days.map((day) => ({ date: day.date, value: spec.value(day) })),
        integer: !spec.money,
        formatValue: spec.money ? (v) => money(v) : (v) => int(v),
        formatTick: spec.money ? moneyTick : (v) => int(v),
        formatTotal: spec.money ? (v) => money(v) : (v) => int(v),
        totalLabel: spec.totalLabel,
      });
      charts.push(chart);
      grid.appendChild(chart.root);
    }
    return grid;
  }

  function funnelSection(summary) {
    const leads = summary.leads || {};
    const funnel = summary.funnel || {};
    const chart = funnelChart({
      steps: [
        { label: 'Leads', value: Number(leads.total) || 0, color: FUNNEL_COLORS[0] },
        { label: 'Contacted', value: Number(summary.contacted) || 0, color: FUNNEL_COLORS[1] },
        { label: 'Booked a call', value: Number(summary.booked) || 0, color: FUNNEL_COLORS[2] },
        { label: 'Won', value: Number(summary.won) || 0, color: FUNNEL_COLORS[3] },
      ],
      conversions: [
        { value: funnel.lead_to_contacted, label: 'of leads got contacted' },
        { value: funnel.contacted_to_booked, label: 'of those booked a call' },
        { value: funnel.booked_to_won, label: 'of booked calls bought' },
      ],
      formatRate: (value) => pct(value),
    });
    charts.push(chart);
    return chart.root;
  }

  function pipelinePanel(pipeline) {
    const rows = STAGES.map((stage) => [stage.label, Number(pipeline?.[stage.id]) || 0]);
    const max = Math.max(1, ...rows.map(([, count]) => count));
    return el('section', { class: 'chart-card' }, [
      el('div', { class: 'chart-head' }, [
        el('div', {}, [
          el('div', { class: 'chart-title', text: 'Pipeline right now' }),
          el('div', { class: 'chart-sub', text: 'current stock, not flow — unaffected by the date range' }),
        ]),
      ]),
      el('div', { style: { marginTop: '10px' } }, el('table', { class: 'data-table' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { scope: 'col', text: 'Stage' }),
          el('th', { class: 'num', scope: 'col', text: 'Leads' }),
          el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Relative size')),
        ])),
        el('tbody', {}, rows.map(([label, count]) => el('tr', {}, [
          el('td', { text: label }),
          el('td', { class: 'num', text: int(count) }),
          el('td', { style: { width: '88px' } }, magnitude(count, max)),
        ]))),
      ])),
    ]);
  }

  function campaignsSection(data) {
    const campaigns = [...(data.campaigns || [])].sort((a, b) =>
      (Number(b.spend_cents) || 0) - (Number(a.spend_cents) || 0));
    const totals = data.totals || {};
    const maxSpend = Math.max(1, ...campaigns.map((c) => Number(c.spend_cents) || 0));

    const note = el('div', { class: 'note-box' }, [
      el('span', { class: 'eyebrow', text: 'How to read this' }),
      el('span', { text: data.attribution_note || '' }),
    ]);

    if (!campaigns.length) {
      return el('div', {}, [
        note,
        stateBlock({
          title: 'No campaign spend in this window',
          body: 'Nothing was reported by Meta for these dates. Pull Meta spend above, or widen the range.',
        }),
      ]);
    }

    const table = el('table', { class: 'sheet' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { scope: 'col', text: 'Campaign' }),
        el('th', { scope: 'col', text: 'Status' }),
        el('th', { class: 'num', scope: 'col', text: 'Spend' }),
        el('th', { class: 'num', scope: 'col', text: 'Impressions' }),
        el('th', { class: 'num', scope: 'col', text: 'Clicks' }),
        el('th', { class: 'num', scope: 'col', text: 'CTR' }),
        el('th', { class: 'num', scope: 'col', text: 'CPC' }),
        el('th', { class: 'num', scope: 'col', text: 'Results (Meta)' }),
        el('th', { class: 'num', scope: 'col', text: 'Cost/lead (Meta)' }),
      ])),
      el('tbody', {}, campaigns.map((campaign) => {
        const active = String(campaign.status || '').toUpperCase() === 'ACTIVE';
        return el('tr', {}, [
          el('td', { class: 'camp-name' }, [
            el('div', { text: campaign.name || `Campaign ${campaign.id}` }),
            campaign.objective
              ? el('div', { class: 'muted', style: { fontSize: '11px' }, text: campaign.objective })
              : null,
          ]),
          el('td', {}, el('span', {
            class: `camp-status ${active ? 'is-active' : 'is-off'}`,
            text: campaign.status || EM_DASH,
          })),
          el('td', { class: 'num' }, el('span', { class: 'mag' }, [
            magnitude(Number(campaign.spend_cents) || 0, maxSpend),
            el('span', { text: money(campaign.spend_cents) }),
          ])),
          el('td', { class: 'num', text: int(campaign.impressions) }),
          el('td', { class: 'num', text: int(campaign.clicks) }),
          el('td', { class: 'num', text: pct(campaign.ctr) }),
          el('td', { class: 'num', text: money(campaign.cpc_cents, { showCents: true }) }),
          el('td', { class: 'num', text: int(campaign.results) }),
          el('td', { class: 'num', text: money(campaign.cpl_cents) }),
        ]);
      })),
      el('tfoot', {}, el('tr', {}, [
        el('td', { text: `${int(campaigns.length)} campaigns` }),
        el('td', {}),
        el('td', { class: 'num', text: money(totals.spend_cents) }),
        el('td', { class: 'num', text: int(totals.impressions) }),
        el('td', { class: 'num', text: int(totals.clicks) }),
        el('td', { class: 'num', text: EM_DASH }),
        el('td', { class: 'num', text: EM_DASH }),
        el('td', { class: 'num', text: int(totals.results) }),
        el('td', { class: 'num', text: EM_DASH }),
      ])),
    ]);

    return el('div', {}, [note, el('div', { class: 'table-scroll' }, table)]);
  }

  function failed(title, error, retry) {
    return stateBlock({
      alert: true,
      title,
      body: error?.message || 'Something went wrong.',
      actions: [el('button', { class: 'btn', type: 'button', text: 'Try again', onClick: retry })],
    });
  }

  /* --------------------------------------------------------------- render */

  function render() {
    destroyCharts();
    clear(root);
    const retry = () => load({ soft: false });
    const { summary, daily, campaigns } = loaded;

    append(root, el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('span', { class: 'eyebrow', text: 'Daily report' }),
        el('h1', { text: 'Dashboard' }),
        el('p', {
          class: 'lede',
          text: 'What the ads cost, what they bought, and what the pipeline turned it into.'
            + ' Every number here is AUD, and a dash means the denominator was zero.',
        }),
      ]),
    ]));

    append(root, controls(summary.ok ? summary.value.window : null));

    append(root, el('section', { class: 'section' }, [
      sectionHead('Headline numbers', 'three different cost-per-X numbers — the labels say which is which'),
      summary.ok ? statRow(summary.value) : failed('The summary did not load', summary.error, retry),
    ]));

    append(root, el('section', { class: 'section' }, [
      sectionHead('The daily report', 'one series per chart — hover or focus a chart and use the arrow keys'),
      daily.ok
        ? (Array.isArray(daily.value.days) && daily.value.days.length
          ? dailySection(daily.value.days)
          : stateBlock({ title: 'No days in this window', body: 'Try a wider date range.' }))
        : failed('The daily series did not load', daily.error, retry),
    ]));

    if (summary.ok) {
      append(root, el('section', { class: 'section' }, [
        sectionHead('Funnel and stock', 'flow through the window on the left, what is sitting in the pipeline on the right'),
        el('div', { class: 'chart-grid' }, [
          funnelSection(summary.value),
          pipelinePanel(summary.value.pipeline),
        ]),
      ]));
    }

    append(root, el('section', { class: 'section' }, [
      sectionHead('Campaigns running', campaigns.ok ? campaigns.value.currency || 'AUD' : ''),
      campaigns.ok ? campaignsSection(campaigns.value) : failed('Campaigns did not load', campaigns.error, retry),
    ]));
  }

  async function load({ soft }) {
    if (loading) return;
    loading = true;
    if (soft && loaded) root.classList.add('is-stale');
    else if (!loaded) { clear(root); append(root, skeleton(6)); }

    const range = windowOf();
    const [summary, daily, campaigns] = await Promise.allSettled([
      api.summary(range), api.daily(range), api.campaigns(range),
    ]);

    const wrap = (result) => result.status === 'fulfilled'
      ? { ok: true, value: result.value }
      : { ok: false, error: result.reason };

    const authFailure = [summary, daily, campaigns]
      .map((r) => (r.status === 'rejected' ? r.reason : null))
      .find((err) => err && (err.isAuth || err.isMisconfigured));
    if (authFailure && ctx.fatal(authFailure)) {
      loading = false;
      root.classList.remove('is-stale');
      return;
    }

    loaded = { summary: wrap(summary), daily: wrap(daily), campaigns: wrap(campaigns) };
    render();
    loading = false;
    root.classList.remove('is-stale');
  }

  return {
    root,
    load: () => load({ soft: false }),
    refresh: () => load({ soft: true }),
    onQuery() {},
    destroy() { destroyCharts(); },
  };
}
