/**
 * Phase A: AWS Infrastructure Hardening Script
 * A-1: AWS Backup for DynamoDB tables
 * A-2: CloudWatch Dashboard
 * 
 * Uses credentials from .env.local
 */
require('dotenv').config({ path: '.env.local', quiet: true });

const REGION = process.env.AWS_REGION || 'us-east-1';
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const DYNAMO_TABLES = [
    'signum-gex-history',
    'signum-rlsi-history',
    'signum-sector-daily',
    'signum-alpha-history',
    'signum-flow-history',
    'signum-iv-surface',
    'signum-economic-calendar',
    'signum-pattern-db',
    'signum-unified-cache',
    'signum-backtest',
];

// ═══════════════════════════════════════════════
// A-1: AWS Backup
// ═══════════════════════════════════════════════
async function setupBackup() {
    const { BackupClient, CreateBackupPlanCommand, CreateBackupSelectionCommand, ListBackupPlansCommand } = require('@aws-sdk/client-backup');
    const client = new BackupClient({ region: REGION, credentials });

    console.log('\n═══ A-1: AWS Backup ═══');

    // Check if plan already exists
    try {
        const existing = await client.send(new ListBackupPlansCommand({}));
        const existingPlan = existing.BackupPlansList?.find(p => p.BackupPlanName === 'signum-hq-daily');
        if (existingPlan) {
            console.log('✅ Backup plan "signum-hq-daily" already exists. Skipping.');
            return { success: true, action: 'already-exists' };
        }
    } catch (e) {
        // Continue - will create
    }

    // Create backup plan: Daily at 05:00 UTC, 35-day retention
    try {
        const planResult = await client.send(new CreateBackupPlanCommand({
            BackupPlan: {
                BackupPlanName: 'signum-hq-daily',
                Rules: [{
                    RuleName: 'DailyBackup',
                    TargetBackupVaultName: 'Default',
                    ScheduleExpression: 'cron(0 5 * * ? *)', // 05:00 UTC daily
                    StartWindowMinutes: 60,
                    CompletionWindowMinutes: 180,
                    Lifecycle: { DeleteAfterDays: 35 },
                }],
            },
        }));

        const planId = planResult.BackupPlanId;
        console.log(`✅ Backup plan created: ${planId}`);

        // Assign DynamoDB tables to the plan
        const tableArns = DYNAMO_TABLES.map(t => 
            `arn:aws:dynamodb:${REGION}:${process.env.AWS_ACCOUNT_ID || '*'}:table/${t}`
        );

        // We need the account ID. Let's get it from STS
        const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
        const stsClient = new STSClient({ region: REGION, credentials });
        const identity = await stsClient.send(new GetCallerIdentityCommand({}));
        const accountId = identity.Account;
        console.log(`  Account ID: ${accountId}`);

        const actualArns = DYNAMO_TABLES.map(t => 
            `arn:aws:dynamodb:${REGION}:${accountId}:table/${t}`
        );

        await client.send(new CreateBackupSelectionCommand({
            BackupPlanId: planId,
            BackupSelection: {
                SelectionName: 'dynamodb-all-tables',
                IamRoleArn: `arn:aws:iam::${accountId}:role/service-role/AWSBackupDefaultServiceRole`,
                Resources: actualArns,
            },
        }));

        console.log(`✅ ${DYNAMO_TABLES.length} DynamoDB tables assigned to backup plan`);
        return { success: true, action: 'created', planId };
    } catch (e) {
        console.error('❌ Backup setup failed:', e.message);
        // Check if it's a role issue
        if (e.message?.includes('role')) {
            console.log('  💡 Trying with default AWS Backup service role...');
        }
        return { success: false, error: e.message };
    }
}

// ═══════════════════════════════════════════════
// A-2: CloudWatch Dashboard
// ═══════════════════════════════════════════════
async function setupCloudWatch() {
    const { CloudWatchClient, PutDashboardCommand, ListDashboardsCommand } = require('@aws-sdk/client-cloudwatch');
    const client = new CloudWatchClient({ region: REGION, credentials });

    console.log('\n═══ A-2: CloudWatch Dashboard ═══');

    // Check if dashboard exists
    try {
        const existing = await client.send(new ListDashboardsCommand({ DashboardNamePrefix: 'SIGNUM-HQ' }));
        if (existing.DashboardEntries?.length > 0) {
            console.log('✅ Dashboard "SIGNUM-HQ-Ops" already exists. Skipping.');
            return { success: true, action: 'already-exists' };
        }
    } catch (e) {
        // Continue
    }

    const dashboardBody = {
        widgets: [
            {
                type: 'metric',
                x: 0, y: 0, width: 12, height: 6,
                properties: {
                    title: 'Lambda Duration (ms)',
                    metrics: [
                        ['AWS/Lambda', 'Duration', { stat: 'Average' }],
                    ],
                    view: 'timeSeries',
                    period: 300,
                    region: REGION,
                },
            },
            {
                type: 'metric',
                x: 12, y: 0, width: 12, height: 6,
                properties: {
                    title: 'Lambda Errors',
                    metrics: [
                        ['AWS/Lambda', 'Errors', { stat: 'Sum' }],
                    ],
                    view: 'timeSeries',
                    period: 300,
                    region: REGION,
                },
            },
            {
                type: 'metric',
                x: 0, y: 6, width: 12, height: 6,
                properties: {
                    title: 'ElastiCache Memory Usage %',
                    metrics: [
                        ['AWS/ElastiCache', 'DatabaseMemoryUsagePercentage', { stat: 'Average' }],
                    ],
                    view: 'timeSeries',
                    period: 300,
                    region: REGION,
                },
            },
            {
                type: 'metric',
                x: 12, y: 6, width: 12, height: 6,
                properties: {
                    title: 'EC2 CPU Utilization',
                    metrics: [
                        ['AWS/EC2', 'CPUUtilization', { stat: 'Average' }],
                    ],
                    view: 'timeSeries',
                    period: 300,
                    region: REGION,
                },
            },
        ],
    };

    try {
        await client.send(new PutDashboardCommand({
            DashboardName: 'SIGNUM-HQ-Ops',
            DashboardBody: JSON.stringify(dashboardBody),
        }));
        console.log('✅ CloudWatch Dashboard "SIGNUM-HQ-Ops" created with 4 widgets');
        return { success: true, action: 'created' };
    } catch (e) {
        console.error('❌ Dashboard creation failed:', e.message);
        return { success: false, error: e.message };
    }
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════
async function main() {
    console.log('Phase A: AWS Infrastructure Hardening');
    console.log('Region:', REGION);
    console.log('Credentials:', credentials.accessKeyId ? credentials.accessKeyId.substring(0, 8) + '...' : 'NOT SET');

    if (!credentials.accessKeyId) {
        console.error('❌ AWS credentials not found in .env.local');
        process.exit(1);
    }

    // A-1
    const backupResult = await setupBackup();
    
    // A-2
    const cwResult = await setupCloudWatch();

    console.log('\n═══ Phase A Summary ═══');
    console.log('A-1 Backup:', backupResult.success ? '✅' : '❌', backupResult.action || backupResult.error);
    console.log('A-2 CloudWatch:', cwResult.success ? '✅' : '❌', cwResult.action || cwResult.error);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
