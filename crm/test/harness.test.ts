import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('harness', () => {
  it('has all three migrations applied', async () => {
    const applied = await env.DB.prepare('SELECT name FROM d1_migrations ORDER BY name').all<{
      name: string;
    }>();
    expect(applied.results.map((r) => r.name)).toEqual([
      '0001_init.sql',
      '0002_outreach_fields.sql',
      '0003_command_center.sql',
    ]);
  });

  it('has the 0003 tables', async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = tables.results.map((r) => r.name);
    for (const expected of [
      'leads', 'calls', 'campaigns', 'campaign_spend', 'deals',
      'lead_events', 'webhook_deliveries', 'sync_state',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('uses test-only placeholder secrets, never real ones', () => {
    expect(env.ALLOWED_EMAILS).toContain('example.test');
    expect(env.BEEHIIV_WEBHOOK_SECRET).toContain('placeholder');
    expect(env.ACCESS_TEAM_DOMAIN).toContain('.test');
  });
});
