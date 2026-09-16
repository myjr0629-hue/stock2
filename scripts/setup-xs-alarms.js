#!/usr/bin/env node
// ============================================================================
// setup-xs-alarms — CloudWatch alarms for the XS engine (idempotent upserts).
//
// Why: from 2026-09-01 to 09-15 `signum-xs` failed every day (`universe too
// small: 0`), `cache:xs:scores` expired, the app silently fell back to the V8
// score, the paper track produced 0 orders — and nobody was told
// (.agent/ALPHA_SCORE_FULL_REPORT_2026-09-16.md §5-2, §8 P0).
//
// Alarms (all → the existing ops SNS topic `signum-lambda-alerts`, e-mail
// contact@signumhq.com, confirmed — the same path the signum-harvest alarms use;
// Telegram is a disabled marketing channel and there is no Slack):
//   1. signum-xs-errors          AWS/Lambda Errors ≥ 1 in an hour (any failed run that day)
//   2. signum-xs-universe-low    log-metric SIGNUM/XS SourceUniverse < 40
//                                 (from "[XS] source snapshots: N tickers")
//   3. signum-xs-scores-missing  log-metric SIGNUM/XS XsScoresPresent < 1
//                                 (the paper Lambda checks Redis `cache:xs:scores`
//                                  every day at 22:40 UTC, independently of XS)
//   4. signum-xs-scores-stale    log-metric SIGNUM/XS XsScoresAgeDays ≥ 4
//                                 (key exists but is not being refreshed — Monday
//                                  after a healthy Friday reads 3, so ≥4)
//   5. signum-xs-paper-errors    AWS/Lambda Errors ≥ 1 for signum-xs-paper
// Missing data is `notBreaching` (weekends produce no datapoints on purpose);
// only ALARM transitions notify (no OK-noise).
//
// Metric filters need no change to the Lambdas' IAM role — they are attached to
// the log groups with these credentials. Patterns are tested against a real
// sample line (TestMetricFilter) before being installed.
//
// Run: node scripts/setup-xs-alarms.js          (node SDK; no aws CLI on this Mac)
// ============================================================================
const fs = require('fs');
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { CloudWatchClient, PutMetricAlarmCommand, DescribeAlarmsCommand } = require('@aws-sdk/client-cloudwatch');
const { CloudWatchLogsClient, PutMetricFilterCommand, TestMetricFilterCommand, DescribeMetricFiltersCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { SNSClient, ListTopicsCommand } = require('@aws-sdk/client-sns');

const REGION = 'us-east-1';
const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const cw = new CloudWatchClient({ region: REGION, credentials: creds });
const logs = new CloudWatchLogsClient({ region: REGION, credentials: creds });
const sns = new SNSClient({ region: REGION, credentials: creds });

const TOPIC_NAME = 'signum-lambda-alerts';
const NS = 'SIGNUM/XS';

// Lambda log lines look like: "2026-09-15T22:10:10.393Z\t<requestId>\tINFO\t[XS] source snapshots: 0 tickers (3s)"
// Space-delimited filter: fields are ts, requestId, level, then the message tokens.
// ⚠ brackets are token delimiters to the filter engine, so "[XS]" is matched as tag="XS".
const FILTERS = [
  {
    logGroup: '/aws/lambda/signum-xs', name: 'xs-source-universe', metric: 'SourceUniverse',
    pattern: '[ts, rid, level, tag="XS", w1="source", w2="snapshots:", n, ...]',
    sample: '2026-09-15T22:10:10.393Z\tce2a2b5f-dbc2-466d-80b6-6a621578ef53\tINFO\t[XS] source snapshots: 1743 tickers (12s)',
    expect: '1743',
  },
  {
    logGroup: '/aws/lambda/signum-xs-paper', name: 'xs-scores-present', metric: 'XsScoresPresent',
    pattern: '[ts, rid, level, tag="PAPER", w1="xs-scores-present", n, ...]',
    sample: '2026-09-15T22:40:33.079Z\t3a49ebd3-b307-4330-8d95-7a08fc64f365\tINFO\t[PAPER] xs-scores-present 1 date=2026-09-15',
    expect: '1',
  },
  {
    logGroup: '/aws/lambda/signum-xs-paper', name: 'xs-scores-age-days', metric: 'XsScoresAgeDays',
    pattern: '[ts, rid, level, tag="PAPER", w1="xs-scores-age-days", n, ...]',
    sample: '2026-09-15T22:40:33.079Z\t3a49ebd3-b307-4330-8d95-7a08fc64f365\tINFO\t[PAPER] xs-scores-age-days 0 date=2026-09-15',
    expect: '0',
  },
];

const ALARMS = (topicArn) => [
  {
    AlarmName: 'signum-xs-errors', AlarmDescription: 'signum-xs (XS score engine) failed — check /aws/lambda/signum-xs; app falls back to V8 after 7 days without scores',
    Namespace: 'AWS/Lambda', MetricName: 'Errors', Dimensions: [{ Name: 'FunctionName', Value: 'signum-xs' }],
    Statistic: 'Sum', Period: 3600, EvaluationPeriods: 1, Threshold: 1, ComparisonOperator: 'GreaterThanOrEqualToThreshold',
  },
  {
    AlarmName: 'signum-xs-universe-low', AlarmDescription: 'signum-xs source universe < 40 tickers — the live source (structure:part:v2:* / FINRA / Intrinio) is empty or stale',
    Namespace: NS, MetricName: 'SourceUniverse',
    Statistic: 'Minimum', Period: 3600, EvaluationPeriods: 1, Threshold: 40, ComparisonOperator: 'LessThanThreshold',
  },
  {
    AlarmName: 'signum-xs-scores-missing', AlarmDescription: 'Redis cache:xs:scores is absent (checked daily 22:40 UTC by signum-xs-paper) — app is showing the V8 score instead of XS',
    Namespace: NS, MetricName: 'XsScoresPresent',
    Statistic: 'Minimum', Period: 3600, EvaluationPeriods: 1, Threshold: 1, ComparisonOperator: 'LessThanThreshold',
  },
  {
    AlarmName: 'signum-xs-scores-stale', AlarmDescription: 'cache:xs:scores exists but is ≥4 days old — signum-xs is not refreshing it',
    Namespace: NS, MetricName: 'XsScoresAgeDays',
    Statistic: 'Maximum', Period: 3600, EvaluationPeriods: 1, Threshold: 4, ComparisonOperator: 'GreaterThanOrEqualToThreshold',
  },
  {
    AlarmName: 'signum-xs-paper-errors', AlarmDescription: 'signum-xs-paper (paper-trade journal) failed — check /aws/lambda/signum-xs-paper',
    Namespace: 'AWS/Lambda', MetricName: 'Errors', Dimensions: [{ Name: 'FunctionName', Value: 'signum-xs-paper' }],
    Statistic: 'Sum', Period: 3600, EvaluationPeriods: 1, Threshold: 1, ComparisonOperator: 'GreaterThanOrEqualToThreshold',
  },
].map((a) => ({ ...a, TreatMissingData: 'notBreaching', ActionsEnabled: true, AlarmActions: [topicArn] }));

(async () => {
  const topics = await sns.send(new ListTopicsCommand({}));
  const topic = (topics.Topics || []).find((t) => t.TopicArn.endsWith(':' + TOPIC_NAME));
  if (!topic) throw new Error(`SNS topic ${TOPIC_NAME} not found — run scripts/setup_cloudwatch.js first`);
  console.log('SNS topic:', topic.TopicArn);

  for (const f of FILTERS) {
    const test = await logs.send(new TestMetricFilterCommand({ filterPattern: f.pattern, logEventMessages: [f.sample] }));
    const got = test.matches?.[0]?.extractedValues?.['$n'];
    if (got !== f.expect) throw new Error(`metric filter ${f.name}: pattern did not extract ${f.expect} from the sample (got ${JSON.stringify(test.matches)})`);
    await logs.send(new PutMetricFilterCommand({
      logGroupName: f.logGroup, filterName: f.name, filterPattern: f.pattern,
      metricTransformations: [{ metricName: f.metric, metricNamespace: NS, metricValue: '$n', unit: 'Count' }],
    }));
    console.log(`✅ metric filter ${f.name} → ${NS}/${f.metric} (${f.logGroup}) — sample extracts ${got}`);
  }

  for (const a of ALARMS(topic.TopicArn)) {
    await cw.send(new PutMetricAlarmCommand(a));
    console.log(`✅ alarm ${a.AlarmName}: ${a.Namespace}/${a.MetricName} ${a.ComparisonOperator} ${a.Threshold}`);
  }

  const d = await cw.send(new DescribeAlarmsCommand({ AlarmNamePrefix: 'signum-xs' }));
  console.log('\n현재 상태:');
  for (const al of d.MetricAlarms || []) console.log(`  ${al.AlarmName} → ${al.StateValue}`);
  for (const lg of [...new Set(FILTERS.map((f) => f.logGroup))]) {
    const mf = await logs.send(new DescribeMetricFiltersCommand({ logGroupName: lg }));
    console.log(`metric filters on ${lg}: ${(mf.metricFilters || []).map((x) => `${x.filterName}→${x.metricTransformations?.[0]?.metricName}`).join(', ')}`);
  }
})().catch((e) => { console.error('설정 실패:', e.message); process.exit(1); });
