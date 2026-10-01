// Small pieces of lead chrome shared by the queue, the board and the drawer.

import { el, svg } from './dom.js';
import {
  EM_DASH, daysOverdue, int, money, relativeDay, stageLabel, telHref,
} from './format.js';

export function stageChip(status) {
  return el('span', { class: `stage-chip stage-${status || 'new'}`, text: stageLabel(status) });
}

export function sourceChip(lead) {
  if (!lead.source) return el('span', { class: 'chip chip-source', text: 'no source' });
  return el('span', { class: 'chip chip-source', text: lead.source });
}

export function attemptsChip(lead) {
  const n = Number(lead.attempts) || 0;
  return el('span', {
    class: 'chip',
    text: n === 0 ? 'never contacted' : `${n} ${n === 1 ? 'attempt' : 'attempts'}`,
  });
}

export function lastContactText(lead) {
  return lead.last_contact ? `Last contact ${relativeDay(lead.last_contact)}` : 'No contact logged';
}

const HANDSET = 'M5.3 2.1 7 4.6 5.5 6c.9 1.7 2 2.8 3.7 3.7l1.4-1.5 2.5 1.7-.7 1.5'
  + 'c-.3.7-1 1.1-1.8 1C6.6 11.9 3.6 8.9 3.1 4.4c-.1-.8.3-1.5 1-1.8l1.2-.5z';

export function phoneIcon(size = 13) {
  return svg('svg', {
    width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false',
  }, svg('path', {
    d: HANDSET, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));
}

/** The one-tap call affordance. Falls back to a visible "no phone" marker. */
export function callButton(lead) {
  const href = telHref(lead.phone);
  if (!href) return el('div', { class: 'no-phone', text: 'No phone number' });
  return el('a', {
    class: 'btn btn-primary call-btn',
    href,
    'aria-label': `Call ${lead.phone}`,
  }, [
    phoneIcon(13),
    el('span', {}, 'Call'),
    el('span', { class: 'phone', text: lead.phone }),
  ]);
}

export function phoneLink(lead) {
  const href = telHref(lead.phone);
  if (!href) return el('span', { class: 'muted', style: { fontSize: '12px' }, text: 'no phone' });
  return el('a', {
    class: 'card-phone', href, 'aria-label': `Call ${lead.phone}`,
    onPointerdown: (event) => event.stopPropagation(),
  }, [
    phoneIcon(11),
    el('span', { text: lead.phone }),
  ]);
}

export function surveyBlock(lead, { keyFirst = true } = {}) {
  const items = [];
  if (lead.survey_help) {
    items.push(el('div', { class: keyFirst ? 'survey-item is-key' : 'survey-item' }, [
      el('span', { class: 'eyebrow', text: 'Wants help with' }),
      el('p', { text: lead.survey_help }),
    ]));
  }
  if (lead.survey_ai_stage) {
    items.push(el('div', { class: 'survey-item' }, [
      el('span', { class: 'eyebrow', text: 'Where they are with AI' }),
      el('p', { text: lead.survey_ai_stage }),
    ]));
  }
  if (!items.length) {
    return el('div', { class: 'survey' }, el('div', { class: 'survey-item' }, [
      el('p', { class: 'muted', text: 'No survey answers came through from beehiiv.' }),
    ]));
  }
  return el('div', { class: 'survey' }, items);
}

export function nextActionLine(lead) {
  const overdueBy = lead.next_action_at ? daysOverdue(lead.next_action_at) : 0;
  const overdue = Boolean(lead.is_overdue) || overdueBy > 0;
  if (!lead.next_action && !lead.next_action_at) {
    return el('div', { class: 'next-line' }, [
      el('span', { class: 'label', text: 'Next action' }),
      el('span', { class: 'muted', text: 'not set' }),
    ]);
  }
  return el('div', { class: 'next-line' }, [
    el('span', { class: 'label', text: 'Next action' }),
    el('span', { text: lead.next_action || 'follow up' }),
    lead.next_action_at
      ? el('span', {
        class: overdue ? 'chip chip-alert' : 'chip',
        text: overdue
          ? `overdue ${overdueBy === 1 ? '1 day' : `${overdueBy} days`}`
          : `due ${relativeDay(lead.next_action_at)}`,
      })
      : null,
  ]);
}

export function dealChip(lead) {
  const cents = Number(lead.deal_amount_cents) || 0;
  if (cents <= 0) return null;
  return el('span', { class: 'card-deal', text: money(cents) });
}

export function metaFoot(lead) {
  const parts = [];
  const n = Number(lead.attempts) || 0;
  parts.push(el('span', { text: n === 0 ? 'no attempts' : `${n} ${n === 1 ? 'attempt' : 'attempts'}` }));
  parts.push(el('span', { text: lead.last_contact ? relativeDay(lead.last_contact) : 'never contacted' }));
  return el('div', { class: 'card-foot' }, parts);
}

export function countLabel(n, singular, plural) {
  return `${int(n)} ${Number(n) === 1 ? singular : plural || `${singular}s`}`;
}

export const DASH = EM_DASH;
