// src/cron/daily-scoring.ts
// Entry point for daily scoring pipeline. Run via: npm run score

import { runScoring } from '../scoring/index';
import { parseHorizonArg } from '../shared/utils';

async function main() {
  const horizons = parseHorizonArg(process.argv);

  console.log(`Starting daily scoring for horizons: ${horizons.join(', ')} months`);
  console.log(`Date: ${new Date().toISOString()}`);

  for (const horizon of horizons) {
    try {
      await runScoring(horizon);
    } catch (error) {
      console.error(`Failed for horizon ${horizon}mo:`, error);
      // Continue with other horizons even if one fails
    }
  }

  console.log('\nAll scoring runs complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
