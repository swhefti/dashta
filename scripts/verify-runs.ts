// scripts/verify-runs.ts
// Post-run verification: confirm that the expected completed scoring_runs rows
// exist in Supabase for today. Exits non-zero if anything is missing.
//
// Usage:
//   tsx scripts/verify-runs.ts --horizon=all     (default)
//   tsx scripts/verify-runs.ts --horizon=3
//   tsx scripts/verify-runs.ts --horizon=6
//   tsx scripts/verify-runs.ts --horizon=12

import { createClient } from '@supabase/supabase-js';

const MODES = ['percentile', 'absolute'] as const;
const ALL_HORIZONS = [3, 6, 12] as const;

function parseHorizon(argv: string[]): number[] {
  const arg = argv.find((a) => a.startsWith('--horizon='))?.split('=')[1] ?? 'all';
  if (arg === 'all') return [...ALL_HORIZONS];
  const n = Number(arg);
  if (!ALL_HORIZONS.includes(n as 3 | 6 | 12)) {
    throw new Error(`Invalid --horizon=${arg}; expected 3, 6, 12, or "all"`);
  }
  return [n];
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');

  const horizons = parseHorizon(process.argv);
  const today = new Date().toISOString().split('T')[0];
  const expected = horizons.flatMap((h) => MODES.map((m) => ({ horizon: h, mode: m })));

  console.log(`Verifying scoring_runs for ${today}`);
  console.log(`Expected (${expected.length}): ${expected.map((e) => `${e.horizon}mo/${e.mode}`).join(', ')}`);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('scoring_runs')
    .select('run_date, time_horizon_months, scoring_mode, status, completed_at')
    .eq('run_date', today)
    .in('time_horizon_months', horizons);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  const found = new Map<string, { status: string; completed_at: string | null }>();
  for (const row of data ?? []) {
    const key = `${row.time_horizon_months}mo/${row.scoring_mode}`;
    const prev = found.get(key);
    // Prefer a completed row if duplicates exist
    if (!prev || (prev.status !== 'completed' && row.status === 'completed')) {
      found.set(key, { status: row.status, completed_at: row.completed_at });
    }
  }

  const missing: string[] = [];
  const notCompleted: string[] = [];
  for (const { horizon, mode } of expected) {
    const key = `${horizon}mo/${mode}`;
    const row = found.get(key);
    if (!row) {
      missing.push(key);
      console.error(`  MISSING: ${key}`);
    } else if (row.status !== 'completed') {
      notCompleted.push(`${key} (status=${row.status})`);
      console.error(`  NOT COMPLETED: ${key} status=${row.status}`);
    } else {
      console.log(`  OK: ${key} completed_at=${row.completed_at}`);
    }
  }

  if (missing.length > 0 || notCompleted.length > 0) {
    console.error(`\nVerification FAILED`);
    if (missing.length) console.error(`  Missing: ${missing.join(', ')}`);
    if (notCompleted.length) console.error(`  Not completed: ${notCompleted.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nVerification OK — ${expected.length}/${expected.length} runs completed for ${today}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
