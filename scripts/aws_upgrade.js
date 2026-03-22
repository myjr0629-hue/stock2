/**
 * Phase A-3/A-4: EC2 + ElastiCache Upgrade
 * EC2: t3.micro → t3.small
 * ElastiCache: cache.t3.micro → cache.t3.small
 */
require('dotenv').config({ path: '.env.local', quiet: true });

const REGION = process.env.AWS_REGION || 'us-east-1';
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

async function upgradeEC2() {
    const { EC2Client, DescribeInstancesCommand, StopInstancesCommand, 
            ModifyInstanceAttributeCommand, StartInstancesCommand, 
            DescribeInstanceStatusCommand } = require('@aws-sdk/client-ec2');
    const ec2 = new EC2Client({ region: REGION, credentials });

    console.log('\n═══ A-3: EC2 Upgrade ═══');

    // Find EC2 instance by IP
    const descResult = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: 'ip-address', Values: ['52.23.98.13'] }]
    }));

    const instances = descResult.Reservations?.flatMap(r => r.Instances || []) || [];
    if (instances.length === 0) {
        // Try private IP or just list all running instances
        const allResult = await ec2.send(new DescribeInstancesCommand({
            Filters: [{ Name: 'instance-state-name', Values: ['running', 'stopped'] }]
        }));
        const all = allResult.Reservations?.flatMap(r => r.Instances || []) || [];
        console.log(`  Found ${all.length} instances:`);
        all.forEach(i => console.log(`    ${i.InstanceId} | ${i.InstanceType} | ${i.PublicIpAddress || 'no-public-ip'} | ${i.State?.Name}`));
        
        if (all.length === 0) {
            console.log('❌ No EC2 instances found');
            return { success: false, error: 'No instances' };
        }
        // Use first instance
        var instance = all[0];
    } else {
        var instance = instances[0];
    }

    const instanceId = instance.InstanceId;
    const currentType = instance.InstanceType;
    console.log(`  Instance: ${instanceId} (${currentType}) - ${instance.PublicIpAddress}`);

    if (currentType === 't3.small') {
        console.log('✅ Already t3.small. Skipping.');
        return { success: true, action: 'already-upgraded' };
    }

    // Step 1: Stop instance
    console.log('  Stopping instance...');
    await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    
    // Wait for stopped state
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const status = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
        const state = status.Reservations?.[0]?.Instances?.[0]?.State?.Name;
        process.stdout.write(`  State: ${state}\r`);
        if (state === 'stopped') break;
    }
    console.log('\n  ✅ Instance stopped');

    // Step 2: Change instance type
    console.log('  Changing to t3.small...');
    await ec2.send(new ModifyInstanceAttributeCommand({
        InstanceId: instanceId,
        InstanceType: { Value: 't3.small' },
    }));
    console.log('  ✅ Instance type changed');

    // Step 3: Start instance
    console.log('  Starting instance...');
    await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));

    // Wait for running
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const status = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
        const inst = status.Reservations?.[0]?.Instances?.[0];
        const state = inst?.State?.Name;
        process.stdout.write(`  State: ${state}\r`);
        if (state === 'running') {
            console.log(`\n  ✅ Instance running — IP: ${inst.PublicIpAddress}`);
            break;
        }
    }

    return { success: true, action: 'upgraded' };
}

async function upgradeElastiCache() {
    const { ElastiCacheClient, DescribeCacheClustersCommand, 
            ModifyCacheClusterCommand, DescribeReplicationGroupsCommand,
            ModifyReplicationGroupCommand } = require('@aws-sdk/client-elasticache');
    const ec = new ElastiCacheClient({ region: REGION, credentials });

    console.log('\n═══ A-4: ElastiCache Upgrade ═══');

    // List clusters
    const clustersResult = await ec.send(new DescribeCacheClustersCommand({}));
    const clusters = clustersResult.CacheClusters || [];

    if (clusters.length === 0) {
        // Check replication groups
        try {
            const rgResult = await ec.send(new DescribeReplicationGroupsCommand({}));
            const groups = rgResult.ReplicationGroups || [];
            console.log(`  Found ${groups.length} replication groups:`);
            groups.forEach(g => console.log(`    ${g.ReplicationGroupId} | ${g.NodeGroups?.[0]?.NodeGroupMembers?.[0]?.CacheNodeId} | ${g.CacheNodeType} | ${g.Status}`));
            
            if (groups.length > 0) {
                const group = groups[0];
                if (group.CacheNodeType === 'cache.t3.small') {
                    console.log('✅ Already cache.t3.small. Skipping.');
                    return { success: true, action: 'already-upgraded' };
                }
                
                console.log(`  Upgrading ${group.ReplicationGroupId} to cache.t3.small...`);
                await ec.send(new ModifyReplicationGroupCommand({
                    ReplicationGroupId: group.ReplicationGroupId,
                    CacheNodeType: 'cache.t3.small',
                    ApplyImmediately: true,
                }));
                console.log('✅ Replication group upgrade initiated (takes ~5 min)');
                return { success: true, action: 'upgrading' };
            }
        } catch (e) {
            console.log('  No replication groups found');
        }
        console.log('❌ No ElastiCache clusters found');
        return { success: false, error: 'No clusters' };
    }

    console.log(`  Found ${clusters.length} clusters:`);
    clusters.forEach(c => console.log(`    ${c.CacheClusterId} | ${c.CacheNodeType} | ${c.CacheClusterStatus} | ${c.Engine}`));

    const cluster = clusters[0];
    if (cluster.CacheNodeType === 'cache.t3.small') {
        console.log('✅ Already cache.t3.small. Skipping.');
        return { success: true, action: 'already-upgraded' };
    }

    console.log(`  Upgrading ${cluster.CacheClusterId} to cache.t3.small...`);
    await ec.send(new ModifyCacheClusterCommand({
        CacheClusterId: cluster.CacheClusterId,
        CacheNodeType: 'cache.t3.small',
        ApplyImmediately: true,
    }));
    console.log('✅ Cluster upgrade initiated (takes ~5 min)');
    return { success: true, action: 'upgrading' };
}

async function main() {
    console.log('Phase A-3/A-4: Infrastructure Upgrades');
    
    const ec2Result = await upgradeEC2();
    const ecResult = await upgradeElastiCache();

    console.log('\n═══ Upgrade Summary ═══');
    console.log('A-3 EC2:', ec2Result.success ? '✅' : '❌', ec2Result.action || ec2Result.error);
    console.log('A-4 ElastiCache:', ecResult.success ? '✅' : '❌', ecResult.action || ecResult.error);
}

main().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
