/**
 * Stage normalisation — the single place legacy statuses are dealt with.
 *
 * The live database still PERMITS `never_called`, `follow_up` and `done`
 * (migration 0003 kept them in the CHECK constraint so the previously deployed
 * Worker could not start 500ing mid-deploy). Rows holding them may still exist.
 *
 * The rule, in both directions:
 *   READ  — every status that leaves the database goes through `normaliseStage`
 *   WRITE — only the seven current stages are ever written
 *
 * Nothing else in the codebase should contain the string 'never_called'.
 */

import { STAGES, STAGE_ORDER } from './types';
import type { Stage } from './types';

const LEGACY_TO_STAGE: Readonly<Record<string, Stage>> = {
  never_called: 'new',
  follow_up: 'attempting',
  done: 'lost',
};

/** Any status string from the database (or a legacy one) to a live stage. */
export function normaliseStage(raw: string | null | undefined): Stage {
  if (!raw) return 'new';
  const key = raw.trim().toLowerCase();
  if ((STAGES as readonly string[]).includes(key)) return key as Stage;
  return LEGACY_TO_STAGE[key] ?? 'new';
}

/** Validates a stage id coming in from a request body or query string. */
export function parseStage(raw: unknown): Stage | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return (STAGES as readonly string[]).includes(key) ? (key as Stage) : null;
}

/**
 * Every database value that reads as this stage, for use in a `status IN (...)`
 * filter. Without this, filtering the board by "New" would silently miss the
 * rows still stored as `never_called`.
 */
export function dbValuesForStage(stage: Stage): string[] {
  const legacy = Object.entries(LEGACY_TO_STAGE)
    .filter(([, mapped]) => mapped === stage)
    .map(([raw]) => raw);
  return [stage, ...legacy];
}

/** The database values that read as any of the given stages. */
export function dbValuesForStages(stages: readonly Stage[]): string[] {
  return stages.flatMap(dbValuesForStage);
}

/** Stages that are finished — excluded from the call queue and due counts. */
export const CLOSED_STAGES: readonly Stage[] = ['won', 'lost'];

export function stageOrder(stage: Stage): number {
  return STAGE_ORDER[stage];
}
