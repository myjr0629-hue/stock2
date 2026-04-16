require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const c = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
c.send(new DeleteCommand({ TableName: 'signum-unified-cache', Key: { pk: 'NVDA' } }))
.then(()=>console.log('Cleared Dynamo signum-unified-cache'))
.catch(e=>console.log(e.message));
