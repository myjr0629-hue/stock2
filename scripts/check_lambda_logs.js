require('dotenv').config({ path: '.env.local' });
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const fs = require('fs');
const c = new CloudWatchLogsClient({ region: 'us-east-1' });

// 사용: node scripts/check_lambda_logs.js [함수명=signum-harvest] [시간=2] [필터문자열]
//   예) node scripts/check_lambda_logs.js signum-cross-sector-intel 12 sonnet
const FN = process.argv[2] || 'signum-harvest';
const HOURS = Number(process.argv[3] || 2);
const FILTER = process.argv[4] || '';

(async () => {
  const now = Date.now();
  const twoHoursAgo = now - (HOURS * 60 * 60 * 1000);
  
  const r = await c.send(new FilterLogEventsCommand({
    logGroupName: '/aws/lambda/' + FN,
    ...(FILTER ? { filterPattern: '"' + FILTER + '"' } : {}),
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
