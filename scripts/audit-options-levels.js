#!/usr/bin/env node
/**
 * audit-options-levels — 맥스페인·콜월·풋플로어 «세 갈래 대조» 검사기
 * ============================================================================
 * 왜 있나 (2026-09-25):
 *   Command 화면이 MU MAX PAIN $1000 을 보였다. 구조 API 는 1020, 나스닥 공개 체인으로
 *   직접 계산해도 1020. 원인은 «부분 체인»이 아니라 **하루 늦은 미결제약정**이었다
 *   (수집기 체인 캐시가 9/23 EOD 를 붙들고 있었다). 그리고 같은 시각 구조 API 도
 *   COST·MCD 에서 나스닥과 달랐다 — 두 엔드포인트가 서로 다른 날의 체인을 읽을 수 있었다.
 *   값은 멀쩡해 보이고 200 OK 라 화면만 봐서는 못 잡는다.
 *
 * 검사 (종목마다):
 *   ① 일관성 — /api/live/ticker 의 flow.maxPain·callWall·putFloor 가 구조 API 와 같은가,
 *      그리고 flow.levelsExpiration 이 구조 API 의 expiration 과 같은가
 *   ② 정확성 — 구조 API 의 만기 체인을 나스닥 공개 체인으로 독립 계산했을 때 같은가
 *      (맥스페인 = 행사가별 총손실 최소, 콜월 = (현물, 현물×1.2] 최대 콜 OI,
 *       풋플로어 = [현물×0.8, 현물) 최대 풋 OI — structureService 와 같은 정의·같은 현물)
 *   ③ 판본 — 구조 API 의 OI 합계(콜·풋)가 나스닥과 같은가(다르면 다른 날 EOD 다)
 *
 * 사용:
 *   node scripts/audit-options-levels.js                       # 운영(www.signumhq.com)
 *   node scripts/audit-options-levels.js --deployment <url>    # 보호된 프리뷰(vercel curl 로 우회)
 *   node scripts/audit-options-levels.js SPY NVDA MU           # 종목 지정
 * 종료 코드: 불일치가 하나라도 있으면 1. 나스닥이 응답하지 않은 종목은 SKIP(실패 아님).
 * ============================================================================
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const depIdx = args.indexOf('--deployment');
const DEPLOYMENT = depIdx >= 0 ? args[depIdx + 1] : null;
const baseIdx = args.indexOf('--base');
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : 'https://www.signumhq.com';
const TICKERS = args.filter((a, i) => !a.startsWith('--') && i !== depIdx + 1 && i !== baseIdx + 1);
const BASKET = TICKERS.length ? TICKERS.map((t) => t.toUpperCase()) : ['SPY', 'NVDA', 'AAPL', 'MU', 'COST', 'JNJ', 'MCD'];
const ETF = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'XLF', 'XLE', 'XLK', 'XLV', 'SMH', 'ARKK']);
const NQ_HEAD = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 우리 API — 프리뷰는 SSO 보호라 `vercel curl` 이 우회 토큰을 붙여 준다(Node fetch 는 로그인 302 를 잰다). */
async function ours(p) {
    if (DEPLOYMENT) {
        const out = execFileSync('vercel', ['curl', p, '--deployment', DEPLOYMENT, '--', '--silent', '--max-time', '90'], {
            cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
        });
        return JSON.parse(out.slice(out.indexOf('{')));
    }
    const r = await fetch(BASE + p, { signal: AbortSignal.timeout(90000) });
    return r.json();
}

/** structureService 와 같은 정의로 계산한다(현물도 구조 API 의 underlyingPrice 를 쓴다). */
function levels(calls, puts, spot) {
    const strikes = [...new Set([...calls.keys(), ...puts.keys()])].sort((a, b) => a - b);
    let best = null;
    for (const P of strikes) {
        let pain = 0;
        for (const [K, oi] of calls) if (P > K) pain += (P - K) * oi;
        for (const [K, oi] of puts) if (P < K) pain += (K - P) * oi;
        if (!best || pain < best[1]) best = [P, pain];
    }
    let cw = 0, cwOi = -1, pf = 0, pfOi = -1;
    for (const [K, oi] of calls) if (K > spot && K <= spot * 1.2 && oi > cwOi) { cwOi = oi; cw = K; }
    for (const [K, oi] of puts) if (K < spot && K >= spot * 0.8 && oi > pfOi) { pfOi = oi; pf = K; }
    const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
    return { maxPain: best ? best[0] : null, callWall: cw || null, putFloor: pf || null, callOI: sum(calls), putOI: sum(puts), strikes: strikes.length };
}

async function nasdaq(t, exp) {
    const num = (s) => { const v = Number(String(s ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
    for (const cls of ETF.has(t) ? ['etf', 'stocks'] : ['stocks', 'etf']) {
        const u = `https://api.nasdaq.com/api/quote/${t}/option-chain?assetclass=${cls}&limit=3000&fromdate=${exp}&todate=${exp}&excode=oprac&callput=callput&money=all&type=all`;
        const j = await fetch(u, { headers: NQ_HEAD, signal: AbortSignal.timeout(30000) }).then((r) => r.json()).catch(() => null);
        const rows = j?.data?.table?.rows || [];
        const c = new Map(), p = new Map();
        for (const r of rows) {
            const K = num(r.strike);
            if (K == null) continue;
            c.set(K, (c.get(K) || 0) + (num(r.c_Openinterest) || 0));
            p.set(K, (p.get(K) || 0) + (num(r.p_Openinterest) || 0));
        }
        if (c.size) return { calls: c, puts: p };
    }
    return null;
}

(async () => {
    console.log(`── 옵션 레벨 세 갈래 대조 · ${DEPLOYMENT ? `프리뷰 ${DEPLOYMENT}` : BASE} · ${new Date().toISOString()}`);
    let bad = 0, skipped = 0;
    for (const t of BASKET) {
        const issues = [];
        let tk, st;
        try {
            [tk, st] = [await ours(`/api/live/ticker?t=${t}&chain=0`), await ours(`/api/live/options/structure?t=${t}`)];
        } catch (e) {
            console.log(`  ${t.padEnd(5)} ✗ 호출 실패: ${e.message.split('\n')[0]}`); bad++; continue;
        }
        const f = tk?.flow || {};
        const exp = st?.expiration;
        const sOi = (st?.structure?.callsOI || []).reduce((a, b) => a + (b || 0), 0);
        const sPi = (st?.structure?.putsOI || []).reduce((a, b) => a + (b || 0), 0);
        // ① 일관성
        if (f.maxPain !== st?.maxPain) issues.push(`maxPain ticker ${f.maxPain} ≠ structure ${st?.maxPain}`);
        if ((f.callWall ?? null) !== (st?.levels?.callWall ?? null)) issues.push(`callWall ticker ${f.callWall} ≠ structure ${st?.levels?.callWall}`);
        if ((f.putFloor ?? null) !== (st?.levels?.putFloor ?? null)) issues.push(`putFloor ticker ${f.putFloor} ≠ structure ${st?.levels?.putFloor}`);
        if (f.levelsExpiration !== undefined && f.levelsExpiration !== exp) issues.push(`만기 라벨 ticker ${f.levelsExpiration} ≠ structure ${exp}`);
        // ②③ 정확성·판본
        let nq = null;
        if (exp && Number(st?.underlyingPrice) > 0) {
            const raw = await nasdaq(t, exp);
            if (raw) nq = levels(raw.calls, raw.puts, Number(st.underlyingPrice));
        }
        if (!nq) { skipped++; }
        else {
            if (nq.maxPain !== st.maxPain) issues.push(`maxPain structure ${st.maxPain} ≠ 나스닥 ${nq.maxPain}`);
            if (nq.callWall !== (st.levels?.callWall ?? null)) issues.push(`callWall structure ${st.levels?.callWall} ≠ 나스닥 ${nq.callWall}`);
            if (nq.putFloor !== (st.levels?.putFloor ?? null)) issues.push(`putFloor structure ${st.levels?.putFloor} ≠ 나스닥 ${nq.putFloor}`);
            if (nq.callOI !== sOi || nq.putOI !== sPi) issues.push(`OI 판본 structure ${sOi}/${sPi} ≠ 나스닥 ${nq.callOI}/${nq.putOI}`);
        }
        const tag = issues.length ? '✗' : (nq ? '✓' : '·');
        if (issues.length) bad++;
        console.log(`  ${t.padEnd(5)} ${tag} 만기 ${exp || '—'} · 체인 ${st?.chainDate || '?'}(${st?.debug?.chainSource || (st?.cached ? 'cache' : '?')}) · MP ${f.maxPain}/${st?.maxPain}/${nq ? nq.maxPain : '—'}`
            + ` · CW ${f.callWall}/${st?.levels?.callWall}/${nq ? nq.callWall : '—'} · PF ${f.putFloor}/${st?.levels?.putFloor}/${nq ? nq.putFloor : '—'}`
            + ` · OI ${sOi}/${sPi}${nq ? ` vs ${nq.callOI}/${nq.putOI}` : ''}`
            + ` · 라벨 ${f.levelsExpiration ?? '(없음)'}·${f.levelsChainDate ?? '(없음)'}`);
        for (const i of issues) console.log(`          └ ${i}`);
        await sleep(600);
    }
    console.log(`\n(표기: ticker/structure/나스닥) 검사 ${BASKET.length} · 불일치 ${bad} · 나스닥 미응답 SKIP ${skipped}`);
    process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERR', e); process.exit(2); });
