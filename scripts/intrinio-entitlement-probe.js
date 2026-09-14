#!/usr/bin/env node
/**
 * Intrinio «지금 이 순간» 권한 전수 확인.
 *
 * 왜: 트라이얼은 대개 전체 카탈로그를 열어준다. 정식 결제로 넘어가면 구매한 플랜만
 *     남는다 — 트라이얼 때만 되던 것에 기능을 얹어놨다면 전환 순간 조용히 죽는다.
 *     그래서 «문서에 뭐라 쓰였나»가 아니라 «우리 키로 지금 뭐가 200 인가»를 찍는다.
 *
 * 사용: INTRINIO_API_KEY=... node scripts/intrinio-entitlement-probe.js
 */
const KEY = process.env.INTRINIO_API_KEY;
if (!KEY) { console.error('INTRINIO_API_KEY 없음'); process.exit(1); }
const BASE = 'https://api-v2.intrinio.com';

const T = 'NVDA';
const PROBES = [
    ['시세', `securities/${T}/prices/realtime`, '실시간 가격(NBBO)'],
    ['시세', `securities/${T}/prices/intervals?interval_size=1m&page_size=2`, '분봉'],
    ['시세', `securities/snapshots`, '전 종목 NBBO 스냅샷 1콜'],
    ['시세', `securities/${T}/prices?page_size=2`, '일봉'],
    ['옵션', `options/expirations/${T}/eod?page_size=2`, '만기 목록(EOD)'],
    ['옵션', `options/greeks/by_ticker/${T}/realtime?page_size=2`, '★ 실시간 그릭스'],
    ['옵션', `options/unusual_activity/${T}`, 'OPRA 이상거래'],
    ['옵션', `options/snapshots`, '전 종목 옵션 스냅샷(S3)'],
    ['옵션', `options/aggregates?page_size=2`, '옵션 집계'],
    ['기업', `companies/${T}`, '회사 개요'],
    ['기업', `companies/${T}/fundamentals?page_size=2`, '펀더멘털'],
    ['기업', `companies/${T}/data_point/marketcap/number`, '재무 지표(data_point)'],
    ['기업', `companies/${T}/insider_transaction_filings?page_size=2`, '내부자 거래'],
    ['기업', `companies/${T}/institutional_ownership?page_size=2`, '13F 기관보유'],
    ['기업', `companies/${T}/dividends?page_size=2`, '배당 이력'],
    ['기업', `companies/${T}/earnings?page_size=2`, '실적 일정'],
    ['공매도', `securities/${T}/short_interest?page_size=2`, '공매도 잔고'],
    ['공매도', `securities/${T}/short_volume?page_size=2`, '공매도 거래량'],
    ['지수/거시', `indices/economic/$GDP/historical_data/level?page_size=2`, '경제지표'],
    ['지수/거시', `indices/stock_market?page_size=2`, '주가지수'],
    ['ETF', `etfs?page_size=2`, 'ETF 목록'],
    ['ETF', `etfs/${T}/stats`, 'ETF 통계'],
    ['뉴스', `companies/${T}/news?page_size=2`, '기업 뉴스'],
    ['예측', `zacks/analyst_ratings?identifier=${T}&page_size=2`, 'Zacks 애널리스트'],
    ['예측', `zacks/eps_estimates?identifier=${T}&page_size=2`, 'Zacks EPS 추정'],
];

const WS_PROVIDERS = [
    ['REALTIME', 'https://realtime-mx.intrinio.com/auth'],
    ['DELAYED_SIP', 'https://realtime-delayed-sip.intrinio.com/auth'],
    ['NASDAQ_BASIC', 'https://realtime-nasdaq.intrinio.com/auth'],
    ['IEX', 'https://realtime-mx.intrinio.com/auth'],
    ['EQUITIES_EDGE', 'https://equities-edge.intrinio.com/auth'],
    ['OPTIONS_EDGE(FMV)', 'https://options-edge.intrinio.com/auth'],
    ['OPRA_OPTIONS', 'https://realtime-options.intrinio.com/auth'],
];

async function hit(url) {
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
        let n = null;
        if (r.ok) {
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('json')) {
                const j = await r.json().catch(() => null);
                if (j && typeof j === 'object') {
                    const arrKey = Object.keys(j).find((k) => Array.isArray(j[k]));
                    n = arrKey ? j[arrKey].length : Object.keys(j).length;
                }
            } else { n = 'raw'; }
        }
        return { status: r.status, n };
    } catch (e) { return { status: 'ERR', n: e.name }; }
}

(async () => {
    // ★ 체인은 «실제 만기»로 물어야 한다. 가짜 날짜를 쓰면 404 가 떠서
    //   «권한이 없다»고 오판한다(1차 프로브가 실제로 그렇게 틀렸다).
    let realExp = null;
    try {
        const r = await fetch(`${BASE}/options/expirations/${T}/eod?api_key=${KEY}`, { signal: AbortSignal.timeout(20000) });
        const j = await r.json();
        // 과거 만기를 고르면 200 이지만 0건이라 «되는지»가 안 보인다 → 오늘 이후 «가장 가까운» 만기
        const today = new Date().toISOString().slice(0, 10);
        realExp = (j.expirations || []).filter((d) => d >= today).sort()[0] || null;
    } catch {}
    if (realExp) {
        PROBES.splice(6, 0,
            ['옵션', `options/chain/${T}/${realExp}/eod?page_size=2`, `체인 EOD + OI (만기 ${realExp})`],
            ['옵션', `options/chain/${T}/${realExp}/realtime?page_size=2`, 'OPRA 실시간 체인']);
    }
    console.log(`\nIntrinio 권한 실측 — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · 키 ${KEY.slice(0, 4)}…\n`);
    let group = '';
    const open = []; const closed = [];
    for (const [g, path, label] of PROBES) {
        if (g !== group) { console.log(`── ${g}`); group = g; }
        const sep = path.includes('?') ? '&' : '?';
        const { status, n } = await hit(`${BASE}/${path}${sep}api_key=${KEY}`);
        const ok = status === 200;
        (ok ? open : closed).push(label);
        console.log(`  ${ok ? '✅' : '⛔'} ${String(status).padEnd(5)} ${label}${ok && n !== null ? `  (${n})` : ''}`);
    }
    console.log(`\n── 실시간 피드(WebSocket auth)`);
    for (const [name, url] of WS_PROVIDERS) {
        const { status } = await hit(`${url}?api_key=${KEY}`);
        const mark = status === 200 ? '✅' : (status === 'ERR' || status === 0 ? '❔' : '⛔');
        console.log(`  ${mark} ${String(status).padEnd(5)} ${name}${mark === '❔' ? '  ← 빈 응답. «권한 없음»이 아니라 «확인 못 함»이다' : ''}`);
    }
    console.log(`\n열린 것 ${open.length} · 닫힌 것 ${closed.length}`);
    if (closed.length) console.log(`닫힌 목록: ${closed.join(' · ')}`);
    console.log('');
})();
