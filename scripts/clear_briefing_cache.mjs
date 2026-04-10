// scripts/clear_briefing_cache.mjs
// 1회성 스크립트: 오염된 모닝 브리핑 캐시(24시간 TTL) 삭제
import fs from 'fs';
import path from 'path';

// Load .env.local manually for REST url
const envLocal = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
let restUrl = '';
let restToken = '';

envLocal.split('\n').forEach(line => {
    if (line.startsWith('UPSTASH_REDIS_REST_URL=')) restUrl = line.split('=')[1].trim();
    if (line.startsWith('UPSTASH_REDIS_REST_TOKEN=')) restToken = line.split('=')[1].trim();
});

async function main() {
    if (!restUrl || !restToken) {
        throw new Error('Missing UPSTASH env vars');
    }

    console.log('[Cache Clear] Starting to purge contaminated Morning Briefing caches...');

    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const keysToClear = [
        'guardian:morning_briefing',
        'guardian:morning_briefing:en', 
        'guardian:morning_briefing:ko', 
        'guardian:morning_briefing:ja',
        `briefing:healing:${todayET}`
    ];

    for (const key of keysToClear) {
        try {
            console.log(`Deleting key: ${key}...`);
            const res = await fetch(`${restUrl}/del/${encodeURIComponent(key)}`, {
                headers: { 'Authorization': `Bearer ${restToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                console.log(`- Deleted (effected keys: ${data.result})`);
            } else {
                console.log(`- Failed HTTP: ${res.status}`);
            }
        } catch (e) {
            console.error(`- Error: ${e.message}`);
        }
    }

    console.log('[Cache Clear] Complete. The next API hit will regenerate the briefing.');
}

main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
