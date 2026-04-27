require('dotenv').config({ path: '.env.local' });
const { CloudWatchClient, PutMetricAlarmCommand } = require('@aws-sdk/client-cloudwatch');

async function fixAlarms() {
  const cw = new CloudWatchClient({ region: 'us-east-1' });

  // Fix slow alarm: 600,000ms (10min) → 840,000ms (14min)
  // Lambda timeout is 900s (15min), so 14min gives 1min buffer before actual timeout
  console.log('Updating signum-harvest-slow alarm: 600s → 840s (14min)...');
  await cw.send(new PutMetricAlarmCommand({
    AlarmName: 'signum-harvest-slow',
    AlarmDescription: 'signum-harvest Lambda slow alert (840s threshold, 15min timeout)',
    MetricName: 'Duration',
    Namespace: 'AWS/Lambda',
    Statistic: 'Average',
    Dimensions: [{ Name: 'FunctionName', Value: 'signum-harvest' }],
    Period: 300,
    EvaluationPeriods: 2,
    DatapointsToAlarm: 2,
    Threshold: 840000, // 840 seconds = 14 minutes
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    TreatMissingData: 'notBreaching',
    AlarmActions: ['arn:aws:sns:us-east-1:071378139897:signum-lambda-alerts'],
  }));
  console.log('✅ signum-harvest-slow updated to 840,000ms (14min)');

  // Fix throttled alarm: already correct (threshold=1), but check state
  console.log('\n✅ signum-harvest-errors alarm: kept at threshold=1 (appropriate for real errors)');
  console.log('✅ signum-harvest-throttled alarm: kept at threshold=1 (appropriate)');

  console.log('\n=== Summary ===');
  console.log('Lambda timeout: 900s (15min)');
  console.log('Slow alarm: 840s (14min) — gives 1min buffer');
  console.log('Error alarm: >=1 error (unchanged)');
  console.log('Throttle alarm: >=1 throttle (unchanged)');
}

fixAlarms().catch(e => console.error('Error:', e.message));
