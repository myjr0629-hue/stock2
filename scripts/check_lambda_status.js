require('dotenv').config({ path: '.env.local' });
const { LambdaClient, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchClient, DescribeAlarmsCommand } = require('@aws-sdk/client-cloudwatch');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

async function check() {
  const region = 'us-east-1';
  const lambda = new LambdaClient({ region });
  const cw = new CloudWatchClient({ region });
  const logs = new CloudWatchLogsClient({ region });

  // 1. Lambda configuration
  console.log('═══ 1. LAMBDA CONFIGURATION ═══');
  const config = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: 'signum-harvest' }));
  console.log('Timeout:', config.Timeout, 'seconds (' + (config.Timeout / 60).toFixed(1) + ' min)');
  console.log('Memory:', config.MemorySize, 'MB');
  console.log('LastModified:', config.LastModified);
  console.log('State:', config.State);
  console.log('LastUpdateStatus:', config.LastUpdateStatus);
  console.log('Runtime:', config.Runtime);
  console.log('');

  // 2. CloudWatch Alarms for signum-harvest
  console.log('═══ 2. CLOUDWATCH ALARMS ═══');
  const alarms = await cw.send(new DescribeAlarmsCommand({
    AlarmNamePrefix: 'signum-harvest'
  }));
  for (const alarm of alarms.MetricAlarms || []) {
    console.log(`\n--- ${alarm.AlarmName} ---`);
    console.log('  State:', alarm.StateValue);
    console.log('  Metric:', alarm.MetricName);
    console.log('  Threshold:', alarm.Threshold, '(' + (alarm.Threshold / 1000).toFixed(0) + 's / ' + (alarm.Threshold / 60000).toFixed(1) + 'min)');
    console.log('  ComparisonOp:', alarm.ComparisonOperator);
    console.log('  Period:', alarm.Period, 'seconds');
    console.log('  EvalPeriods:', alarm.EvaluationPeriods);
    console.log('  DatapointsToAlarm:', alarm.DatapointsToAlarm);
    console.log('  Statistic:', alarm.Statistic);
    console.log('  StateReason:', alarm.StateReason?.substring(0, 200));
    console.log('  StateUpdated:', alarm.StateUpdatedTimestamp);
  }
  console.log('');

  // 3. Recent Lambda errors from CloudWatch Logs
  console.log('═══ 3. RECENT LAMBDA ERRORS (last 30min) ═══');
  try {
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const errorLogs = await logs.send(new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/signum-harvest',
      startTime: thirtyMinAgo,
      filterPattern: 'ERROR',
      limit: 10,
    }));
    if (errorLogs.events?.length > 0) {
      for (const ev of errorLogs.events) {
        console.log(`[${new Date(ev.timestamp).toISOString()}] ${ev.message?.trim().substring(0, 300)}`);
      }
    } else {
      console.log('No ERROR logs in last 30 minutes');
    }
  } catch (e) {
    console.log('Log query error:', e.message);
  }

  // 4. Recent invocations duration
  console.log('\n═══ 4. RECENT INVOCATION DURATIONS ═══');
  try {
    const recentLogs = await logs.send(new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/signum-harvest',
      startTime: Date.now() - 60 * 60 * 1000, // last 1 hour
      filterPattern: 'REPORT RequestId',
      limit: 5,
    }));
    if (recentLogs.events?.length > 0) {
      for (const ev of recentLogs.events) {
        console.log(ev.message?.trim().substring(0, 300));
      }
    } else {
      console.log('No REPORT logs found');
    }
  } catch (e) {
    console.log('Log query error:', e.message);
  }
}

check().catch(e => console.error('Fatal:', e.message));
