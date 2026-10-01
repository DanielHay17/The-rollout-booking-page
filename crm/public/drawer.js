// The lead drawer. Opens over any view: everything known about one lead, the
// survey answers he reads out on the phone, the full history, and every edit
// he needs to make between calls.

import { api } from './api.js';
import { el, clear, append, field, skeleton, stateBlock } from './dom.js';
import {
  centsToDollarInput, channelLabel, companyLine, dateTime, dollarsToCents, duration,
  EM_DASH, fullName, longDate, money, outcomeLabel, relativeDay, shiftISO, STAGES,
  stageLabel, telHref,
} from './format.js';
import { surveyBlock } from './lead-ui.js';
import { contactLogForm } from './log-form.js';

const MAX_TIMELINE = 80;

function row(label, value) {
  return [el('dt', { text: label }), el('dd', { text: value || EM_DASH })];
}

function sectionBlock(title, children) {
  return el('section', { class: 'dsec' }, [
    el('span', { class: 'eyebrow', text: title }),
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

export function createDrawer(ctx) {
  const node = document.getElementById('drawer');
  const scrim = document.getElementById('scrim');
  let currentId = null;
  let detail = null;
  let opener = null;
  let busy = false;

  scrim.addEventListener('click', () => close());

  node.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...node.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function close() {
    if (currentId === null) return;
    currentId = null;
    detail = null;
    node.hidden = true;
    scrim.hidden = true;
    clear(node);
    document.body.classList.remove('has-drawer');
    ctx.setLead(null);
    if (opener && opener.isConnected) opener.focus();
    opener = null;
  }

  async function open(id, { from = null } = {}) {
    const next = Number(id);
    if (!Number.isFinite(next)) return;
    opener = from || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    currentId = next;
    node.hidden = false;
    scrim.hidden = false;
    document.body.classList.add('has-drawer');
    clear(node);
    append(node, el('div', { class: 'drawer-body' }, skeleton(5)));
    await reload({ focus: true });
  }

  async function reload({ focus = false } = {}) {
    const id = currentId;
    if (id === null) return;
    try {
      detail = await api.lead(id);
      if (currentId !== id) return;
      render({ focus });
    } catch (err) {
      if (ctx.fatal(err)) return;
      clear(node);
      append(node, el('div', { class: 'drawer-body' }, [
        el('div', { class: 'drawer-actions' }, [
          el('button', { class: 'btn', type: 'button', text: 'Close', onClick: close }),
        ]),
        stateBlock({
          alert: true,
          title: err.isNotFound ? 'That lead is gone' : 'The lead did not load',
          body: err.message,
          actions: [el('button', { class: 'btn', type: 'button', text: 'Try again', onClick: () => reload() })],
        }),
      ]));
    }
  }

  async function mutate(label, work) {
    if (busy) return;
    busy = true;
    try {
      await work();
      ctx.notify(label);
      ctx.onDataChanged();
      await reload();
    } catch (err) {
      if (!ctx.fatal(err)) ctx.notify(err.message || 'That change did not save.', { alert: true });
    } finally {
      busy = false;
    }
  }

  /* ------------------------------------------------------------- sections */

  function head() {
    const name = fullName(detail);
    const close_ = el('button', {
      class: 'icon-btn drawer-close', type: 'button', 'aria-label': 'Close',
      onClick: close,
    }, '×');

    const chips = [
      el('span', { class: `stage-chip stage-${detail.status || 'new'}`, text: stageLabel(detail.status) }),
      el('span', { class: 'chip chip-source', text: detail.source || 'no source' }),
      el('span', {
        class: 'chip',
        text: `${(detail.calls || []).length} ${(detail.calls || []).length === 1 ? 'contact' : 'contacts'} logged`,
      }),
      detail.owner ? el('span', { class: 'chip', text: detail.owner }) : null,
      detail.priority ? el('span', { class: 'chip', text: `priority: ${detail.priority}` }) : null,
    ];

    return el('div', { class: 'drawer-head' }, [
      el('div', { class: 'drawer-head-top' }, [
        el('div', { style: { minWidth: '0' } }, [
          el('h2', { id: 'drawer-title', text: name }),
          companyLine(detail) ? el('div', { class: 'sub', text: companyLine(detail) }) : null,
          detail.email ? el('div', { class: 'sub muted', text: detail.email }) : null,
        ]),
        close_,
      ]),
      el('div', { class: 'chips' }, chips),
    ]);
  }

  function actions() {
    const tel = telHref(detail.phone);
    return el('div', { class: 'drawer-actions' }, [
      tel
        ? el('a', { class: 'btn btn-primary', href: tel }, `Call ${detail.phone}`)
        : el('div', { class: 'no-phone', text: 'No phone number on file' }),
      detail.email ? el('a', { class: 'btn', href: `mailto:${detail.email}`, text: 'Email' }) : null,
      detail.website
        ? el('a', {
          class: 'btn', href: /^https?:/i.test(detail.website) ? detail.website : `https://${detail.website}`,
          target: '_blank', rel: 'noreferrer noopener', text: 'Website',
        })
        : null,
    ]);
  }

  function stageSection() {
    const buttons = STAGES.map((stage) => el('button', {
      class: stage.id === detail.status ? 'btn btn-primary btn-sm' : 'btn btn-sm',
      type: 'button',
      'aria-current': stage.id === detail.status ? 'true' : 'false',
      text: stage.label,
      title: stage.blurb,
      onClick: () => {
        if (stage.id === detail.status) return;
        mutate(`${fullName(detail)} moved to ${stage.label}.`, () =>
          api.patchLead(detail.id, { status: stage.id }));
      },
    }));

    const lostReason = field('Why it died (optional)', {
      value: detail.lost_reason || '', placeholder: 'e.g. price, timing, went with someone else',
    });
    const saveReason = el('button', {
      class: 'btn btn-sm', type: 'button', text: 'Save reason',
      onClick: () => mutate('Saved.', () =>
        api.patchLead(detail.id, { lost_reason: lostReason.control.value.trim() })),
    });

    return sectionBlock('Stage', [
      el('div', { class: 'btn-row' }, buttons),
      detail.status === 'lost'
        ? el('div', { class: 'dsec-grid', style: { marginTop: '12px' } }, [
          lostReason.wrap,
          el('div', {}, saveReason),
        ])
        : null,
    ]);
  }

  function nextActionSection() {
    const action = field('Next action', {
      value: detail.next_action || '', placeholder: 'e.g. call back after the Xero migration',
    });
    const when = field('Date', { type: 'date', value: detail.next_action_at ? String(detail.next_action_at).slice(0, 10) : '' });
    const quick = el('div', { class: 'quick-dates' }, [
      ['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7],
    ].map(([label, days]) => el('button', {
      class: 'btn btn-sm btn-quiet', type: 'button', text: label,
      onClick: () => { when.control.value = shiftISO(days); },
    })));
    when.wrap.appendChild(quick);

    const save = el('button', {
      class: 'btn btn-primary btn-sm', type: 'button', text: 'Save next action',
      onClick: () => mutate('Next action saved.', () => api.patchLead(detail.id, {
        next_action: action.control.value.trim(),
        next_action_at: when.control.value || '',
      })),
    });
    const clearBtn = (detail.next_action || detail.next_action_at)
      ? el('button', {
        class: 'btn btn-sm', type: 'button', text: 'Clear',
        onClick: () => mutate('Next action cleared.', () =>
          api.patchLead(detail.id, { next_action: '', next_action_at: '' })),
      })
      : null;

    return sectionBlock('Next action', [
      el('div', { class: 'field-row' }, [action.wrap, when.wrap]),
      el('div', { class: 'logform-actions' }, [el('span', { class: 'spacer' }), clearBtn, save]),
    ]);
  }

  function dealSection() {
    const deals = Array.isArray(detail.deals) ? detail.deals : [];
    const wonTotal = deals
      .filter((deal) => deal.status === 'won')
      .reduce((sum, deal) => sum + (Number(deal.amount_cents) || 0), 0);

    const amount = field('Amount (AUD)', { inputmode: 'decimal', placeholder: '4500' });
    const error = el('div', { class: 'form-error', hidden: true, role: 'alert' });
    const record = el('button', {
      class: 'btn btn-primary btn-sm', type: 'button', text: 'Record the sale',
      onClick: () => {
        const cents = dollarsToCents(amount.control.value);
        if (cents === null || cents < 0) {
          error.textContent = 'Type the amount in dollars, e.g. 4500 or 4500.50.';
          error.hidden = false;
          return;
        }
        error.hidden = true;
        mutate(`Logged ${money(cents)} against ${fullName(detail)}.`, () =>
          api.createDeal(detail.id, { amount_cents: cents, status: 'won' }));
      },
    });

    const existing = deals.map((deal) => {
      const edit = el('input', {
        class: 'deal-amount', type: 'text', inputmode: 'decimal',
        'aria-label': `Amount in dollars for ${deal.name || `deal ${deal.id}`}`,
      });
      edit.value = centsToDollarInput(deal.amount_cents);
      const save = el('button', {
        class: 'btn btn-sm', type: 'button', text: 'Save',
        onClick: () => {
          const cents = dollarsToCents(edit.value);
          if (cents === null || cents < 0) {
            ctx.notify('That is not an amount I can read. Try 4500 or 4500.50.', { alert: true });
            return;
          }
          if (cents === Number(deal.amount_cents)) { ctx.notify('Nothing changed.'); return; }
          mutate(`Deal updated to ${money(cents)}.`, () => api.updateDeal(deal.id, { amount_cents: cents }));
        },
      });
      const stageClass = deal.status === 'won' ? 'won' : deal.status === 'lost' ? 'lost' : 'new';
      return el('div', { class: 'deal-row' }, [
        el('span', { class: `stage-chip stage-${stageClass}`, text: deal.status }),
        el('span', { text: deal.name || (deal.closed_at ? relativeDay(deal.closed_at) : 'open') }),
        el('span', { class: 'amt' }, [el('span', { class: 'muted', text: '$' }), edit]),
        save,
      ]);
    });

    return sectionBlock('Did they buy', [
      el('p', { class: 'dsec-note' }, deals.length
        ? `${money(wonTotal)} won across ${deals.length} ${deals.length === 1 ? 'deal' : 'deals'}.`
        : 'Nothing recorded yet. Add the amount when the sale lands — it is what makes LTV and true CAC real numbers.'),
      ...existing,
      el('div', { class: 'field-row', style: { marginTop: '10px' } }, [
        amount.wrap,
        el('div', { class: 'field' }, [el('label', {}, ' '), record]),
      ]),
      error,
    ]);
  }

  function detailsSection() {
    const inputs = {
      phone: field('Phone', { value: detail.phone || '', inputmode: 'tel' }),
      company: field('Company', { value: detail.company || '' }),
      role: field('Role', { value: detail.role || '' }),
      website: field('Website', { value: detail.website || '' }),
      owner: field('Owner', { value: detail.owner || '', inputmode: 'email' }),
      segment: field('Segment', { value: detail.segment || '' }),
    };
    const notes = field('Notes', {
      tag: 'textarea', rows: 4, value: detail.notes || '',
      placeholder: 'Anything worth remembering before the next call.',
    });

    const save = el('button', {
      class: 'btn btn-primary btn-sm', type: 'button', text: 'Save details',
      onClick: () => {
        const patch = {};
        for (const [key, input] of Object.entries(inputs)) {
          const value = input.control.value.trim();
          if (value !== String(detail[key] ?? '')) patch[key] = value;
        }
        const noteValue = notes.control.value;
        if (noteValue !== String(detail.notes ?? '')) patch.notes = noteValue;
        if (!Object.keys(patch).length) { ctx.notify('Nothing changed.'); return; }
        mutate('Details saved.', () => api.patchLead(detail.id, patch));
      },
    });

    return sectionBlock('Details', [
      el('div', { class: 'field-row' }, [inputs.phone.wrap, inputs.company.wrap]),
      el('div', { class: 'field-row' }, [inputs.role.wrap, inputs.website.wrap]),
      el('div', { class: 'field-row' }, [inputs.owner.wrap, inputs.segment.wrap]),
      notes.wrap,
      el('div', { class: 'logform-actions' }, [el('span', { class: 'spacer' }), save]),
    ]);
  }

  function factsSection() {
    const facts = [];
    facts.push(...row('Email', detail.email));
    facts.push(...row('Source', detail.source));
    facts.push(...row('Subscribed', detail.subscribed_at ? longDate(detail.subscribed_at) : null));
    facts.push(...row('beehiiv status', detail.beehiiv_status));
    facts.push(...row('Location', detail.location));
    if (detail.utm_campaign || detail.campaign_id || detail.utm_source) {
      facts.push(...row('Campaign', detail.utm_campaign || detail.campaign_id));
      facts.push(...row('UTM source', [detail.utm_source, detail.utm_medium].filter(Boolean).join(' / ')));
    }
    if (detail.referral_url) facts.push(...row('Referred by', detail.referral_url));
    facts.push(...row('Booked', detail.booked_at ? longDate(detail.booked_at) : null));
    facts.push(...row('Won', detail.won_at ? longDate(detail.won_at) : null));
    if (detail.lost_at) {
      facts.push(...row('Lost', longDate(detail.lost_at)));
      facts.push(...row('Lost reason', detail.lost_reason));
    }
    facts.push(...row('Created', detail.created_at ? dateTime(detail.created_at) : null));
    facts.push(...row('Last change', detail.updated_at ? dateTime(detail.updated_at) : null));

    return sectionBlock('Record', [
      el('dl', { class: 'kv' }, facts),
      detail.campaign_id || detail.utm_campaign
        ? null
        : el('p', {
          class: 'dsec-note',
          text: 'beehiiv reports acquisition as a channel only, so there is no campaign'
            + ' attached to this lead. Per-campaign numbers live on the Dashboard.',
        }),
    ]);
  }

  function timelineSection() {
    const items = [];

    for (const call of detail.calls || []) {
      items.push({
        when: call.called_at,
        accent: call.outcome === 'booked' ? 'is-accent' : call.outcome === 'not_interested' ? 'is-alert' : '',
        title: `${channelLabel(call.channel)} · ${outcomeLabel(call.outcome)}`,
        note: call.notes || '',
        meta: [duration(call.duration_s), call.actor].filter(Boolean).join(' · '),
      });
    }

    for (const event of detail.events || []) {
      if (event.type === 'contact') continue;        // the call rows above say it better
      let title = event.type;
      let accent = '';
      if (event.type === 'created') title = 'Landed in the CRM';
      else if (event.type === 'stage_change') {
        title = `${event.from_stage ? stageLabel(event.from_stage) : 'new'} → ${stageLabel(event.to_stage)}`;
        if (event.to_stage === 'won' || event.to_stage === 'booked') accent = 'is-accent';
        if (event.to_stage === 'lost') accent = 'is-alert';
      } else if (event.type === 'deal') { title = 'Deal recorded'; accent = 'is-accent'; }
      else if (event.type === 'note') title = 'Note';
      items.push({
        when: event.created_at,
        accent,
        title,
        note: event.detail || '',
        meta: event.actor || '',
      });
    }

    items.sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));

    if (!items.length) {
      return sectionBlock('History', el('p', { class: 'dsec-note', text: 'Nothing logged yet.' }));
    }

    return sectionBlock('History', el('div', { class: 'timeline' },
      items.slice(0, MAX_TIMELINE).map((item) => el('div', { class: 'tl-item' }, [
        el('div', { class: 'tl-rail' }, el('span', { class: `tl-dot ${item.accent}` })),
        el('div', {}, [
          el('div', { class: 'tl-when', text: dateTime(item.when) }),
          el('div', { class: 'tl-what', text: item.title }),
          item.note ? el('div', { class: 'tl-note', text: item.note }) : null,
          item.meta ? el('div', { class: 'tl-when', text: item.meta }) : null,
        ]),
      ]))));
  }

  function render({ focus = false } = {}) {
    const scroller = node.querySelector('.drawer-body');
    const scrollTop = scroller ? scroller.scrollTop : 0;
    clear(node);

    const log = contactLogForm(detail, {
      showDuration: true,
      submitLabel: 'Log it',
      onSaved: (updated, { outcome }) => {
        ctx.notify(`Logged — ${fullName(updated)} is now ${stageLabel(updated.status)} (${outcomeLabel(outcome)}).`);
        ctx.onDataChanged();
        reload();
      },
    });

    const body = el('div', { class: 'drawer-body' }, [
      actions(),
      sectionBlock('What they told beehiiv', surveyBlock(detail)),
      sectionBlock('Log a contact', log.root),
      nextActionSection(),
      stageSection(),
      dealSection(),
      detailsSection(),
      factsSection(),
      timelineSection(),
    ]);

    append(node, [head(), body]);
    body.scrollTop = scrollTop;
    const active = document.activeElement;
    const lostFocus = !active || active === document.body || !node.contains(active);
    if (focus || lostFocus) {
      const closeBtn = node.querySelector('.drawer-close');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    }
  }

  return { open, close, get leadId() { return currentId; } };
}
