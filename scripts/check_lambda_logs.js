require('dotenv').config({ path: '.env.local' });
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const fs = require('fs');
const c = new CloudWatchLogsClient({ region: 'us-east-1' });

(async () => {
  const now = Date.now();
  const twoHoursAgo = now - (2 * 60 * 60 * 1000);
  
  const r = await c.send(new FilterLogEventsCommand({
    logGroupName: '/aws/lambda/signum-harvest',
    startTime: twoHoursAgo,
    endTime: now,
    limit: 200
  }));
  
  let output = '=== FOUND ' + r.events.length + ' events ===\n\n';
  
  r.events.forEach(e => {
    const msg = e.message.trim();
    if (msg.length > 5) {
      output += '[' + new Date(e.timestamp).toISOString().slice(11,19) + '] ' + msg.substring(0, 500) + '\n';
    }
  });
  
  fs.writeFileSync('lambda_logs.txt', output);
  console.log('Saved to lambda_logs.txt, events:', r.events.length);
})().catch(e => console.error('ERROR:', e.message));
