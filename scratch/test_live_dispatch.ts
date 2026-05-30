import { prepareMorning } from '../src/lib/marketing-v2/prepare/morning';
import { dispatchToAll } from '../src/app/api/cron/dispatch-v2/_shared';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testLive() {
  console.log('=== Testing Live prepareMorning for 2026-05-26 ===');
  try {
    const pkg = await prepareMorning({ date: '2026-05-26', dryRun: true });
    console.log('✅ prepareMorning completed successfully!');
    console.log('Package data keys:', Object.keys(pkg));
    console.log('Images:', pkg.images);
    console.log('Metrics:', pkg.metrics);

    console.log('\nCalling dispatchToAll...');
    const results = await dispatchToAll(pkg, { dryRun: true, draft: false, region: 'all' });
    console.log('✅ dispatchToAll completed successfully!');
    console.log('Results:', results);
  } catch (err: any) {
    console.error('❌ FAILED with error:', err);
    if (err.stack) {
      console.error(err.stack);
    }
  }
}

testLive().catch(console.error);
