'use strict';
/* ============================================================================
 * 데이터 무결성 감시기 — 실제 화면 읽기 (헤드리스 크롬, 선택 층)
 *
 * API 값과 calcPriceDisplay 재현이 맞아도, 화면 끝에서 다른 경로(예: Intel 섹터 화면은 31개 이상 묶음 시세를 폴링해 값을 덮어쓴다)가
 * 값을 바꿀 수 있다. 그래서 운영 화면을 실제로 열어 «글자로 보이는 가격·등락»을 읽어 기준과 대조한다.
 *   · Flow     /ko/app-view/flow?t=SYM        큰 가격 · 등락 · 시간외 칸(POST/PRE)
 *   · Intel    /ko/app-view/intel → M7 섹터    핵심 종목 7행의 가격 · 등락
 * 사람 방문과 같은 요청(페이지당 ticker·chart·시세 폴링)이라 종목 수를 작게(3) 하고 30분에 한 번만 부른다.
 * puppeteer 나 크롬이 없으면 null — 호출부가 «화면 읽기 불가» 경고 한 줄을 낸다(조용히 건너뛰지 않는다).
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SHOT_DIR = path.join(os.homedir(), 'signum-ego-io', 'integrity', 'shots');

function findChrome() {
    for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) if (fs.existsSync(p)) return p;
    try {
        const root = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
        for (const v of fs.readdirSync(root).sort().reverse()) {
            const q = path.join(root, v, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
            if (fs.existsSync(q)) return q;
        }
    } catch { /* 없음 */ }
    return null;
}

const num = (s) => Number(String(s).replace(/,/g, ''));

/** Flow 화면 글자 → {price, pct, extLabel, extPrice, extPct, marketLine} */
function parseFlowText(text, sym) {
    const t = String(text || '').replace(/\n+/g, ' | ');
    const iSym = t.indexOf(` | ${sym} | `);
    const s = iSym >= 0 ? t.slice(iSym) : t;
    // "... | 10/12, 21:30 ET | $152.68 | ▼ -1.08% | POST (CLOSED) | $149.40 | -2.15% | MAX PAIN ..."
    const m = /\bET \| \$([\d,]+(?:\.\d+)?) \| [▲▼△▽]?\s?([+-]?\d+(?:\.\d+)?)%(?: \| (PRE CLOSE|PRE \(CLOSED\)|PRE|POST \(CLOSED\)|POST)(?: \| ([^|]*?ET))? \| \$([\d,]+(?:\.\d+)?)(?: \| ([+-]?\d+(?:\.\d+)?)%)?)?/.exec(s);
    if (!m) return null;
    const ml = /(MARKET CLOSED|PRE-?MARKET|AFTER-?HOURS|POST-?MARKET|LIVE|REGULAR)/i.exec(s.slice(0, 200));
    return { price: num(m[1]), pct: num(m[2]), extLabel: m[3] || null, extPrice: m[5] ? num(m[5]) : null, extPct: m[6] ? num(m[6]) : null, extAsOf: m[4] || null, marketLine: ml ? ml[1] : null };
}
/** Intel 섹터 상세 글자 → [{sym, rsi, price, pct}] */
function parseIntelRows(text) {
    const t = String(text || '').replace(/\n+/g, ' | ');
    const out = [];
    const re = /\b([A-Z][A-Z.]{0,4}) \| RSI (\d+) \| \$([\d,]+(?:\.\d+)?) \| ([+-]?\d+(?:\.\d+)?)%/g;
    let m;
    while ((m = re.exec(t))) out.push({ sym: m[1], rsi: Number(m[2]), price: num(m[3]), pct: num(m[4]) });
    return out;
}

async function probe({ flowSymbols = [], intel = true, base = 'https://www.signumhq.com', shots = false } = {}) {
    let puppeteer;
    try { puppeteer = require('puppeteer'); } catch { return null; }
    const exe = findChrome();
    if (!exe) return null;
    const res = { ok: false, flow: {}, intel: null, errs: [] };
    let browser;
    try {
        browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 }, timeout: 30000 });
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 signum-integrity-probe';
        for (const sym of flowSymbols) {
            const page = await browser.newPage();
            try {
                await page.setUserAgent(ua);
                await page.goto(`${base}/ko/app-view/flow?t=${encodeURIComponent(sym)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
                let parsed = null;
                for (let i = 0; i < 12 && !parsed; i++) {                      // 최대 ~24초 — 가격 칸이 그려질 때까지
                    await new Promise((r) => setTimeout(r, 2000));
                    const text = await page.evaluate(() => document.body.innerText);
                    parsed = parseFlowText(text, sym);
                    if (parsed) { parsed.at = Date.now(); parsed.textHead = text.slice(0, 160); }
                }
                if (shots) { fs.mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(SHOT_DIR, `flow-${sym}-${Date.now()}.png`) }); }
                res.flow[sym] = parsed;
                if (!parsed) res.errs.push(`flow ${sym}: 가격 칸을 못 읽음`);
            } catch (e) { res.errs.push(`flow ${sym}: ${String(e && e.message || e).slice(0, 80)}`); res.flow[sym] = null; }
            finally { await page.close().catch(() => { }); }
        }
        if (intel) {
            const page = await browser.newPage();
            try {
                await page.setUserAgent(ua);
                await page.goto(`${base}/ko/app-view/intel`, { waitUntil: 'domcontentloaded', timeout: 45000 });
                await new Promise((r) => setTimeout(r, 6000));
                let clicked = false;
                for (let i = 0; i < 8 && !clicked; i++) {                       // 섹터 카드가 그려질 때까지
                    await new Promise((r) => setTimeout(r, 2000));
                    clicked = await page.evaluate(() => {
                        const els = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /M7 테크/.test(e.textContent));
                        let n = els[0]; for (let i = 0; i < 6 && n; i++) { if (n.tagName === 'BUTTON' || n.getAttribute('role') === 'button') break; n = n.parentElement; }
                        if (n) { n.click(); return true; } return false;
                    });
                }
                // ⚠ 이 화면은 처음에 맞는 값을 그렸다가 약 10초 뒤 첫 시세 폴링(/api/live/quotes 90여 종목)이 값을 덮어쓴다(10/13 실측) — 20초 보고 «마지막» 값을 쓴다
                let rows = [], first = [];
                if (clicked) for (let i = 0; i < 7; i++) { await new Promise((r) => setTimeout(r, 3000)); rows = parseIntelRows(await page.evaluate(() => document.body.innerText)); if (!first.length && rows.length) first = rows; }
                if (shots) { fs.mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(SHOT_DIR, `intel-m7-${Date.now()}.png`) }); }
                res.intel = { sector: 'm7', rows, first, at: Date.now() };
                if (!rows.length) res.errs.push('intel m7: 종목 행을 못 읽음');
            } catch (e) { res.errs.push(`intel: ${String(e && e.message || e).slice(0, 80)}`); }
            finally { await page.close().catch(() => { }); }
        }
        res.ok = true;
    } catch (e) { res.errs.push(`browser: ${String(e && e.message || e).slice(0, 100)}`); }
    finally { if (browser) await browser.close().catch(() => { }); }
    return res;
}

module.exports = { probe, parseFlowText, parseIntelRows, findChrome };
