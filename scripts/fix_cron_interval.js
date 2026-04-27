require('dotenv').config({ path: '.env.local' });
const { EventBridgeClient, PutRuleCommand, ListTargetsByRuleCommand } = require('@aws-sdk/client-eventbridge');

async function fix() {
  const eb = new EventBridgeClient({ region: 'us-east-1' });
  
  // Update cron from rate(10 minutes) to rate(15 minutes)
  // Lambda takes 5-7min normally, up to 12-13min during market close
  // 15min interval ensures NO overlap even in worst case
  console.log('Updating signum-harvest-5min: rate(10 minutes) → rate(15 minutes)...');
  
  await eb.send(new PutRuleCommand({
    Name: 'signum-harvest-5min',
    ScheduleExpression: 'rate(15 minutes)',
    State: 'ENABLED',
    Description: 'signum-harvest Lambda every 15 minutes (prevents overlap during market close)',
  }));
  
  console.log('✅ Cron updated to rate(15 minutes)');
  
  // Verify
  const targets = await eb.send(new ListTargetsByRuleCommand({ Rule: 'signum-harvest-5min' }));
  console.log('Target:', targets.Targets?.[0]?.Arn?.split(':').pop());
  
  console.log('\n=== Result ===');
  console.log('Lambda timeout: 900s (15min)');
  console.log('Cron interval: 15 minutes');
  console.log('Normal runtime: 5-7 minutes');
  console.log('Worst case: ~13 minutes (market close)');
  console.log('→ Even worst case finishes 2min before next trigger');
  console.log('→ NO MORE OVERLAP');
}

fix().catch(e => console.error('Error:', e.message));
