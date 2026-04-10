// scripts/clear_briefing_cache.js
// 1회성 스크립트: 오염된 모닝 브리핑 캐시(24시간 TTL) 삭제
require('dotenv').config({ path: '.env.local' });
const { deleteFromCache, getFromCache } = require('../src/services/redisClient');

async function main() {
    console.log('[Cache Clear] Starting to purge contaminated Morning Briefing caches...');

    const keysToClear = [
        'guardian:morning_briefing',     // legacy
        'guardian:morning_briefing:en', 
        'guardian:morning_briefing:ko', 
        'guardian:morning_briefing:ja'
    ];

    for (const key of keysToClear) {
        try {
            console.log(`Checking key: ${key}...`);
            const exists = await getFromCache(key);
            if (exists) {
                console.log(`- Value found for ${key}, deleting...`);
                await deleteFromCache(key);
                console.log(`- Deleted ${key}.`);
            } else {
                console.log(`- Not found: ${key}`);
            }
        } catch (e) {
            console.error(`- Failed to process ${key}: ${e.message}`);
        }
    }

    // Try today's healing flag too
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const healingKey = `briefing:healing:${todayET}`;
    try {
        await deleteFromCache(healingKey);
        console.log(`- Cleared healing key: ${healingKey}`);
    } catch (e) {
        /* ignore */
    }

    console.log('[Cache Clear] Complete. The next API hit will regenerate the briefing.');
}

main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
