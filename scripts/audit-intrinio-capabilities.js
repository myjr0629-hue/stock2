#!/usr/bin/env node
/**
 * audit-intrinio-capabilities — Intrinio 플랜 능력 전수조사기
 * ============================================================================
 * 왜 있나 (2026-09-02 대표: 「모든 부분을 다 사용하고 있는지 제대로 하고있는지
 *          전부 조사해야할듯하다」):
 *
 *   이관 매핑표가 «엔드포인트 대 엔드포인트»였던 탓에 두 번 크게 틀렸다.
 *     · 옵션 실시간 그릭스가 되는데 「안 된다」고 보고했다
 *       (`options/chain/.../realtime` 403 만 보고 판단 — 실제 경로는
 *        `options/greeks/by_ticker/{t}/realtime` 였다)
 *     · 웹소켓은 표에 칸이 없어 통째로 시야 밖이었다
 *
 *   그래서 «우리 키로 실제로 뭐가 되는지»를 주기적으로 재는 도구를 둔다.
 *   추측하지 않는다. 403/404/200 을 직접 받아 적는다.
 *
 * 사용:
 *   node scripts/audit-intrinio-capabilities.js          (요약)
 *   node scripts/audit-intrinio-capabilities.js --unused (안 쓰는 것만)
 *   node scripts/audit-intrinio-capabilities.js --json   (기계용)
 *
 * 키: .env.local 에 없으면 Lambda(signum-flow-harvest) 환경변수에서 가져온다.
 *     정본 절차는 .agent/ACCESS-RUNBOOK.md.
 * ============================================================================
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = 'api-v2.intrinio.com';
const T = 'NVDA';
const CONTRACT = 'NVDA__260904C00220000';

// ── 조사 대상 ─────────────────────────────────────────────────────────
// `use` = 우리 저장소에서 이 경로를 실제로 부르는지 찾을 때 쓸 문자열.
//         null 이면 «쓸 일이 없거나 아직 판단 안 함».
const CATALOG = [
    // ── 옵션 ──────────────────────────────────────────────────────────
    ['옵션', '체인 EOD (OI 포함)', `options/chain/${T}/2026-09-04/eod`, 'options/chain/'],
    ['옵션', '만기 목록 EOD', `options/expirations/${T}/eod`, 'options/expirations/'],
    ['옵션', '계약 가격 EOD', `options/prices/${CONTRACT}/eod`, 'options/prices/'],
    ['옵션', '티커별 가격 EOD', `options/prices/by_ticker/${T}/eod`, 'options/prices/by_ticker'],
    ['옵션', '★ 실시간 그릭스(티커)', `options/greeks/by_ticker/${T}/realtime`, 'options/greeks/by_ticker'],
    ['옵션', '★ 실시간 그릭스(계약)', `options/greeks/${CONTRACT}/realtime`, 'options/greeks/'],
    ['옵션', '전종목 스냅샷(EOD)', 'options/snapshots', 'options/snapshots'],
    ['옵션', '★ 10분 스냅샷(장중)', 'options/snapshots/intraday', 'options/snapshots/intraday'],
    ['옵션', '티커별 집계', 'options/aggregates', 'options/aggregates'],
    ['옵션', '옵션 상장 티커', 'options/tickers', 'options/tickers'],
    ['옵션', '체인 실시간(OPRA)', `options/chain/${T}/2026-09-04/realtime`, null],
    ['옵션', '이상거래(OPRA)', `options/unusual_activity/${T}`, null],

    // ── 주식 시세 ─────────────────────────────────────────────────────
    ['주식', '실시간 시세', `securities/${T}/prices/realtime`, 'prices/realtime'],
    ['주식', '전종목 스냅샷', 'securities/snapshots', 'securities/snapshots'],
    ['주식', '일봉 이력', `securities/${T}/prices`, `securities/${T}/prices`],
    ['주식', '★ 장중 봉(intraday)', `securities/${T}/prices/intraday`, 'prices/intraday'],
    ['주식', '단일 값 조회', `securities/${T}/data_point/close_price`, 'data_point'],
    ['주식', '★ 기술지표 RSI', `securities/${T}/prices/technicals/rsi`, 'technicals/'],
    ['주식', '★ 기술지표 MACD', `securities/${T}/prices/technicals/macd`, 'technicals/macd'],
    ['주식', '★ 기술지표 ATR', `securities/${T}/prices/technicals/atr`, 'technicals/atr'],
    ['주식', '★ 기술지표 볼린저', `securities/${T}/prices/technicals/bb`, 'technicals/bb'],

    // ── 기관·내부자 ───────────────────────────────────────────────────
    ['기관', '13F 기관보유', `securities/${T}/institutional_ownership`, 'institutional_ownership'],
    ['기관', '기관 목록', 'owners', 'owners'],
    ['기관', '★ 내부자 거래(기업별)', `companies/${T}/insider_transaction_filings`, 'insider_transaction'],
    ['기관', '★ 내부자 전역 피드', 'insider_transaction_filings', 'insider_transaction_filings'],
    ['기관', '★ 소유자별 보유', 'owners/0001067983/institutional_holdings', 'institutional_holdings'],

    // ── 기업·펀더멘털 ─────────────────────────────────────────────────
    ['기업', '기업 정보', `companies/${T}`, 'companies/'],
    ['기업', '재무제표', `companies/${T}/fundamentals`, 'fundamentals'],
    ['기업', '★ SEC 파일링', `companies/${T}/filings`, '/filings'],
    ['기업', '★ 전역 파일링', 'filings', 'filings?'],
    ['기업', '뉴스', `companies/${T}/news`, 'companies/news'],
    ['기업', '★ 전체 뉴스', 'companies/news', 'companies/news'],
    ['기업', '★ 발행주식수', `companies/${T}/data_point/weightedavedilutedsharesos`, 'weightedavedilutedsharesos'],

    // ── 지수·경제 ─────────────────────────────────────────────────────
    ['지수', '주식시장 지수', 'indices/stock_market', 'indices/stock_market'],
    ['지수', '★ 경제지표', 'indices/economic', 'indices/economic'],
    ['지수', '★ SIC 산업지수', 'indices/sic', 'indices/sic'],
    ['지수', '★ 지수 구성종목', 'indices/stock_market/$SPX/constituents', 'constituents'],

    // ── 그 밖 ─────────────────────────────────────────────────────────
    ['기타', '거래소 목록', 'stock_exchanges', 'stock_exchanges'],
    ['기타', '★ 벌크 다운로드', 'bulk_downloads/links', 'bulk_downloads'],
    ['기타', '공매도 잔고(Enterprise)', `securities/${T}/short_interest`, null],
    ['기타', 'ETF 구성', `etfs/${T}/holdings`, null],
    ['기타', '배당', `securities/${T}/dividends`, null],
    ['기타', 'Zacks 애널리스트', `zacks/analyst_ratings?identifier=${T}`, null],
];

// ── 키 확보 ───────────────────────────────────────────────────────────
function getKey() {
    if (process.env.INTRINIO_API_KEY) return Promise.resolve(process.env.INTRINIO_API_KEY);
    try {
        const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
        const m = env.match(/^INTRINIO_API_KEY=(.+)$/m);
        if (m) return Promise.resolve(m[1].trim().replace(/^["']|["']$/g, ''));
    } catch { }
    // .env.local 에 없다 — Lambda 환경변수에서 (정본: .agent/ACCESS-RUNBOOK.md)
    return (async () => {
        require('dotenv').config({ path: path.join(ROOT, '.env.local'), quiet: true });
        const { LambdaClient, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
        const c = await new LambdaClient({
            region: 'us-east-1',
            credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
        }).send(new GetFunctionConfigurationCommand({ FunctionName: 'signum-flow-harvest' }));
        return c.Environment.Variables.INTRINIO_API_KEY;
    })();
}

function probe(key, p) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const url = `https://${BASE}/${p}${p.includes('?') ? '&' : '?'}api_key=${key}`;
        const req = https.get(url, { timeout: 20000 }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => resolve({ code: res.statusCode, body: d, ms: Date.now() - t0 }));
        });
        req.on('timeout', () => { req.destroy(); resolve({ code: 0, body: 'timeout', ms: Date.now() - t0 }); });
        req.on('error', (e) => resolve({ code: 0, body: e.message, ms: Date.now() - t0 }));
    });
}

/**
 * 저장소가 이 경로를 «실제로 소비»하는가.
 *
 * ⚠️ 그냥 grep 하면 안 된다. 어댑터·라우터·클라이언트는 **번역표**라서
 *    Massive→Intrinio 대응을 위해 모든 경로를 «언급»한다. 그것까지 세면
 *    안 쓰는 것도 전부 「쓰는중」으로 나온다(첫 실행에서 실제로 그랬다).
 *    → 번역층을 빼고, 그 바깥(화면·라우트·수집기 로직)에서 부르는지 본다.
 */
const TRANSLATION_LAYER = [
    'intrinio-adapter.js', 'intrinioRouter.ts', 'intrinioClient.ts',
    'massiveClient.ts', 'audit-intrinio-capabilities.js',
];
function isUsed(needle) {
    if (!needle) return null;
    try {
        const out = execSync(
            `grep -rl ${JSON.stringify(needle)} src scripts --include=*.ts --include=*.tsx --include=*.js 2>/dev/null | grep -v node_modules`,
            { cwd: ROOT, encoding: 'utf8' }
        ).trim();
        const files = out ? out.split('\n') : [];
        const real = files.filter((f) => !TRANSLATION_LAYER.some((t) => f.endsWith(t)));
        return { real, translationOnly: files.length > 0 && real.length === 0 };
    } catch { return { real: [], translationOnly: false }; }
}

(async () => {
    const key = await getKey();
    const jsonMode = process.argv.includes('--json');
    const unusedOnly = process.argv.includes('--unused');
    const rows = [];

    for (const [cat, name, p, needle] of CATALOG) {
        const r = await probe(key, p);
        const used = r.code === 200 ? isUsed(needle) : null;
        rows.push({ cat, name, path: p, code: r.code, ms: r.ms, used });
        await new Promise((z) => setTimeout(z, 120));   // 레이트리밋 여유
    }

    if (jsonMode) { console.log(JSON.stringify(rows, null, 1)); return; }

    const mark = (c) => (c === 200 ? '✅' : c === 403 ? '🔒' : c === 404 ? '⛔' : '⚠️' + c);
    let lastCat = '';
    const unused = [];
    for (const r of rows) {
        if (unusedOnly && !(r.code === 200 && r.used && r.used.real.length === 0)) continue;
        if (r.cat !== lastCat) { console.log(`\n── ${r.cat} ──`); lastCat = r.cat; }
        const u = r.code !== 200 ? '' : (r.used === null ? '' :
            (r.used.real.length ? `쓰는중 (${r.used.real.length}곳)` :
             (r.used.translationOnly ? '⬜ 번역표에만 있음 — 실사용 없음' : '⬜ 미사용')));
        console.log(`  ${mark(r.code)} ${r.name.padEnd(24)} ${String(r.ms).padStart(5)}ms  ${u}`);
        if (r.code === 200 && r.used && r.used.real.length === 0) unused.push(r);
    }

    const ok = rows.filter((r) => r.code === 200).length;
    const forbidden = rows.filter((r) => r.code === 403).length;
    console.log(`\n접근 가능 ${ok} · 권한없음 ${forbidden} · 경로없음 ${rows.filter((r) => r.code === 404).length} / 전체 ${rows.length}`);
    if (unused.length) {
        console.log(`\n⬜ 접근은 되는데 «안 쓰는» 것 ${unused.length}개:`);
        unused.forEach((r) => console.log(`   ${r.cat} · ${r.name}  →  ${r.path}`));
    }
})();
