/**
 * SIGNUM HQ — AWS Phase 0 Verification
 * Checks all infrastructure status and retrieves endpoints
 */

const { ElastiCacheClient, DescribeCacheClustersCommand } = require('@aws-sdk/client-elasticache');
const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');

const config = {
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
};

async function verify() {
    console.log('\n=== SIGNUM HQ — Phase 0 Verification ===\n');

    // 1. VPC
    const ec2 = new EC2Client(config);
    const vpcs = await ec2.send(new DescribeVpcsCommand({
        Filters: [{ Name: 'tag:Project', Values: ['signum'] }]
    }));
    console.log(`[VPC] ${vpcs.Vpcs?.[0]?.VpcId || 'NOT FOUND'} — State: ${vpcs.Vpcs?.[0]?.State || 'N/A'}`);

    // Subnets
    if (vpcs.Vpcs?.[0]) {
        const subnets = await ec2.send(new DescribeSubnetsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcs.Vpcs[0].VpcId] }]
        }));
        subnets.Subnets.forEach(s => console.log(`  [Subnet] ${s.SubnetId} — ${s.AvailabilityZone} — ${s.CidrBlock}`));
    }

    // Security Groups
    if (vpcs.Vpcs?.[0]) {
        const sgs = await ec2.send(new DescribeSecurityGroupsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcs.Vpcs[0].VpcId] }]
        }));
        sgs.SecurityGroups.forEach(sg => console.log(`  [SG] ${sg.GroupId} — ${sg.GroupName}`));
    }

    // 2. ElastiCache
    const elasticache = new ElastiCacheClient(config);
    try {
        const cache = await elasticache.send(new DescribeCacheClustersCommand({
            CacheClusterId: 'signum-redis',
            ShowCacheNodeInfo: true
        }));
        const cluster = cache.CacheClusters?.[0];
        console.log(`\n[ElastiCache] Status: ${cluster?.CacheClusterStatus}`);
        console.log(`  Node Type: ${cluster?.CacheNodeType}`);
        console.log(`  Engine: ${cluster?.Engine} ${cluster?.EngineVersion}`);
        if (cluster?.CacheNodes?.[0]?.Endpoint) {
            console.log(`  >>> ENDPOINT: ${cluster.CacheNodes[0].Endpoint.Address}:${cluster.CacheNodes[0].Endpoint.Port}`);
        } else {
            console.log('  >>> Endpoint not yet available (still creating...)');
        }
    } catch (e) {
        console.log(`\n[ElastiCache] Error: ${e.message}`);
    }

    // 3. DynamoDB
    const dynamo = new DynamoDBClient(config);
    const tables = await dynamo.send(new ListTablesCommand({}));
    const signumTables = (tables.TableNames || []).filter(t => t.startsWith('signum-'));
    console.log(`\n[DynamoDB] ${signumTables.length} tables found:`);
    for (const tableName of signumTables) {
        const desc = await dynamo.send(new DescribeTableCommand({ TableName: tableName }));
        const table = desc.Table;
        console.log(`  ${tableName} — Status: ${table.TableStatus} — Items: ${table.ItemCount}`);
    }

    // 4. S3
    const s3 = new S3Client(config);
    const buckets = await s3.send(new ListBucketsCommand({}));
    const signumBuckets = (buckets.Buckets || []).filter(b => b.Name.startsWith('signum'));
    console.log(`\n[S3] ${signumBuckets.length} buckets:`);
    signumBuckets.forEach(b => console.log(`  ${b.Name} — Created: ${b.CreationDate.toISOString()}`));

    // Summary
    console.log('\n=== ENV VALUES FOR .env.local ===\n');
    console.log('AWS_REGION=us-east-1');
    console.log('AWS_ACCESS_KEY_ID=<your-key>');
    console.log('AWS_SECRET_ACCESS_KEY=<your-secret>');
    console.log(`AWS_VPC_ID=${vpcs.Vpcs?.[0]?.VpcId || 'PENDING'}`);

    const cache2 = await elasticache.send(new DescribeCacheClustersCommand({ CacheClusterId: 'signum-redis', ShowCacheNodeInfo: true })).catch(() => null);
    const endpoint = cache2?.CacheClusters?.[0]?.CacheNodes?.[0]?.Endpoint;
    if (endpoint) {
        console.log(`AWS_ELASTICACHE_ENDPOINT=${endpoint.Address}:${endpoint.Port}`);
    } else {
        console.log('AWS_ELASTICACHE_ENDPOINT=PENDING (run again in 5 minutes)');
    }

    console.log('');
}

verify().catch(console.error);
