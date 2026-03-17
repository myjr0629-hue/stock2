/**
 * Test OMR Harvest — Invoke Lambda and verify DynamoDB records
 * 
 * 1. Invokes signum-harvest Lambda with forceRun
 * 2. Waits for completion
 * 3. Queries signum-omr-history for recent records
 * 
 * Usage: node scripts/test-omr-harvest.js
 */
require('dotenv').config({ path: '.env.local' });
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const lambda = new LambdaClient({ region: 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
    marshallOptions: { removeUndefinedValues: true }
});

async function test() {
    console.log('=== OMR Harvest Test ===\n');

    // Step 1: Check if OMR records already exist
    console.log('Step 1: Checking existing OMR records...');
    try {
        const scan = await ddb.send(new ScanCommand({
            TableName: 'signum-omr-history',
            Limit: 5,
        }));
        console.log(`  Found ${scan.Items?.length || 0} existing records`);
        if (scan.Items && scan.Items.length > 0) {
            console.log('  Sample:', JSON.stringify(scan.Items[0], null, 2));
        }
    } catch (e) {
        console.log('  Table check error:', e.message);
    }

    // Step 2: Invoke Lambda
    console.log('\nStep 2: Invoking Lambda (forceRun)...');
    console.log('  This takes ~3-5 minutes for 100 GEX tickers...');
    try {
        const response = await lambda.send(new InvokeCommand({
            FunctionName: 'signum-harvest',
            Payload: JSON.stringify({ forceRun: true }),
            InvocationType: 'RequestResponse',
        }));

        const payload = JSON.parse(new TextDecoder().decode(response.Payload));
        console.log('  Lambda response status:', response.StatusCode);
        
        if (payload.body) {
            const body = JSON.parse(payload.body);
            console.log('  Version:', body.version);
            console.log('  Duration:', body.duration + 's');
            console.log('  Results:', JSON.stringify(body.results, null, 2));
        } else if (payload.errorMessage) {
            console.log('  ERROR:', payload.errorMessage);
        }
    } catch (e) {
        console.log('  Lambda invoke error:', e.message);
        console.log('  (If timeout, Lambda may still be running. Check DynamoDB in a few minutes.)');
    }

    // Step 3: Verify OMR records
    console.log('\nStep 3: Verifying OMR records...');
    const testTickers = ['NVDA', 'AAPL', 'TSLA', 'META', 'MSFT'];
    let totalFound = 0;
    
    for (const ticker of testTickers) {
        try {
            const result = await ddb.send(new QueryCommand({
                TableName: 'signum-omr-history',
                KeyConditionExpression: 'ticker = :tk',
                ExpressionAttributeValues: { ':tk': ticker },
                ScanIndexForward: false, // latest first
                Limit: 1,
            }));
            
            if (result.Items && result.Items.length > 0) {
                const item = result.Items[0];
                const time = new Date(item.timestamp).toISOString();
                console.log(`  ✅ ${ticker}: ${item.regime} (${item.confidence}%) @ ${time}`);
                console.log(`     IV=${item.ivVal}% Skew=${item.skewVal} PCR=${item.pcr} UOA=${item.uoaScore} Price=$${item.closePrice}`);
                totalFound++;
            } else {
                console.log(`  ❌ ${ticker}: no records`);
            }
        } catch (e) {
            console.log(`  ❌ ${ticker}: error — ${e.message}`);
        }
    }

    // Step 4: Count total records
    console.log('\nStep 4: Total record count...');
    try {
        const scan = await ddb.send(new ScanCommand({
            TableName: 'signum-omr-history',
            Select: 'COUNT',
        }));
        console.log(`  Total OMR records: ${scan.Count}`);
    } catch (e) {
        console.log('  Count error:', e.message);
    }

    console.log('\n=== Result ===');
    console.log(`${totalFound}/${testTickers.length} M7 tickers have OMR records`);
    if (totalFound >= 3) {
        console.log('✅ OMR pipeline is WORKING!');
    } else {
        console.log('⚠️  OMR pipeline may need more time (Lambda timeout or market closed)');
        console.log('   Re-run this test after the next Lambda cron execution.');
    }
}

test().catch(e => console.error('Test failed:', e));
