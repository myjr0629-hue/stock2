/**
 * A-1 Fix: Create Backup Vault first, then create Backup Plan
 */
require('dotenv').config({ path: '.env.local', quiet: true });

const REGION = process.env.AWS_REGION || 'us-east-1';
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const DYNAMO_TABLES = [
    'signum-gex-history', 'signum-rlsi-history', 'signum-sector-daily',
    'signum-alpha-history', 'signum-flow-history', 'signum-iv-surface',
    'signum-economic-calendar', 'signum-pattern-db', 'signum-unified-cache', 'signum-backtest',
];

async function main() {
    const { BackupClient, CreateBackupVaultCommand, CreateBackupPlanCommand, 
            CreateBackupSelectionCommand, ListBackupPlansCommand } = require('@aws-sdk/client-backup');
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, GetRoleCommand } = require('@aws-sdk/client-iam');

    const backupClient = new BackupClient({ region: REGION, credentials });
    const stsClient = new STSClient({ region: REGION, credentials });

    // Get account ID
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    const accountId = identity.Account;
    console.log('Account ID:', accountId);

    // Step 1: Create Backup Vault
    try {
        await backupClient.send(new CreateBackupVaultCommand({
            BackupVaultName: 'signum-hq-vault',
        }));
        console.log('✅ Backup Vault "signum-hq-vault" created');
    } catch (e) {
        if (e.name === 'AlreadyExistsException') {
            console.log('✅ Backup Vault "signum-hq-vault" already exists');
        } else {
            console.error('❌ Vault creation failed:', e.message);
            return;
        }
    }

    // Step 2: Ensure IAM Role exists for AWS Backup
    const roleName = 'AWSBackupDefaultServiceRole';
    const iamClient = new IAMClient({ region: REGION, credentials });
    let roleArn;

    try {
        const roleResult = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
        roleArn = roleResult.Role.Arn;
        console.log('✅ IAM Role exists:', roleArn);
    } catch (e) {
        console.log('  Creating IAM role for AWS Backup...');
        try {
            const trustPolicy = {
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: { Service: 'backup.amazonaws.com' },
                    Action: 'sts:AssumeRole',
                }],
            };
            const createResult = await iamClient.send(new CreateRoleCommand({
                RoleName: roleName,
                AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
                Description: 'Default service role for AWS Backup',
            }));
            roleArn = createResult.Role.Arn;

            // Attach AWS managed policy for Backup
            await iamClient.send(new AttachRolePolicyCommand({
                RoleName: roleName,
                PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup',
            }));
            await iamClient.send(new AttachRolePolicyCommand({
                RoleName: roleName,
                PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores',
            }));
            console.log('✅ IAM Role created and policies attached');
            // Wait for role propagation
            console.log('  Waiting 10s for IAM role propagation...');
            await new Promise(r => setTimeout(r, 10000));
        } catch (err) {
            console.error('❌ IAM Role creation failed:', err.message);
            return;
        }
    }

    // Step 3: Check if plan already exists
    try {
        const existing = await backupClient.send(new ListBackupPlansCommand({}));
        const existingPlan = existing.BackupPlansList?.find(p => p.BackupPlanName === 'signum-hq-daily');
        if (existingPlan) {
            console.log('✅ Backup plan "signum-hq-daily" already exists. Done!');
            return;
        }
    } catch (e) { /* continue */ }

    // Step 4: Create Backup Plan
    try {
        const planResult = await backupClient.send(new CreateBackupPlanCommand({
            BackupPlan: {
                BackupPlanName: 'signum-hq-daily',
                Rules: [{
                    RuleName: 'DailyDynamoDB',
                    TargetBackupVaultName: 'signum-hq-vault',
                    ScheduleExpression: 'cron(0 5 * * ? *)', // 05:00 UTC daily
                    StartWindowMinutes: 60,
                    CompletionWindowMinutes: 180,
                    Lifecycle: { DeleteAfterDays: 35 },
                }],
            },
        }));

        const planId = planResult.BackupPlanId;
        console.log(`✅ Backup Plan created: ${planId}`);

        // Step 5: Assign DynamoDB tables
        const tableArns = DYNAMO_TABLES.map(t =>
            `arn:aws:dynamodb:${REGION}:${accountId}:table/${t}`
        );

        await backupClient.send(new CreateBackupSelectionCommand({
            BackupPlanId: planId,
            BackupSelection: {
                SelectionName: 'dynamodb-all-tables',
                IamRoleArn: roleArn,
                Resources: tableArns,
            },
        }));

        console.log(`✅ ${DYNAMO_TABLES.length} DynamoDB tables assigned to backup plan`);
        console.log('\n═══ A-1: AWS Backup COMPLETE ═══');
    } catch (e) {
        console.error('❌ Backup Plan creation failed:', e.message);
    }
}

main().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
