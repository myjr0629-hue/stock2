// scripts/test_market_feed_trigger.mjs
import fs from 'fs';
import path from 'path';

const envLocal = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
let token = '';
envLocal.split('\n').forEach(line => {
    if (line.startsWith('VERCEL_AUTOMATION_BYPASS_SECRET=')) token = line.split('=')[1].trim();
});

async function main() {
    console.log("Triggering market feed API via Rest...");
    const res = await fetch('https://beta.signumhq.com/api/cron/market-feed', {
        headers: { 'x-vercel-protection-bypass': token }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log(data);
}
main();
