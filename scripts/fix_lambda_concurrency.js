require('dotenv').config({ path: '.env.local' });
const { LambdaClient, PutFunctionConcurrencyCommand, GetFunctionConcurrencyCommand } = require('@aws-sdk/client-lambda');

async function fix() {
  const lambda = new LambdaClient({ region: 'us-east-1' });
  
  // Check current concurrency setting
  try {
    const current = await lambda.send(new GetFunctionConcurrencyCommand({ FunctionName: 'signum-harvest' }));
    console.log('Current reserved concurrency:', current.ReservedConcurrentExecutions ?? 'NOT SET (unlimited)');
  } catch (e) {
    console.log('Current concurrency: NOT SET (unlimited)');
  }
  
  // Set reserved concurrency to 1 — prevents overlap
  console.log('\nSetting reserved concurrency to 1...');
  await lambda.send(new PutFunctionConcurrencyCommand({
    FunctionName: 'signum-harvest',
    ReservedConcurrentExecutions: 1,
  }));
  console.log('✅ Reserved concurrency set to 1');
  console.log('→ Only 1 instance can run at a time');
  console.log('→ If cron triggers while running, the new invocation will be throttled (skipped)');
  console.log('→ This prevents the snowball effect of multiple concurrent runs');
}

fix().catch(e => console.error('Error:', e.message));
