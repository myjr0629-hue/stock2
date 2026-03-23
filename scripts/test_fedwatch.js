/**
 * CME FedWatch 스크래핑 v4 — 정밀 테이블 셀렉터
 */
const puppeteer = require('puppeteer');
const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log('🚀 CME FedWatch v4 시작...');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // 네트워크 요청 캡처 — 내부 JSON API 엔드포인트 찾기
        const apiResponses = [];
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('fedwatch') || url.includes('FedWatch') || 
                url.includes('Quotes/Future') || url.includes('probability') ||
                url.includes('rate') || url.includes('305')) {
                try {
                    const ct = response.headers()['content-type'] || '';
                    if (ct.includes('json') || ct.includes('javascript')) {
                        const body = await response.text();
                        apiResponses.push({ url: url.slice(0, 150), body: body.slice(0, 500) });
                    }
                } catch(e) {}
            }
        });

        console.log('📡 CME FedWatch 접속 중...');
        await page.goto('https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        await delay(6000);

        // 쿠키 닫기
        try {
            await page.click('#onetrust-accept-btn-handler');
            await delay(500);
        } catch(e) {}

        // 1) 캡처된 API 요청 출력
        console.log('\n📡 캡처된 내부 API 요청:');
        apiResponses.forEach((r, i) => {
            console.log(`\n  [${i + 1}] ${r.url}`);
            console.log(`      ${r.body.slice(0, 300)}`);
        });

        // 2) 모든 프레임 (iframe 포함)에서 텍스트 추출
        console.log('\n📊 모든 프레임에서 데이터 추출...');
        const frames = page.frames();
        console.log(`  프레임 수: ${frames.length}`);
        
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            try {
                const text = await frame.evaluate(() => document.body?.innerText || '');
                // EASE, NO CHANGE, HIKE 패턴 찾기
                if (text.includes('EASE') || text.includes('HIKE') || text.includes('NO CHANGE') ||
                    text.includes('87.6') || text.includes('12.4')) {
                    console.log(`\n  ✅ 프레임 ${i} (${frame.url().slice(0, 80)}) 에서 데이터 발견!`);
                    
                    // 정밀 추출
                    const easeM = text.match(/EASE\s*[\n\r\s]*([\d.]+%?)/);
                    const ncM = text.match(/NO\s*CHANGE\s*[\n\r\s]*([\d.]+%?)/);
                    const hikeM = text.match(/HIKE\s*[\n\r\s]*([\d.]+%?)/);
                    const meetM = text.match(/MEETING\s*DATE\s*[\n\r\s]*(\d[\d\s.]+\d{4})/);
                    const targetM = text.match(/Current\s*target\s*rate\s*is\s*([\d-]+)/);
                    const contractM = text.match(/CONTRACT\s*[\n\r\s]*(\w+)/);
                    const midM = text.match(/MID\s*PRICE\s*[\n\r\s]*([\d.]+)/);

                    console.log(`    EASE:       ${easeM?.[1] || '-'}`);
                    console.log(`    NO CHANGE:  ${ncM?.[1] || '-'}`);
                    console.log(`    HIKE:       ${hikeM?.[1] || '-'}`);
                    console.log(`    미팅 날짜:   ${meetM?.[1] || '-'}`);
                    console.log(`    Target Rate: ${targetM?.[1] || '-'}`);
                    console.log(`    Contract:    ${contractM?.[1] || '-'}`);
                    console.log(`    MID Price:   ${midM?.[1] || '-'}`);

                    // 테이블 행 추출
                    const rows = await frame.evaluate(() => {
                        const results = [];
                        document.querySelectorAll('tr').forEach(row => {
                            const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText.trim());
                            if (cells.length >= 3) results.push(cells);
                        });
                        return results;
                    });
                    if (rows.length > 0) {
                        console.log('\n    테이블 데이터:');
                        rows.slice(0, 10).forEach(r => console.log(`      ${r.join(' | ')}`));
                    }
                }
            } catch(e) {}
        }

        // 3) 마지막 수단 — 광범위 텍스트 검색
        console.log('\n📊 메인 프레임 전체 텍스트에서 숫자% 패턴 찾기...');
        const fullText = await page.evaluate(() => document.body.innerText);
        const allPct = [...fullText.matchAll(/([\d.]+)%/g)].map(m => m[1]);
        const uniquePct = [...new Set(allPct)].sort((a, b) => parseFloat(b) - parseFloat(a));
        console.log(`  발견된 %값: ${uniquePct.slice(0, 20).join(', ')}`);

        // "350-375", "375-400" 패턴 찾기
        const rateRanges = [...fullText.matchAll(/(\d{3})-(\d{3})/g)].map(m => `${m[1]}-${m[2]}`);
        console.log(`  금리 범위: ${rateRanges.join(', ')}`);

        // "0.0" "87.6" "12.4" 근처 텍스트 
        const idx876 = fullText.indexOf('87.6');
        if (idx876 !== -1) {
            console.log(`\n  "87.6" 주변 텍스트: ...${fullText.slice(Math.max(0, idx876-100), idx876+100)}...`);
        }

        console.log('\n✅ 완료!');
    } catch (err) {
        console.error('❌:', err.message);
    } finally {
        if (browser) await browser.close();
    }
})();
