/**
 * Types for the bindings the test pool provides.
 *
 * `ProvidedEnv extends Env` means a test that reaches for a binding the Worker
 * does not declare is a typecheck failure, not a runtime surprise.
 */

import type { Env } from '../src/types';
import type { D1Migration } from 'cloudflare:test';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    /** The contents of migrations/, handed over by vitest.config.ts. */
    TEST_MIGRATIONS: D1Migration[];
  }
}
