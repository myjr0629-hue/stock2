/**
 * CME FedWatch Scraper → Redis + DynamoDB
 * Run this locally or on a schedule
 * 
 * Usage: node scripts/scrape-fedwatch.js
 */
const puppeteer = require('puppeteer');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const delay = ms => new Promise(r => setTimeout(r, ms));

// --- DynamoDB ---
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
    marshallOptions: { removeUndefinedValues: true }
});

// --- Redis (via Vercel API) ---
async function saveToRedis(data) {
    try {
        const https = require('https');
        const payload = JSON.stringify(data);
        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'www.signumhq.com',
                path: '/api/guardian/fedwatch-store',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            }, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => { 
                    console.log('[Redis] Status:', res.statusCode, d.slice(0, 100));
                    resolve(d); 
                });
            });
            req.on('error', e => { console.warn('[Redis] Error:', e.message); resolve(null); });
            req.write(payload);
            req.end();
        });
    } catch (e) {
        console.warn('[Redis] Save failed:', e.message);
    }
}

// --- DynamoDB Save ---
async function saveToDynamoDB(data) {
    try {
        await ddbClient.send(new PutCommand({
            TableName: 'signum-pattern-db',
            Item: {
                pattern: 'FEDWATCH:latest',
                timestamp: Date.now(),
                ...data,
            }
        }));
        console.log('[DynamoDB] Saved to signum-pattern-db FEDWATCH:latest');

        // Also save to history table
        const dateKey = new Date().toISOString().slice(0, 10);
        await ddbClient.send(new PutCommand({
            TableName: 'signum-pattern-db',
            Item: {
                pattern: `FEDWATCH:${dateKey}`,
                timestamp: Date.now(),
                ...data,
            }
        }));
        console.log(`[DynamoDB] Saved history FEDWATCH:${dateKey}`);
    } catch (e) {
        console.error('[DynamoDB] Error:', e.message);
    }
}

// --- CME FedWatch Scraper ---
async function scrapeFedWatch() {
    console.log('🚀 CME FedWatch 스크래핑 시작...');
    const startTime = Date.now();
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        console.log('📡 CME FedWatch 페이지 접속...');
        await page.goto('https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        await delay(6000);

        // 쿠키 닫기
        try { await page.click('#onetrust-accept-btn-handler'); await delay(500); } catch {}

        // 모든 프레임에서 데이터 추출
        console.log('📊 데이터 추출 중...');
        const frames = page.frames();
        let result = null;

        for (const frame of frames) {
            try {
                const text = await frame.evaluate(() => document.body?.innerText || '');
                if (text.includes('EASE') && text.includes('HIKE') && text.includes('NO CHANGE')) {
                    const easeM = text.match(/EASE\s*[\n\r\s]*([\d.]+)%?/);
                    const ncM = text.match(/NO\s*CHANGE\s*[\n\r\s]*([\d.]+)%?/);
                    const hikeM = text.match(/HIKE\s*[\n\r\s]*([\d.]+)%?/);
                    const targetM = text.match(/Current\s*target\s*rate\s*is\s*([\d]+-[\d]+)/i);
                    const meetingM = text.match(/(\d+\s*\d+\s*2026)/);
                    const contractM = text.match(/CONTRACT\s*[\n\r\s]*(\w+)/);
                    const midPriceM = text.match(/MID\s*PRICE\s*[\n\r\s]*([\d.]+)/);

                    if (easeM || ncM || hikeM) {
                        result = {
                            ease: easeM ? parseFloat(easeM[1]) : 0,
                            noChange: ncM ? parseFloat(ncM[1]) : 0,
                            hike: hikeM ? parseFloat(hikeM[1]) : 0,
                            targetRate: targetM?.[1] || null,
                            nextMeetingDate: meetingM?.[1]?.trim() || null,
                            contract: contractM?.[1] || null,
                            midPrice: midPriceM ? parseFloat(midPriceM[1]) : null,
                        };
                        console.log('✅ 데이터 추출 성공!');
                        break;
                    }
                }
            } catch {}
        }

        // 메인 페이지에서 카운트다운 추출
        const mainText = await page.evaluate(() => document.body.innerText);
        const daysM = mainText.match(/(\d+)\s*DAYS/i);
        if (result && daysM) {
            result.daysUntilFomc = parseInt(daysM[1]);
        }

        if (!result) {
            // Fallback: 메인 페이지에서 % 패턴 찾기
            const allPct = [...mainText.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1]));
            console.log('⚠️ iframe 추출 실패. 메인 페이지 %값:', allPct.slice(0, 10));
            throw new Error('FedWatch 확률 데이터 추출 실패');
        }

        result.scrapedAt = new Date().toISOString();
        result.elapsedMs = Date.now() - startTime;

        console.log('\n════════════════════════════════════');
        console.log('  📋 FedWatch 데이터');
        console.log('════════════════════════════════════');
        console.log(`  인하 (EASE):     ${result.ease}%`);
        console.log(`  동결 (NO CHANGE): ${result.noChange}%`);
        console.log(`  인상 (HIKE):     ${result.hike}%`);
        console.log(`  Target Rate:     ${result.targetRate}`);
        console.log(`  다음 FOMC:       ${result.daysUntilFomc}일 후`);
        console.log(`  소요시간:         ${(result.elapsedMs / 1000).toFixed(1)}s`);
        console.log('════════════════════════════════════\n');

        return result;
    } finally {
        if (browser) await browser.close();
    }
}

// --- Main ---
(async () => {
    try {
        const data = await scrapeFedWatch();
        if (!data) { console.error('❌ 추출 실패'); process.exit(1); }

        // 1) Save to Redis (via Vercel API)
        console.log('\n📤 Redis 저장 중...');
        await saveToRedis(data);

        // 2) Save to DynamoDB
        console.log('📤 DynamoDB 저장 중...');
        await saveToDynamoDB(data);

        console.log('\n✅ 모든 저장 완료!');
    } catch (e) {
        console.error('❌ 에러:', e.message);
        process.exit(1);
    }
})();
