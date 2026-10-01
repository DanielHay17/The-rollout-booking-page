/**
 * Vitest, running inside workerd via @cloudflare/vitest-pool-workers.
 *
 * The tests exercise the real Worker against a real D1 database, because the
 * things most worth protecting here — fail-closed auth, webhook idempotency,
 * board-rank renumbering, the three different cost-per numbers — are all
 * behaviours of SQL plus TypeScript together. A mocked D1 would test neither.
 *
 * Bindings come from wrangler.jsonc so a binding rename breaks the tests rather
 * than silently diverging from production. The secret-shaped values are
 * overridden here with obvious test placeholders: nothing in this directory is
 * a real credential, and the real ones live only in `wrangler secret put`.
 */

import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  // Read the migrations in Node, at config time: the test worker cannot read
  // the filesystem, so the SQL is handed to it as a binding and replayed by
  // `applyD1Migrations` in the setup file. All three migrations are declared,
  // so the test schema is 0001 + 0002 + 0003 — exactly what production will be
  // once 0003 is applied.
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));

  return {
    test: {
      // Each test file gets the migrated schema, then its own isolated
      // storage, so one test's leads cannot leak into another's counts.
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          isolatedStorage: true,
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: {
            // Not real values. Deliberately unusable ones: the team domain is
            // a .test TLD that cannot resolve, and the secrets are visibly
            // fake, so a test that accidentally reaches the network fails
            // loudly instead of talking to Cloudflare or beehiiv.
            bindings: {
              TEST_MIGRATIONS: migrations,
              ACCESS_TEAM_DOMAIN: 'rollout-test.cloudflareaccess.test',
              ACCESS_AUD: 'test-access-aud-placeholder',
              ALLOWED_EMAILS: 'operator@example.test, second.operator@example.test',
              BEEHIIV_WEBHOOK_SECRET: 'test-webhook-secret-placeholder',
              BEEHIIV_API_KEY: 'test-beehiiv-key-placeholder',
              META_ACCESS_TOKEN: 'test-meta-token-placeholder',
            },
          },
        },
      },
    },
  };
});
