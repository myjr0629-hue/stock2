require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

async function run() {
    const ticker = 'NVDA';
    // 1. Check Dynamo
    try {
        const dynamoData = await client.send(new GetCommand({ TableName: 'signum-pattern-db', Key: { pattern: 'ANALYST:' + ticker } }));
        if (dynamoData.Item && dynamoData.Item.analystCard) {
            console.log("Dynamo Hit:", JSON.stringify(dynamoData.Item.analystCard, null, 2));
            return;
        }
    } catch(e) { console.log(e.message); }

    console.log("Missed Dynamo, fetching FMP...");
    const fmpKey = process.env.FMP_API_KEY;
    const [gradesRes, targetRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v4/upgrades-downgrades-consensus?symbol=${ticker}&apikey=${fmpKey}`),
        fetch(`https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${ticker}&apikey=${fmpKey}`)
    ]);
    const grades = await gradesRes.json();
    const target = await targetRes.json();
    console.log("Grades:", typeof grades, grades.length);
    console.log("Target:", typeof target, target.length, target[0]);
}
run();
