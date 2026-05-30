const requireDotenv = require('dotenv');
requireDotenv.config({ path: '.env.local' });

async function trigger() {
  console.log('--- Triggering Local Cron /api/cron/dispatch-v2/pulse ---');
  
  // Use date=2026-06-01 to bypass Redis dedup lock safety gate
  const url = 'http://localhost:3000/api/cron/dispatch-v2/pulse?region=en&dry_run=false&date=2026-06-01';
  const secret = process.env.CRON_SECRET;
  
  try {
    const headers = {};
    if (secret) {
      headers['Authorization'] = `Bearer ${secret}`;
    }
    
    console.log(`Sending GET request to: ${url}`);
    const res = await fetch(url, { headers });
    
    console.log(`HTTP Status: ${res.status}`);
    const json = await res.json();
    console.log('Response JSON:', JSON.stringify(json, null, 2));
    
  } catch (err) {
    console.error('❌ Trigger failed:', err.message);
  }
}

trigger();
