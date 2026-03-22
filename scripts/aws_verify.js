/**
 * Phase A Verification — 4개 항목 실제 상태 확인
 */
require('dotenv').config({ path: '.env.local', quiet: true });
const REGION = process.env.AWS_REGION || 'us-east-1';
const credentials = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };

async function verify() {
    console.log('═══ Phase A 검증 ═══\n');

    // A-1: Backup
    const { BackupClient, ListBackupPlansCommand, GetBackupSelectionCommand } = require('@aws-sdk/client-backup');
    const backup = new BackupClient({ region: REGION, credentials });
    const plans = await backup.send(new ListBackupPlansCommand({}));
    const plan = plans.BackupPlansList?.find(p => p.BackupPlanName === 'signum-hq-daily');
    if (plan) {
        const sel = await backup.send(new GetBackupSelectionCommand({ BackupPlanId: plan.BackupPlanId, SelectionId: plan.BackupPlanId })).catch(() => null);
        console.log(`A-1 Backup: ✅ Plan "${plan.BackupPlanName}" (${plan.BackupPlanId})`);
        console.log(`    Created: ${plan.CreationDate}`);
    } else {
        console.log('A-1 Backup: ❌ Plan not found');
    }

    // A-2: CloudWatch
    const { CloudWatchClient, ListDashboardsCommand } = require('@aws-sdk/client-cloudwatch');
    const cw = new CloudWatchClient({ region: REGION, credentials });
    const dashboards = await cw.send(new ListDashboardsCommand({ DashboardNamePrefix: 'SIGNUM' }));
    const dash = dashboards.DashboardEntries?.find(d => d.DashboardName === 'SIGNUM-HQ-Ops');
    if (dash) {
        console.log(`\nA-2 CloudWatch: ✅ Dashboard "${dash.DashboardName}"`);
        console.log(`    Size: ${dash.Size} bytes | Last Modified: ${dash.LastModified}`);
    } else {
        console.log('\nA-2 CloudWatch: ❌ Dashboard not found');
    }

    // A-3: EC2
    const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
    const ec2 = new EC2Client({ region: REGION, credentials });
    const instances = await ec2.send(new DescribeInstancesCommand({ InstanceIds: ['i-0c8e51d26ddc9b3c1'] }));
    const inst = instances.Reservations?.[0]?.Instances?.[0];
    if (inst) {
        console.log(`\nA-3 EC2: ${inst.InstanceType === 't3.small' ? '✅' : '❌'} Instance ${inst.InstanceId}`);
        console.log(`    Type: ${inst.InstanceType} | State: ${inst.State?.Name} | IP: ${inst.PublicIpAddress}`);
    }

    // A-4: ElastiCache
    const { ElastiCacheClient, DescribeCacheClustersCommand } = require('@aws-sdk/client-elasticache');
    const ec = new ElastiCacheClient({ region: REGION, credentials });
    const clusters = await ec.send(new DescribeCacheClustersCommand({ CacheClusterId: 'signum-redis' }));
    const cluster = clusters.CacheClusters?.[0];
    if (cluster) {
        const upgraded = cluster.CacheNodeType === 'cache.t3.small';
        console.log(`\nA-4 ElastiCache: ${upgraded ? '✅' : '⏳'} Cluster "${cluster.CacheClusterId}"`);
        console.log(`    Type: ${cluster.CacheNodeType} | Status: ${cluster.CacheClusterStatus} | Engine: ${cluster.EngineVersion}`);
        if (cluster.PendingModifiedValues?.CacheNodeType) {
            console.log(`    Pending: → ${cluster.PendingModifiedValues.CacheNodeType}`);
        }
    }

    console.log('\n═══ 검증 완료 ═══');
}

verify().catch(e => { console.error('Error:', e.message); process.exit(1); });
