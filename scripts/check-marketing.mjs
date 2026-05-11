// Read marketing content via internal Redis proxy (the app's own Redis)
import { execSync } from 'child_process';

const BASE = 'http://localhost:3099';
const dateKey = new Date().toISOString().split('T')[0];

function fetchJson(url) {
  try {
    const out = execSync(`powershell -Command "Invoke-RestMethod -Uri '${url}' -TimeoutSec 15 | ConvertTo-Json -Depth 10 -Compress"`, { encoding: 'utf8', timeout: 20000 });
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

console.log(`\n📅 Date Key: ${dateKey}\n`);

// Read via the debug cache endpoint
const cacheUrl = (key) => `${BASE}/api/debug/redis?key=${encodeURIComponent(key)}`;

// Alternative: directly call daily-content with engine=template to see what data exists
// Let's use the dispatch dry_run endpoint that reads the content

// Try reading pulse
console.log('='.repeat(80));
console.log('Fetching pulse dispatch (dry_run=true)...');
const pulse = fetchJson(`${BASE}/api/cron/marketing-dispatch?action=pulse&region=en&dry_run=true`);
if (pulse) {
  console.log(JSON.stringify(pulse, null, 2));
} else {
  console.log('Failed or 404');
}

console.log('='.repeat(80));
console.log('Fetching morning dispatch (dry_run=true)...');
const morning = fetchJson(`${BASE}/api/cron/marketing-dispatch?action=morning&region=en&dry_run=true`);
if (morning) {
  console.log(JSON.stringify(morning, null, 2));
} else {
  console.log('Failed or 404');
}

console.log('='.repeat(80));
console.log('Fetching education dispatch (dry_run=true)...');
const edu = fetchJson(`${BASE}/api/cron/marketing-dispatch?action=education&region=en&dry_run=true`);
if (edu) {
  console.log(JSON.stringify(edu, null, 2));
} else {
  console.log('Failed or 404');
}
