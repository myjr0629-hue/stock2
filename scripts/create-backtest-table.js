/**
 * Create signum-backtest DynamoDB table
 * 
 * Table Design:
 *   PK: ticker (String)  — sort key for per-stock queries
 *   SK: recordedAt (String) — ISO timestamp for chronological ordering
 * 
 * Usage: node scripts/create-backtest-table.js
 */
require('dotenv').config({ path: '.env.local' });

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function main() {
    const tableName = 'signum-backtest';

    // Check if table already exists
    try {
        const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
        console.log(`✅ Table "${tableName}" already exists. Status: ${desc.Table.TableStatus}`);
        console.log(`   Items: ${desc.Table.ItemCount}, Size: ${desc.Table.TableSizeBytes} bytes`);
        return;
    } catch (e) {
        if (e.name !== 'ResourceNotFoundException') {
            console.error('Error checking table:', e.message);
            return;
        }
    }

    // Create table
    console.log(`Creating table: ${tableName}...`);
    try {
        await client.send(new CreateTableCommand({
            TableName: tableName,
            KeySchema: [
                { AttributeName: 'ticker', KeyType: 'HASH' },     // Partition Key
                { AttributeName: 'recordedAt', KeyType: 'RANGE' }, // Sort Key
            ],
            AttributeDefinitions: [
                { AttributeName: 'ticker', AttributeType: 'S' },
                { AttributeName: 'recordedAt', AttributeType: 'S' },
            ],
            BillingMode: 'PAY_PER_REQUEST', // On-demand (no provisioned capacity needed)
        }));
        console.log(`✅ Table "${tableName}" created successfully (PAY_PER_REQUEST)`);
        console.log('   Key Schema: ticker (PK) + recordedAt (SK)');
    } catch (e) {
        console.error('Failed to create table:', e.message);
    }
}

main();
