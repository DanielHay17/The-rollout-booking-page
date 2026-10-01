// Logging a contact. Used inline in the call queue and inside the lead drawer,
// so a contact can always be recorded without leaving the view.

import { api } from './api.js';
import { el, field } from './dom.js';
import { CHANNELS, OUTCOMES, shiftISO } from './format.js';

export function contactLogForm(lead, {
  onSaved,
  onCancel = null,
  showDuration = false,
  submitLabel = 'Save contact',
} = {}) {
  const outcome = field('Outcome', { required: true }, [
    ['', 'Pick an outcome…'],
    ...OUTCOMES,
  ]);
  const channel = field('Channel', { value: 'call' }, CHANNELS);
  const notes = field('Notes', {
    tag: 'textarea', rows: 3, placeholder: 'What was said, what they want, what to chase.',
  });
  const nextAction = field('Next action', { placeholder: 'e.g. call back about the Xero rollout' });
  const nextDate = field('Next action date', { type: 'date' });
  const durationField = showDuration
    ? field('Call length (minutes)', { type: 'number', min: '0', step: '1', placeholder: '' })
    : null;

  const quick = el('div', { class: 'quick-dates' }, [
    ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14],
  ].map(([label, days]) => el('button', {
    class: 'btn btn-sm btn-quiet', type: 'button', text: label,
    onClick: () => { nextDate.control.value = shiftISO(days); },
  })));
  nextDate.wrap.appendChild(quick);

  const hasNext = Boolean(lead.next_action || lead.next_action_at);
  let clearControl = null;
  let clearWrap = null;
  if (hasNext) {
    clearControl = el('input', { type: 'checkbox', id: `clr${lead.id}` });
    clearWrap = el('label', { class: 'check-line', for: `clr${lead.id}` }, [
      clearControl,
      el('span', { text: 'Clear the next action — nothing left to chase' }),
    ]);
  }

  const error = el('div', { class: 'form-error', hidden: true, role: 'alert' });
  const save = el('button', { class: 'btn btn-primary', type: 'submit', text: submitLabel });
  const cancel = onCancel
    ? el('button', { class: 'btn', type: 'button', text: 'Cancel', onClick: onCancel })
    : null;

  const root = el('form', { class: 'logform', novalidate: true }, [
    el('div', { class: 'logform-grid' }, [
      outcome.wrap,
      channel.wrap,
      durationField ? durationField.wrap : null,
    ]),
    notes.wrap,
    el('div', { class: 'logform-grid' }, [nextAction.wrap, nextDate.wrap]),
    clearWrap,
    error,
    el('div', { class: 'logform-actions' }, [el('span', { class: 'spacer' }), cancel, save]),
  ]);

  function fail(message) {
    error.textContent = message;
    error.hidden = false;
  }

  root.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (!outcome.control.value) {
      fail('Pick an outcome — it is what moves the lead through the pipeline.');
      outcome.control.focus();
      return;
    }
    save.disabled = true;
    save.textContent = 'Saving…';
    try {
      const entry = { channel: channel.control.value, outcome: outcome.control.value };
      const noteText = notes.control.value.trim();
      if (noteText) entry.notes = noteText;
      if (durationField) {
        const minutes = Number(durationField.control.value);
        if (Number.isFinite(minutes) && minutes > 0) entry.duration_s = Math.round(minutes * 60);
      }

      const logged = await api.logCall(lead.id, entry);
      let updated = logged.lead;

      let patch = null;
      if (clearControl && clearControl.checked) {
        patch = { next_action: '', next_action_at: '' };
      } else {
        const draft = {};
        if (nextAction.control.value.trim()) draft.next_action = nextAction.control.value.trim();
        if (nextDate.control.value) draft.next_action_at = nextDate.control.value;
        if (Object.keys(draft).length) patch = draft;
      }
      if (patch) {
        const patched = await api.patchLead(lead.id, patch);
        updated = patched.lead;
      }

      onSaved(updated, { outcome: entry.outcome, channel: entry.channel });
    } catch (err) {
      fail(err.message || 'Could not save that contact.');
      save.disabled = false;
      save.textContent = submitLabel;
    }
  });

  return { root, focus: () => outcome.control.focus() };
}
