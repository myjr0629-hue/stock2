/**
 * Create DynamoDB table: signum-omr-history
 * 
 * Schema:
 *   PK: ticker (String) — e.g. "NVDA"
 *   SK: timestamp (Number) — Unix ms
 * 
 * Stores OMR regime snapshots for backtesting.
 * 
 * Usage: node scripts/aws-setup-omr-table.js
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function createTable() {
    const tableName = 'signum-omr-history';
    
    // Check if table already exists
    try {
        const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
        console.log(`✅ Table '${tableName}' already exists. Status: ${desc.Table.TableStatus}`);
        console.log(`   Items: ${desc.Table.ItemCount}, Size: ${desc.Table.TableSizeBytes} bytes`);
        return;
    } catch (e) {
        if (e.name !== 'ResourceNotFoundException') {
            console.error('Error checking table:', e.message);
            return;
        }
    }

    // Create table
    console.log(`Creating table '${tableName}'...`);
    try {
        await client.send(new CreateTableCommand({
            TableName: tableName,
            KeySchema: [
                { AttributeName: 'ticker', KeyType: 'HASH' },    // Partition key
                { AttributeName: 'timestamp', KeyType: 'RANGE' }, // Sort key
            ],
            AttributeDefinitions: [
                { AttributeName: 'ticker', AttributeType: 'S' },
                { AttributeName: 'timestamp', AttributeType: 'N' },
            ],
            BillingMode: 'PAY_PER_REQUEST', // On-demand — no provisioning needed
        }));
        console.log(`✅ Table '${tableName}' created successfully (PAY_PER_REQUEST mode)`);
        console.log('   Waiting for table to become ACTIVE...');
        
        // Wait for table to become active
        let status = 'CREATING';
        let attempts = 0;
        while (status !== 'ACTIVE' && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
            status = desc.Table.TableStatus;
            attempts++;
        }
        
        if (status === 'ACTIVE') {
            console.log(`✅ Table '${tableName}' is ACTIVE and ready!`);
        } else {
            console.log(`⚠️  Table status: ${status} (may still be creating)`);
        }
    } catch (e) {
        console.error('Failed to create table:', e.message);
    }
}

createTable();
