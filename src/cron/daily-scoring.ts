// src/cron/daily-scoring.ts
// Entry point for daily scoring pipeline. Run via: npm run score

import { runScoring } from '../scoring/index';
import { parseHorizonArg } from '../shared/utils';

async function main() {
  const horizons = parseHorizonArg(process.argv);

  console.log(`Starting daily scoring for horizons: ${horizons.join(', ')} months`);
  console.log(`Date: ${new Date().toISOString()}`);

  const failures: number[] = [];
  for (const horizon of horizons) {
    try {
      await runScoring(horizon);
    } catch (error) {
      console.error(`Failed for horizon ${horizon}mo:`, error);
      failures.push(horizon);
    }
  }

  console.log('\nAll scoring runs complete.');
  if (failures.length > 0) {
    console.error(`Scoring failed for horizons: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
