/**
 * SIGNUM HQ — AWS Phase 0 Infrastructure Setup
 * Creates: VPC, Security Groups, ElastiCache Redis, DynamoDB Tables, S3 Bucket
 * 
 * Usage: node scripts/aws-setup-phase0.js
 */

const { EC2Client, CreateVpcCommand, CreateSubnetCommand, CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand, DescribeVpcsCommand, DescribeSubnetsCommand,
    CreateInternetGatewayCommand, AttachInternetGatewayCommand,
    CreateRouteTableCommand, CreateRouteCommand, AssociateRouteTableCommand,
    ModifyVpcAttributeCommand, DescribeAvailabilityZonesCommand } = require('@aws-sdk/client-ec2');
const { ElastiCacheClient, CreateCacheClusterCommand, CreateCacheSubnetGroupCommand,
    DescribeCacheClustersCommand } = require('@aws-sdk/client-elasticache');
const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, CreateBucketCommand, PutBucketLifecycleConfigurationCommand } = require('@aws-sdk/client-s3');

const REGION = 'us-east-1';
const PROJECT = 'signum';

const config = {
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
};

if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
    console.error('ERROR: Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables');
    process.exit(1);
}

const ec2 = new EC2Client(config);
const elasticache = new ElastiCacheClient(config);
const dynamodb = new DynamoDBClient(config);
const s3 = new S3Client(config);

// ============ Helpers ============
function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============ Step 1: VPC + Subnets + Security Group ============
async function setupNetworking() {
    log('🌐', 'Step 1: VPC + Networking Setup...');

    // Check if VPC already exists
    const existingVpcs = await ec2.send(new DescribeVpcsCommand({
        Filters: [{ Name: 'tag:Project', Values: [PROJECT] }]
    }));

    if (existingVpcs.Vpcs && existingVpcs.Vpcs.length > 0) {
        const vpcId = existingVpcs.Vpcs[0].VpcId;
        log('✅', `VPC already exists: ${vpcId}`);

        // Get subnets
        const subnets = await ec2.send(new DescribeSubnetsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
        }));
        const subnetIds = subnets.Subnets.map(s => s.SubnetId);

        return { vpcId, subnetIds };
    }

    // Create VPC
    const vpc = await ec2.send(new CreateVpcCommand({
        CidrBlock: '10.0.0.0/16',
        TagSpecifications: [{
            ResourceType: 'vpc',
            Tags: [{ Key: 'Name', Value: `${PROJECT}-vpc` }, { Key: 'Project', Value: PROJECT }]
        }]
    }));
    const vpcId = vpc.Vpc.VpcId;
    log('✅', `VPC created: ${vpcId}`);

    // Enable DNS
    await ec2.send(new ModifyVpcAttributeCommand({ VpcId: vpcId, EnableDnsSupport: { Value: true } }));
    await ec2.send(new ModifyVpcAttributeCommand({ VpcId: vpcId, EnableDnsHostnames: { Value: true } }));

    // Get AZs
    const azs = await ec2.send(new DescribeAvailabilityZonesCommand({ Filters: [{ Name: 'region-name', Values: [REGION] }] }));
    const azNames = azs.AvailabilityZones.slice(0, 2).map(az => az.ZoneName);

    // Create 2 subnets (ElastiCache needs 2 AZs for subnet group)
    const subnetIds = [];
    for (let i = 0; i < 2; i++) {
        const subnet = await ec2.send(new CreateSubnetCommand({
            VpcId: vpcId,
            CidrBlock: `10.0.${i + 1}.0/24`,
            AvailabilityZone: azNames[i],
            TagSpecifications: [{
                ResourceType: 'subnet',
                Tags: [{ Key: 'Name', Value: `${PROJECT}-subnet-${i + 1}` }, { Key: 'Project', Value: PROJECT }]
            }]
        }));
        subnetIds.push(subnet.Subnet.SubnetId);
        log('✅', `Subnet ${i + 1} created: ${subnet.Subnet.SubnetId} (${azNames[i]})`);
    }

    // Internet Gateway
    const igw = await ec2.send(new CreateInternetGatewayCommand({
        TagSpecifications: [{
            ResourceType: 'internet-gateway',
            Tags: [{ Key: 'Name', Value: `${PROJECT}-igw` }, { Key: 'Project', Value: PROJECT }]
        }]
    }));
    await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igw.InternetGateway.InternetGatewayId, VpcId: vpcId }));
    log('✅', `Internet Gateway attached: ${igw.InternetGateway.InternetGatewayId}`);

    // Route Table
    const rt = await ec2.send(new CreateRouteTableCommand({
        VpcId: vpcId,
        TagSpecifications: [{
            ResourceType: 'route-table',
            Tags: [{ Key: 'Name', Value: `${PROJECT}-rt` }, { Key: 'Project', Value: PROJECT }]
        }]
    }));
    await ec2.send(new CreateRouteCommand({
        RouteTableId: rt.RouteTable.RouteTableId,
        DestinationCidrBlock: '0.0.0.0/0',
        GatewayId: igw.InternetGateway.InternetGatewayId
    }));
    for (const subnetId of subnetIds) {
        await ec2.send(new AssociateRouteTableCommand({ RouteTableId: rt.RouteTable.RouteTableId, SubnetId: subnetId }));
    }
    log('✅', 'Route table configured with internet access');

    return { vpcId, subnetIds };
}

// ============ Step 2: Security Group ============
async function setupSecurityGroup(vpcId) {
    log('🔒', 'Step 2: Security Group Setup...');

    try {
        const sg = await ec2.send(new CreateSecurityGroupCommand({
            GroupName: `${PROJECT}-sg`,
            Description: 'SIGNUM HQ - ElastiCache + EC2 access',
            VpcId: vpcId,
            TagSpecifications: [{
                ResourceType: 'security-group',
                Tags: [{ Key: 'Name', Value: `${PROJECT}-sg` }, { Key: 'Project', Value: PROJECT }]
            }]
        }));
        const sgId = sg.GroupId;

        // Allow Redis (6379) from within VPC
        await ec2.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgId,
            IpPermissions: [
                { IpProtocol: 'tcp', FromPort: 6379, ToPort: 6379, IpRanges: [{ CidrIp: '10.0.0.0/16' }] },
                { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }, // SSH
                { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }, // HTTPS
            ]
        }));
        log('✅', `Security Group created: ${sgId}`);
        return sgId;
    } catch (e) {
        if (e.Code === 'InvalidGroup.Duplicate') {
            log('✅', 'Security Group already exists');
            // Retrieve existing
            const vpcs = await ec2.send(new DescribeVpcsCommand({ VpcIds: [vpcId] }));
            return null; // We'll need to look it up
        }
        throw e;
    }
}

// ============ Step 3: ElastiCache Redis ============
async function setupElastiCache(subnetIds, sgId) {
    log('🔴', 'Step 3: ElastiCache Redis Setup...');

    // Check if already exists
    try {
        const existing = await elasticache.send(new DescribeCacheClustersCommand({ CacheClusterId: `${PROJECT}-redis` }));
        if (existing.CacheClusters && existing.CacheClusters.length > 0) {
            const endpoint = existing.CacheClusters[0].CacheNodes?.[0]?.Endpoint;
            log('✅', `ElastiCache already exists: ${endpoint?.Address || 'creating...'}`);
            return;
        }
    } catch (e) {
        // Doesn't exist, create it
    }

    // Create subnet group
    try {
        await elasticache.send(new CreateCacheSubnetGroupCommand({
            CacheSubnetGroupName: `${PROJECT}-cache-subnet`,
            CacheSubnetGroupDescription: 'SIGNUM HQ Cache Subnets',
            SubnetIds: subnetIds
        }));
        log('✅', 'Cache subnet group created');
    } catch (e) {
        if (e.name !== 'CacheSubnetGroupAlreadyExistsFault') throw e;
        log('✅', 'Cache subnet group already exists');
    }

    // Create Redis cluster
    const params = {
        CacheClusterId: `${PROJECT}-redis`,
        CacheNodeType: 'cache.t3.micro',
        Engine: 'redis',
        NumCacheNodes: 1,
        CacheSubnetGroupName: `${PROJECT}-cache-subnet`,
        ...(sgId && { SecurityGroupIds: [sgId] }),
        Tags: [{ Key: 'Project', Value: PROJECT }]
    };

    try {
        await elasticache.send(new CreateCacheClusterCommand(params));
        log('✅', 'ElastiCache Redis cluster creating... (takes ~5 min)');
    } catch (e) {
        if (e.name === 'CacheClusterAlreadyExistsFault') {
            log('✅', 'ElastiCache cluster already exists');
        } else {
            throw e;
        }
    }
}

// ============ Step 4: DynamoDB Tables ============
async function setupDynamoDB() {
    log('📊', 'Step 4: DynamoDB Tables Setup...');

    const existing = await dynamodb.send(new ListTablesCommand({}));
    const existingTables = existing.TableNames || [];

    const tables = [
        {
            TableName: `${PROJECT}-gex-history`,
            KeySchema: [{ AttributeName: 'ticker', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'ticker', AttributeType: 'S' }, { AttributeName: 'timestamp', AttributeType: 'N' }],
        },
        {
            TableName: `${PROJECT}-rlsi-history`,
            KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'timestamp', AttributeType: 'N' }],
        },
        {
            TableName: `${PROJECT}-sector-daily`,
            KeySchema: [{ AttributeName: 'sectorId', KeyType: 'HASH' }, { AttributeName: 'date', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'sectorId', AttributeType: 'S' }, { AttributeName: 'date', AttributeType: 'S' }],
        },
        {
            TableName: `${PROJECT}-alpha-history`,
            KeySchema: [{ AttributeName: 'ticker', KeyType: 'HASH' }, { AttributeName: 'date', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'ticker', AttributeType: 'S' }, { AttributeName: 'date', AttributeType: 'S' }],
        },
        {
            TableName: `${PROJECT}-flow-history`,
            KeySchema: [{ AttributeName: 'ticker', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'ticker', AttributeType: 'S' }, { AttributeName: 'timestamp', AttributeType: 'N' }],
        },
        {
            TableName: `${PROJECT}-iv-surface`,
            KeySchema: [{ AttributeName: 'ticker', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'ticker', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
        },
        {
            TableName: `${PROJECT}-economic-calendar`,
            KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
        },
        {
            TableName: `${PROJECT}-pattern-db`,
            KeySchema: [{ AttributeName: 'pattern', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'pattern', AttributeType: 'S' }, { AttributeName: 'timestamp', AttributeType: 'N' }],
        },
    ];

    for (const table of tables) {
        if (existingTables.includes(table.TableName)) {
            log('✅', `Table ${table.TableName} already exists`);
            continue;
        }

        try {
            await dynamodb.send(new CreateTableCommand({
                ...table,
                BillingMode: 'PAY_PER_REQUEST', // On-demand pricing
                Tags: [{ Key: 'Project', Value: PROJECT }],
            }));
            log('✅', `Table ${table.TableName} created`);
        } catch (e) {
            if (e.name === 'ResourceInUseException') {
                log('✅', `Table ${table.TableName} already exists`);
            } else {
                log('❌', `Table ${table.TableName} failed: ${e.message}`);
            }
        }
    }
}

// ============ Step 5: S3 Bucket ============
async function setupS3() {
    log('📦', 'Step 5: S3 Bucket Setup...');

    const bucketName = `${PROJECT}-hq-archive`;

    try {
        await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
        log('✅', `S3 bucket created: ${bucketName}`);

        // Lifecycle rule — auto-delete after 180 days
        await s3.send(new PutBucketLifecycleConfigurationCommand({
            Bucket: bucketName,
            LifecycleConfiguration: {
                Rules: [{
                    ID: 'auto-cleanup',
                    Status: 'Enabled',
                    Filter: { Prefix: '' },
                    Expiration: { Days: 180 }
                }]
            }
        }));
        log('✅', 'S3 lifecycle (180day auto-cleanup) configured');
    } catch (e) {
        if (e.name === 'BucketAlreadyOwnedByYou' || e.name === 'BucketAlreadyExists') {
            log('✅', `S3 bucket already exists: ${bucketName}`);
        } else {
            log('❌', `S3 failed: ${e.message}`);
        }
    }
}

// ============ Main ============
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  SIGNUM HQ — AWS Phase 0 Infrastructure     ║');
    console.log('║  Region: us-east-1 | Project: signum        ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');

    try {
        // Step 1: Networking
        const { vpcId, subnetIds } = await setupNetworking();

        // Step 2: Security Group
        const sgId = await setupSecurityGroup(vpcId);

        // Step 3: ElastiCache
        await setupElastiCache(subnetIds, sgId);

        // Step 4: DynamoDB
        await setupDynamoDB();

        // Step 5: S3
        await setupS3();

        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  ✅ Phase 0 Infrastructure Complete!         ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  VPC:          ${vpcId}              ║`);
        console.log(`║  Subnets:      ${subnetIds.length} created                   ║`);
        console.log('║  ElastiCache:  signum-redis (creating...)   ║');
        console.log('║  DynamoDB:     8 tables created             ║');
        console.log('║  S3:           signum-hq-archive            ║');
        console.log('╚══════════════════════════════════════════════╝');
        console.log('');
        console.log('Next: Run aws-setup-phase0-verify.js to get ElastiCache endpoint');

    } catch (error) {
        console.error('');
        console.error('❌ ERROR:', error.message);
        console.error(error);
    }
}

main();
