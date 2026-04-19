require('dotenv').config({ path: '.env.local' });
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

async function main() {
  console.log('=== Lambda v9.0 Backtesting Pipeline Test ===\n');
  
  const lambda = new LambdaClient({ region: 'us-east-1' });
  
  console.log('Invoking Lambda with forceRun...');
  console.log('(This will: 1. Record close prices, 2. Backfill 3-day-ago records)\n');
  
  const start = Date.now();
  const result = await lambda.send(new InvokeCommand({
    FunctionName: 'signum-harvest',
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({ forceRun: true }),
  }));
  
  const payload = JSON.parse(new TextDecoder().decode(result.Payload));
  const body = JSON.parse(payload.body || '{}');
  const elapsed = Math.round((Date.now() - start) / 1000);
  
  console.log(`Lambda completed in ${elapsed}s`);
  console.log(`Version: ${body.version}`);
  console.log(`Status: ${body.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Duration: ${body.duration}s`);
  
  if (body.results) {
    console.log('\n--- Results ---');
    console.log('Prices:', body.results.prices);
    console.log('GEX:', body.results.gex);
    console.log('RLSI:', JSON.stringify(body.results.rlsi));
    
    if (body.results.backtesting) {
      console.log('\n🎯 BACKTESTING PIPELINE:');
      console.log('  Close recorded:', body.results.backtesting.closeRecorded);
      console.log('  Backfilled (3d):', body.results.backtesting.backfilled);
      console.log('  3-day-ago date:', body.results.backtesting.date3dAgo);
      console.log('  Errors:', body.results.backtesting.errors);
    } else {
      console.log('\n⚠️ No backtesting results — check Lambda logs');
    }
    
    console.log('\nSMA:', typeof body.results.sma === 'object' ? body.results.sma.smaCount || JSON.stringify(body.results.sma) : body.results.sma);
    console.log('Unified:', body.results.unified ? JSON.stringify(body.results.unified).substring(0, 100) : 'N/A');
  }
  
  if (result.FunctionError) {
    console.log('\n❌ Function Error:', result.FunctionError);
    console.log('Payload:', JSON.stringify(payload).substring(0, 500));
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
