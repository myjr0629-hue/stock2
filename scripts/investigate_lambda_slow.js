require('dotenv').config({ path: '.env.local' });
const { EventBridgeClient, ListRulesCommand, ListTargetsByRuleCommand } = require('@aws-sdk/client-eventbridge');
const { CloudWatchClient, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

async function investigate() {
  const region = 'us-east-1';
  const eb = new EventBridgeClient({ region });
  const cw = new CloudWatchClient({ region });
  const logs = new CloudWatchLogsClient({ region });

  // 1. Check EventBridge cron schedule
  console.log('═══ 1. EVENTBRIDGE CRON RULES ═══');
  const rules = await eb.send(new ListRulesCommand({ NamePrefix: 'signum' }));
  for (const rule of rules.Rules || []) {
    console.log(`\n${rule.Name}:`);
    console.log('  Schedule:', rule.ScheduleExpression);
    console.log('  State:', rule.State);
    try {
      const targets = await eb.send(new ListTargetsByRuleCommand({ Rule: rule.Name }));
      for (const t of targets.Targets || []) {
        console.log('  Target:', t.Arn?.split(':').pop());
      }
    } catch {}
  }

  // Also check for any cron rules targeting signum-harvest
  const allRules = await eb.send(new ListRulesCommand({}));
  const harvestRules = (allRules.Rules || []).filter(r => r.Name?.includes('harvest') || r.Name?.includes('signum'));
  if (harvestRules.length > (rules.Rules || []).length) {
    console.log('\n--- Additional rules found ---');
    for (const r of harvestRules) {
      if (!(rules.Rules || []).find(x => x.Name === r.Name)) {
        console.log(`${r.Name}: ${r.ScheduleExpression} (${r.State})`);
      }
    }
  }

  // 2. Duration history - last 24 hours
  console.log('\n\n═══ 2. LAMBDA DURATION HISTORY (last 24h) ═══');
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stats = await cw.send(new GetMetricStatisticsCommand({
    Namespace: 'AWS/Lambda',
    MetricName: 'Duration',
    Dimensions: [{ Name: 'FunctionName', Value: 'signum-harvest' }],
    StartTime: dayAgo,
    EndTime: now,
    Period: 600, // 10 min intervals
    Statistics: ['Average', 'Maximum'],
    Unit: 'Milliseconds',
  }));
  const sorted = (stats.Datapoints || []).sort((a, b) => a.Timestamp - b.Timestamp);
  console.log('Time (UTC)              | Avg Duration    | Max Duration');
  console.log('------------------------|-----------------|----------------');
  for (const dp of sorted) {
    const t = dp.Timestamp.toISOString().slice(0, 19);
    const avg = (dp.Average / 1000).toFixed(0) + 's (' + (dp.Average / 60000).toFixed(1) + 'min)';
    const max = (dp.Maximum / 1000).toFixed(0) + 's (' + (dp.Maximum / 60000).toFixed(1) + 'min)';
    console.log(`${t} | ${avg.padEnd(15)} | ${max}`);
  }

  // 3. Invocation count history
  console.log('\n\n═══ 3. INVOCATION COUNT (last 24h, 1h intervals) ═══');
  const invocations = await cw.send(new GetMetricStatisticsCommand({
    Namespace: 'AWS/Lambda',
    MetricName: 'Invocations',
    Dimensions: [{ Name: 'FunctionName', Value: 'signum-harvest' }],
    StartTime: dayAgo,
    EndTime: now,
    Period: 3600, // 1 hour
    Statistics: ['Sum'],
  }));
  const invSorted = (invocations.Datapoints || []).sort((a, b) => a.Timestamp - b.Timestamp);
  for (const dp of invSorted) {
    const t = dp.Timestamp.toISOString().slice(0, 16);
    console.log(`${t} | ${dp.Sum} invocations`);
  }

  // 4. Check recent REPORT logs for step-by-step timing
  console.log('\n\n═══ 4. RECENT STEP TIMING (from logs) ═══');
  try {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const stepLogs = await logs.send(new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/signum-harvest',
      startTime: twoHoursAgo,
      filterPattern: '"Step" OR "DarkPool pre-fetch" OR "Redis:" OR "Unified Cache:" OR "SIGNUM Harvest" OR "REPORT RequestId"',
      limit: 50,
    }));
    if (stepLogs.events?.length > 0) {
      let lastReqId = '';
      for (const ev of stepLogs.events) {
        const msg = ev.message?.trim().replace(/\n/g, ' ').substring(0, 200);
        // Extract request ID to group by invocation
        const reqMatch = msg.match(/([a-f0-9-]{36})/);
        const reqId = reqMatch ? reqMatch[1].substring(0, 8) : '';
        if (reqId !== lastReqId) {
          lastReqId = reqId;
        }
        const ts = new Date(ev.timestamp).toISOString().slice(11, 19);
        console.log(`[${ts}] ${msg}`);
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // 5. Concurrent executions check
  console.log('\n\n═══ 5. CONCURRENT EXECUTIONS (last 6h) ═══');
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const concurrent = await cw.send(new GetMetricStatisticsCommand({
    Namespace: 'AWS/Lambda',
    MetricName: 'ConcurrentExecutions',
    Dimensions: [{ Name: 'FunctionName', Value: 'signum-harvest' }],
    StartTime: sixHoursAgo,
    EndTime: now,
    Period: 300,
    Statistics: ['Maximum'],
  }));
  const concSorted = (concurrent.Datapoints || []).sort((a, b) => a.Timestamp - b.Timestamp);
  for (const dp of concSorted) {
    const t = dp.Timestamp.toISOString().slice(11, 19);
    const flag = dp.Maximum > 1 ? ' ⚠️ OVERLAP!' : '';
    console.log(`${t} | Max concurrent: ${dp.Maximum}${flag}`);
  }

  // 6. Throttle history
  console.log('\n\n═══ 6. THROTTLE HISTORY (last 6h) ═══');
  const throttles = await cw.send(new GetMetricStatisticsCommand({
    Namespace: 'AWS/Lambda',
    MetricName: 'Throttles',
    Dimensions: [{ Name: 'FunctionName', Value: 'signum-harvest' }],
    StartTime: sixHoursAgo,
    EndTime: now,
    Period: 300,
    Statistics: ['Sum'],
  }));
  const thrSorted = (throttles.Datapoints || []).sort((a, b) => a.Timestamp - b.Timestamp);
  const hasThrottles = thrSorted.filter(d => d.Sum > 0);
  if (hasThrottles.length > 0) {
    for (const dp of hasThrottles) {
      console.log(`${dp.Timestamp.toISOString().slice(11, 19)} | ${dp.Sum} throttles`);
    }
  } else {
    console.log('No throttles in last 6 hours');
  }
}

investigate().catch(e => console.error('Fatal:', e.message));
