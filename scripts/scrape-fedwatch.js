/**
 * CME FedWatch Scraper → Redis + DynamoDB
 * Run this locally or on a schedule
 * 
 * Usage: node scripts/scrape-fedwatch.js
 */
const puppeteer = require('puppeteer');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

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
    console.log('[FedWatch] Starting CME FedWatch scrape...');
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

        // === Strategy A: Intercept network responses for probability data ===
        const capturedData = [];
        page.on('response', async (response) => {
            const url = response.url();
            const ct = response.headers()['content-type'] || '';
            if (ct.includes('json') || url.includes('api') || url.includes('fedwatch') || url.includes('probabilities')) {
                try {
                    const text = await response.text();
                    if (text.includes('ease') || text.includes('EASE') || text.includes('noChange') || 
                        text.includes('hike') || text.includes('HIKE') || text.includes('probability') ||
                        text.includes('target_rate') || text.includes('targetRate') || text.includes('cut')) {
                        console.log(`[NET] Captured: ${url.slice(0, 150)}`);
                        try { capturedData.push({ url, data: JSON.parse(text) }); } catch {}
                    }
                } catch {}
            }
        });

        console.log('[FedWatch] Loading CME page...');
        await page.goto('https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', {
            waitUntil: 'networkidle2',
            timeout: 45000,
        });
        await delay(10000);

        // Cookie dismiss
        try { await page.click('#onetrust-accept-btn-handler'); await delay(1000); } catch {}
        await delay(5000);

        let result = null;

        // Check captured network data
        if (capturedData.length > 0) {
            console.log(`[FedWatch] Captured ${capturedData.length} potential API responses`);
            for (const { url, data } of capturedData) {
                const d = typeof data === 'object' ? data : {};
                if (typeof d.ease === 'number' || typeof d.noChange === 'number') {
                    result = { ease: d.ease || 0, noChange: d.noChange || 0, hike: d.hike || 0 };
                    console.log(`[FedWatch] Direct format from: ${url.slice(0, 80)}`);
                    break;
                }
                if (Array.isArray(d) && d.length > 0 && d[0].probability) {
                    const m = d[0]; result = { ease: m.probability.ease || 0, noChange: m.probability.noChange || 0, hike: m.probability.hike || 0 };
                    if (m.date) result.nextMeetingDate = m.date;
                    break;
                }
                if (d.data && typeof d.data === 'object') {
                    const inner = Array.isArray(d.data) ? d.data[0] : d.data;
                    if (inner && (inner.ease !== undefined || inner.cut !== undefined)) {
                        result = { ease: inner.ease || inner.cut || 0, noChange: inner.noChange || inner.hold || 0, hike: inner.hike || 0 };
                        break;
                    }
                }
                // Log structure for debugging
                console.log(`[NET-DEBUG] Keys: ${Object.keys(d).slice(0, 10).join(', ')}`);
            }
        } else {
            console.log('[FedWatch] No API responses captured');
        }

        // === Strategy B: DOM text extraction (iframe) ===
        if (!result) {
            console.log('[FedWatch] Trying DOM extraction...');
            const frames = page.frames();
            for (const frame of frames) {
                try {
                    const text = await frame.evaluate(() => document.body?.innerText || '');
                    if (text.includes('EASE') && text.includes('HIKE') && text.includes('NO CHANGE')) {
                        const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
                        let headerIdx = -1;
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].includes('EASE') && lines[i].includes('HIKE')) { headerIdx = i; break; }
                        }
                        if (headerIdx >= 0) {
                            const rem = lines.slice(headerIdx + 1).join(' ');
                            const pcts = [...rem.matchAll(/([\d.]+)\s*%/g)].map(m => parseFloat(m[1]));
                            if (pcts.length >= 3) {
                                const hdr = lines[headerIdx];
                                const cols = [
                                    { n: 'EASE', p: hdr.indexOf('EASE') },
                                    { n: 'NC', p: hdr.indexOf('NO CHANGE') },
                                    { n: 'HIKE', p: hdr.indexOf('HIKE') },
                                ].filter(c => c.p >= 0).sort((a, b) => a.p - b.p);
                                if (cols.length === 3) {
                                    result = { ease: pcts[0], noChange: pcts[1], hike: pcts[2] };
                                    if (cols[0].n !== 'EASE') { /* reorder based on header */ }
                                }
                            }
                        }
                        if (!result) {
                            const eM = text.match(/EASE\s*[\n\r\s]*([\d.]+)%?/);
                            const nM = text.match(/NO\s*CHANGE\s*[\n\r\s]*([\d.]+)%?/);
                            const hM = text.match(/HIKE\s*[\n\r\s]*([\d.]+)%?/);
                            if (eM || nM || hM) result = { ease: eM ? parseFloat(eM[1]) : 0, noChange: nM ? parseFloat(nM[1]) : 0, hike: hM ? parseFloat(hM[1]) : 0 };
                        }
                        if (result) break;
                    }
                } catch {}
            }
        }

        // === Strategy C: Brute-force all % elements ===
        if (!result) {
            console.log('[FedWatch] Trying brute-force...');
            const allPctText = await page.evaluate(() => {
                const els = document.querySelectorAll('*');
                const t = [];
                els.forEach(el => { if (el.children.length === 0 && el.textContent) { const s = el.textContent.trim(); if (s.includes('%') && /\d/.test(s)) t.push(s); } });
                return t.join(' | ');
            });
            console.log(`[FedWatch] % elements: ${allPctText.slice(0, 300)}`);
            const allPcts = [...allPctText.matchAll(/([\d.]+)\s*%/g)].map(m => parseFloat(m[1])).filter(p => p >= 0 && p <= 100);
            for (let i = 0; i <= allPcts.length - 3; i++) {
                const sum = allPcts[i] + allPcts[i+1] + allPcts[i+2];
                if (Math.abs(sum - 100) < 2) {
                    result = { ease: allPcts[i], noChange: allPcts[i+1], hike: allPcts[i+2] };
                    console.log(`[FedWatch] Brute-force success: ${result.ease}% / ${result.noChange}% / ${result.hike}%`);
                    break;
                }
            }
        }

        // Extract countdown + metadata from main page
        const mainText = await page.evaluate(() => document.body?.innerText || '');
        const daysM = mainText.match(/(\d+)\s*DAYS?/i);
        const hrsM = mainText.match(/(\d+)\s*HRS?/i);
        if (result && daysM) { result.daysUntilFomc = parseInt(daysM[1]); if (hrsM) result.hoursUntilFomc = parseInt(hrsM[1]); }
        else if (result && hrsM) { result.daysUntilFomc = 0; result.hoursUntilFomc = parseInt(hrsM[1]); }

        if (result) {
            const targetM = mainText.match(/target\s*rate[:\s]*([\d.]+-[\d.]+)/i);
            result.targetRate = targetM?.[1] || null;
            const meetingM = mainText.match(/(\w+\s+\d+,?\s+\d{4})/);
            result.nextMeetingDate = meetingM?.[1]?.trim() || null;
        }

        if (!result) {
            console.log('[FedWatch] All strategies failed');
            throw new Error('FedWatch probability extraction failed');
        }

        result.scrapedAt = new Date().toISOString();
        result.elapsedMs = Date.now() - startTime;

        console.log('\n====================================');
        console.log('  FedWatch Data');
        console.log('====================================');
        console.log(`  Cut (EASE):       ${result.ease}%`);
        console.log(`  Hold (NO CHANGE): ${result.noChange}%`);
        console.log(`  Hike:             ${result.hike}%`);
        console.log(`  Target Rate:      ${result.targetRate}`);
        console.log(`  Next FOMC:        D-${result.daysUntilFomc} (${result.hoursUntilFomc || '?'}h)`);
        console.log(`  Elapsed:          ${(result.elapsedMs / 1000).toFixed(1)}s`);
        console.log('====================================\n');

        return result;
    } finally {
        if (browser) await browser.close();
    }
}

// --- 1W Change: Read 7-day-old record from DynamoDB ---
async function get1WeekAgoData() {
    try {
        const d = new Date();
        // Try 7 days ago, then 6, then 8 (in case of weekends/holidays)
        for (const offset of [7, 6, 8, 5, 9]) {
            const past = new Date(d);
            past.setDate(past.getDate() - offset);
            const dateKey = past.toISOString().slice(0, 10);
            const result = await ddbClient.send(new GetCommand({
                TableName: 'signum-pattern-db',
                Key: { pattern: `FEDWATCH:${dateKey}` },
            }));
            if (result.Item && typeof result.Item.noChange === 'number') {
                console.log(`[1W Change] Found data from ${dateKey} (D-${offset})`);
                return result.Item;
            }
        }
        console.log('[1W Change] No historical data found (D-5 to D-9)');
        return null;
    } catch (e) {
        console.warn('[1W Change] DynamoDB read error:', e.message);
        return null;
    }
}

// --- Main ---
(async () => {
    try {
        const data = await scrapeFedWatch();
        if (!data) { console.error('Extraction failed'); process.exit(1); }

        // 0) Fetch 1W ago data for change comparison
        console.log('\n[1W Change] Fetching historical data...');
        const prev = await get1WeekAgoData();
        if (prev) {
            data.prevEase = prev.ease ?? null;
            data.prevNoChange = prev.noChange ?? null;
            data.prevHike = prev.hike ?? null;
            console.log(`[1W Change] prev: EASE=${data.prevEase}%, HOLD=${data.prevNoChange}%, HIKE=${data.prevHike}%`);
        }

        // 1) Save to Redis (via Vercel API)
        console.log('\nSaving to Redis...');
        await saveToRedis(data);

        // 2) Save to DynamoDB
        console.log('Saving to DynamoDB...');
        await saveToDynamoDB(data);

        console.log('\nAll saves complete!');
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
})();
