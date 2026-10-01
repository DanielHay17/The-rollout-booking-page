/**
 * Applies every migration to the test database once per test file, before any
 * test runs. Writes made here sit outside the per-test isolated storage stack,
 * so the schema persists while each test's own rows are rolled back after it.
 */

import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
