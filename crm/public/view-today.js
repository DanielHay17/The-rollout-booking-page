// Today — the call queue from GET /api/queue, in the order it should be worked:
// overdue, then due today, then the suggested next calls.

import { api } from './api.js';
import { el, clear, append, skeleton, stateBlock } from './dom.js';
import {
  companyLine, fullName, int, longDate, outcomeLabel, stageLabel, todayISO,
} from './format.js';
import {
  attemptsChip, callButton, lastContactText, nextActionLine, sourceChip,
  stageChip, surveyBlock,
} from './lead-ui.js';
import { contactLogForm } from './log-form.js';

const SECTIONS = [
  {
    key: 'overdue',
    label: 'Overdue',
    note: 'chase these first — the date you set has passed',
    alert: true,
  },
  {
    key: 'today',
    label: 'Due today',
    note: 'the follow-ups you promised yourself for today',
    alert: false,
  },
  {
    key: 'next',
    label: 'Suggested next calls',
    note: 'no next action set · phone numbers first, then fewest attempts, then newest subscribers',
    alert: false,
  },
];

export function createTodayView(ctx) {
  const root = el('div', { class: 'view-today' });
  let data = null;
  let loading = false;

  function row(lead, { alert }) {
    const article = el('article', {
      class: alert ? 'qrow is-overdue' : 'qrow',
      dataset: { leadId: String(lead.id) },
    });

    const open = () => ctx.openLead(lead.id);

    const main = el('div', { class: 'qrow-main' }, [
      el('button', { class: 'qrow-name', type: 'button', text: fullName(lead), onClick: open }),
      companyLine(lead) ? el('div', { class: 'qrow-sub', text: companyLine(lead) }) : null,
      el('div', { class: 'qrow-meta' }, [
        stageChip(lead.status),
        sourceChip(lead),
        attemptsChip(lead),
        el('span', { class: 'muted', style: { fontSize: '12px' }, text: lastContactText(lead) }),
      ]),
      surveyBlock(lead),
      nextActionLine(lead),
    ]);

    const logBtn = el('button', { class: 'btn', type: 'button' }, 'Log contact');
    const side = el('div', { class: 'qrow-side' }, [
      callButton(lead),
      logBtn,
      lead.email
        ? el('a', { class: 'btn btn-quiet', href: `mailto:${lead.email}`, text: 'Email' })
        : null,
      el('button', { class: 'btn btn-quiet', type: 'button', text: 'Open details', onClick: open }),
    ]);

    let form = null;
    logBtn.addEventListener('click', () => {
      if (form) {
        const showing = form.root.hidden;
        form.root.hidden = !showing;
        logBtn.textContent = showing ? 'Hide form' : 'Log contact';
        if (showing) form.focus();
        return;
      }
      form = contactLogForm(lead, {
        onSaved: (updated, { outcome }) => {
          ctx.notify(`Logged — ${fullName(updated)} is now ${stageLabel(updated.status)} (${outcomeLabel(outcome)}).`);
          ctx.onDataChanged();
          refresh();
        },
        onCancel: () => {
          form.root.hidden = true;
          logBtn.textContent = 'Log contact';
          logBtn.focus();
        },
      });
      article.appendChild(form.root);
      logBtn.textContent = 'Hide form';
      form.focus();
    });

    append(article, [main, side]);
    return article;
  }

  function section(config, leads) {
    const list = leads || [];
    return el('section', {
      class: config.alert ? 'queue-section is-overdue' : 'queue-section',
    }, [
      el('div', { class: 'queue-section-head' }, [
        el('span', { class: 'eyebrow', text: config.label }),
        el('span', { class: 'count', text: int(list.length) }),
        el('span', { class: 'note', text: config.note }),
      ]),
      list.length
        ? el('div', { class: 'queue-list' }, list.map((lead) => row(lead, config)))
        : el('div', { class: 'col-empty', text: 'Nothing here.' }),
    ]);
  }

  function render() {
    clear(root);
    const overdue = data.overdue || [];
    const today = data.today || [];
    const next = data.next || [];
    const total = overdue.length + today.length + next.length;

    append(root, el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('span', { class: 'eyebrow', text: longDate(todayISO()) }),
        el('h1', { text: 'Call queue' }),
        el('p', {
          class: 'lede',
          text: 'Work it top to bottom. Tap to call, read their answers back to them,'
            + ' then log the outcome and set the next action before you hang up.',
        }),
      ]),
      el('div', { class: 'qhead-counts' }, [
        el('span', {
          class: overdue.length ? 'chip chip-alert' : 'chip',
          text: `${int(overdue.length)} overdue`,
        }),
        el('span', { class: 'chip', text: `${int(today.length)} due today` }),
        el('span', { class: 'chip', text: `${int(next.length)} suggested` }),
      ]),
    ]));

    if (total === 0) {
      append(root, stateBlock({
        title: 'The queue is clear',
        body: 'Nothing is overdue and nothing is due today. Either everyone has a future'
          + ' follow-up date, or there are no leads to work yet — pull the newest'
          + ' subscribers in from the Dashboard and they will show up here.',
        actions: [
          el('button', { class: 'btn btn-primary', type: 'button', text: 'Open the board', onClick: () => ctx.go('board') }),
          el('button', { class: 'btn', type: 'button', text: 'Open the dashboard', onClick: () => ctx.go('dashboard') }),
        ],
      }));
      return;
    }

    for (const config of SECTIONS) {
      const leads = data[config.key] || [];
      if (!leads.length && config.key !== 'next') continue;
      append(root, section(config, leads));
    }
  }

  async function fetchQueue({ soft }) {
    if (loading) return;
    loading = true;
    const scrollY = window.scrollY;
    if (soft && data) root.classList.add('is-stale');
    else if (!data) { clear(root); append(root, skeleton(4)); }
    try {
      data = await api.queue();
      render();
      if (soft) window.scrollTo({ top: scrollY });
    } catch (err) {
      if (ctx.fatal(err)) return;
      clear(root);
      append(root, stateBlock({
        alert: true,
        title: 'The call queue did not load',
        body: err.message,
        actions: [el('button', { class: 'btn', type: 'button', text: 'Try again', onClick: () => fetchQueue({ soft: false }) })],
      }));
    } finally {
      loading = false;
      root.classList.remove('is-stale');
    }
  }

  function refresh() { return fetchQueue({ soft: true }); }

  return {
    root,
    load: () => fetchQueue({ soft: false }),
    refresh,
    destroy() {},
    onQuery() {},
  };
}
