// CloudWatch Alarms + SNS Email 설정 스크립트
// Lambda signum-harvest 실패/타임아웃 시 이메일 알림
const { CloudWatchClient, PutMetricAlarmCommand, DescribeAlarmsCommand } = require('@aws-sdk/client-cloudwatch');
const { SNSClient, CreateTopicCommand, SubscribeCommand, ListTopicsCommand } = require('@aws-sdk/client-sns');
require('dotenv').config({ path: '.env.local' });

const REGION = 'us-east-1';
const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const cw = new CloudWatchClient({ region: REGION, credentials: creds });
const sns = new SNSClient({ region: REGION, credentials: creds });

const LAMBDA_NAME = 'signum-harvest';
const EMAIL = 'contact@signumhq.com'; // 알림 받을 이메일

async function main() {
    console.log('=== CloudWatch Alarms Setup ===\n');

    // 1. SNS Topic 생성 (또는 기존 것 사용)
    console.log('[1] Creating SNS Topic...');
    const topicRes = await sns.send(new CreateTopicCommand({ Name: 'signum-lambda-alerts' }));
    const topicArn = topicRes.TopicArn;
    console.log('  Topic ARN:', topicArn);

    // 2. 이메일 구독 추가
    console.log('[2] Subscribing email:', EMAIL);
    await sns.send(new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: 'email',
        Endpoint: EMAIL,
    }));
    console.log('  ⚠️  이메일 확인 링크가 발송되었습니다. 이메일에서 "Confirm subscription"을 클릭해야 알림이 작동합니다.\n');

    // 3. Alarm 1: Lambda 에러 (Errors > 0, 5분 연속)
    console.log('[3] Creating Alarm: Lambda Errors...');
    await cw.send(new PutMetricAlarmCommand({
        AlarmName: 'signum-harvest-errors',
        AlarmDescription: 'signum-harvest Lambda에서 에러 발생 시 알림',
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Dimensions: [{ Name: 'FunctionName', Value: LAMBDA_NAME }],
        Period: 300, // 5분
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [topicArn],
        OKActions: [topicArn],
    }));
    console.log('  ✅ signum-harvest-errors alarm created');

    // 4. Alarm 2: Lambda Duration 임계값 (15초 이상 = 느린 실행)
    console.log('[4] Creating Alarm: Lambda Duration > 15s...');
    await cw.send(new PutMetricAlarmCommand({
        AlarmName: 'signum-harvest-slow',
        AlarmDescription: 'signum-harvest Lambda 실행이 15초 이상 걸릴 때 알림',
        MetricName: 'Duration',
        Namespace: 'AWS/Lambda',
        Statistic: 'Average',
        Dimensions: [{ Name: 'FunctionName', Value: LAMBDA_NAME }],
        Period: 300,
        EvaluationPeriods: 2, // 10분 연속
        Threshold: 15000, // 15초 (밀리초)
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [topicArn],
    }));
    console.log('  ✅ signum-harvest-slow alarm created');

    // 5. Alarm 3: Lambda Throttles (쓰로틀 발생)
    console.log('[5] Creating Alarm: Lambda Throttles...');
    await cw.send(new PutMetricAlarmCommand({
        AlarmName: 'signum-harvest-throttled',
        AlarmDescription: 'signum-harvest Lambda가 쓰로틀 되었을 때 알림',
        MetricName: 'Throttles',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Dimensions: [{ Name: 'FunctionName', Value: LAMBDA_NAME }],
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [topicArn],
    }));
    console.log('  ✅ signum-harvest-throttled alarm created');

    // 6. 확인
    console.log('\n[6] Verifying alarms...');
    const alarms = await cw.send(new DescribeAlarmsCommand({
        AlarmNamePrefix: 'signum-harvest',
    }));
    for (const a of alarms.MetricAlarms || []) {
        console.log('  ' + a.AlarmName + ' → ' + a.StateValue + ' (threshold: ' + a.Threshold + ')');
    }

    console.log('\n=== DONE ===');
    console.log('3 alarms created + 1 SNS topic + email subscription');
    console.log('⚠️  이메일 확인(Confirm subscription)을 반드시 해주세요!');
}

main().catch(e => console.error('FATAL:', e));
