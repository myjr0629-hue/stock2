require('dotenv').config({ path: '.env.local' });
const { EventBridgeClient, ListRulesCommand, ListTargetsByRuleCommand } = require('@aws-sdk/client-eventbridge');

async function check() {
  const eb = new EventBridgeClient({ region: 'us-east-1' });
  
  // Get ALL rules (not just signum prefix)
  let nextToken = undefined;
  const allRules = [];
  do {
    const res = await eb.send(new ListRulesCommand({ NextToken: nextToken, Limit: 100 }));
    allRules.push(...(res.Rules || []));
    nextToken = res.NextToken;
  } while (nextToken);
  
  console.log(`Total EventBridge rules: ${allRules.length}\n`);
  
  // Find all rules targeting signum-harvest Lambda
  for (const rule of allRules) {
    try {
      const targets = await eb.send(new ListTargetsByRuleCommand({ Rule: rule.Name }));
      const hasHarvest = (targets.Targets || []).some(t => t.Arn?.includes('signum-harvest'));
      if (hasHarvest || rule.Name?.includes('signum') || rule.Name?.includes('harvest')) {
        console.log(`📋 ${rule.Name}`);
        console.log(`   Schedule: ${rule.ScheduleExpression || 'N/A'}`);
        console.log(`   State: ${rule.State}`);
        for (const t of targets.Targets || []) {
          const fn = t.Arn?.split(':').pop() || t.Arn;
          console.log(`   → Target: ${fn}`);
        }
        console.log('');
      }
    } catch {}
  }
}

check().catch(e => console.error('Error:', e.message));
